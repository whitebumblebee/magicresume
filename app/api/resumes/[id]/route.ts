import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";
import {
  removeSavedResumeFacts,
  syncSavedResumeFactsIfOwned,
} from "@/lib/career/saved-resume";
import { forgetMasterResumeIfDeleted } from "@/lib/career/master-resume";
import { resumes } from "@/lib/db/schema";
import { savedResumePayloadSchema } from "../route";
import { upsertPrivateTemplate } from "@/lib/templates/repository";
import {
  findOwnedApplication,
  listCareerFacts,
  summarizeCareerFacts,
} from "@/lib/career/repository";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownedResume(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }
  if (!UUID.test(id)) {
    return {
      error: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.userId, session.user.id)))
    .limit(1);
  if (!rows[0]) {
    return {
      error: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  return { row: rows[0], userId: session.user.id, db };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const found = await ownedResume(id);
  if (found.error) return found.error;
  return NextResponse.json({ resume: found.row });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const found = await ownedResume(id);
  if (found.error) return found.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = savedResumePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid resume payload." },
      { status: 400 },
    );
  }
  const { title, doc, fitConfig } = parsed.data;
  const applicationId = parsed.data.applicationId;
  if (applicationId) {
    const owned = await findOwnedApplication(
      found.userId!,
      applicationId,
      found.db!,
    );
    if (!owned) {
      return NextResponse.json(
        { error: "Unknown application." },
        { status: 400 },
      );
    }
  }
  const saved = await found.db!.transaction(async (tx) => {
    const [resume] = await tx
      .update(resumes)
      .set({
        title: title ?? found.row!.title,
        doc: { doc, fitConfig: fitConfig ?? null },
        subjectName: doc.contact.name.trim() || null,
        ...(applicationId ? { applicationId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(resumes.id, id), eq(resumes.userId, found.userId!)))
      .returning({ id: resumes.id, updatedAt: resumes.updatedAt });
    const { sync, skipped } = await syncSavedResumeFactsIfOwned({
      userId: found.userId!,
      resumeId: id,
      doc,
      confirmedOwnership: parsed.data.confirmOwnership,
      db: tx as unknown as Db,
    });
    const facts = await listCareerFacts(
      found.userId!,
      ["confirmed", "inferred", "aspirational", "rejected"],
      tx as unknown as Db,
    );
    const memory = {
      ...sync,
      summary: summarizeCareerFacts(facts),
      ownership: skipped,
    };
    await tx
      .update(resumes)
      .set({ subjectKind: skipped ? "third_party" : "self" })
      .where(eq(resumes.id, id));
    const template = await upsertPrivateTemplate({
      userId: found.userId!,
      sourceResumeId: id,
      doc,
      db: tx as unknown as Db,
    });
    return { resume, memory, template: { id: template.id } };
  });
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const found = await ownedResume(id);
  if (found.error) return found.error;
  const memory = await found.db!.transaction(async (tx) => {
    const sync = await removeSavedResumeFacts({
      userId: found.userId!,
      resumeId: id,
      db: tx as unknown as Db,
    });
    // The master pointer carries no foreign key, so clear it explicitly.
    await forgetMasterResumeIfDeleted({
      userId: found.userId!,
      resumeId: id,
      db: tx as unknown as Db,
    });
    await tx
      .delete(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, found.userId!)));
    const facts = await listCareerFacts(
      found.userId!,
      ["confirmed", "inferred", "aspirational", "rejected"],
      tx as unknown as Db,
    );
    return { ...sync, summary: summarizeCareerFacts(facts) };
  });
  return NextResponse.json({ ok: true, memory });
}
