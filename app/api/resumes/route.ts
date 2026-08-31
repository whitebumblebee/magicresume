import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";
import { syncSavedResumeFactsIfOwned } from "@/lib/career/saved-resume";
import { resolveMasterResume } from "@/lib/career/master-resume";
import {
  findOwnedApplication,
  listCareerFacts,
  summarizeCareerFacts,
} from "@/lib/career/repository";
import { resumes } from "@/lib/db/schema";
import { resumeDocSchema } from "@/lib/resume/schema";
import { upsertPrivateTemplate } from "@/lib/templates/repository";

export const runtime = "nodejs";

/** Stored resume payload: the doc plus the fit config the user last saw. */
export const savedResumePayloadSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  doc: resumeDocSchema,
  fitConfig: z
    .object({
      sizeScale: z.number(),
      lineHeight: z.number(),
      spacingScale: z.number(),
      marginScale: z.number(),
      marginXScale: z.number().optional(),
      marginYScale: z.number().optional(),
      columnRatioScale: z.number().optional(),
      columnGapScale: z.number().optional(),
      regionPaddingXScale: z.number().optional(),
      regionPaddingYScale: z.number().optional(),
      inlineGapScale: z.number().optional(),
      placementOverrides: z.record(z.string(), z.string()).optional(),
      contactLayoutOverride: z.enum(["inline", "stacked"]).optional(),
    })
    .nullable()
    .optional(),
  /** Explicit "this resume is mine" acknowledgement for a partial name match. */
  confirmOwnership: z.boolean().optional(),
  /** Set when this resume was generated for a specific job application. */
  applicationId: z.string().uuid().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;
  const db = getDb();
  const rows = await db
    .select({
      id: resumes.id,
      title: resumes.title,
      subjectKind: resumes.subjectKind,
      subjectName: resumes.subjectName,
      applicationId: resumes.applicationId,
      shareSlug: resumes.shareSlug,
      isPublic: resumes.isPublic,
      updatedAt: resumes.updatedAt,
    })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.updatedAt))
    .limit(100);
  const master = await resolveMasterResume(userId, db);
  return NextResponse.json({
    resumes: rows.map((row) => ({
      ...row,
      isMaster: row.id === master.resumeId && master.source === "master",
    })),
    master: {
      resumeId: master.source === "master" ? master.resumeId : null,
      // Which document currently supplies design/contact for generated resumes.
      effectiveResumeId: master.resumeId,
      source: master.source,
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;
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
  const db = getDb();
  const applicationId: string | null = parsed.data.applicationId ?? null;
  if (applicationId) {
    const owned = await findOwnedApplication(userId, applicationId, db);
    if (!owned) {
      return NextResponse.json(
        { error: "Unknown application." },
        { status: 400 },
      );
    }
  }
  const saved = await db.transaction(async (tx) => {
    const [resume] = await tx
      .insert(resumes)
      .values({
        userId,
        title: title ?? defaultTitle(doc.contact.name),
        doc: { doc, fitConfig: fitConfig ?? null },
        subjectName: doc.contact.name.trim() || null,
        applicationId,
      })
      .returning({ id: resumes.id, title: resumes.title });
    const { sync, skipped } = await syncSavedResumeFactsIfOwned({
      userId,
      resumeId: resume.id,
      doc,
      confirmedOwnership: parsed.data.confirmOwnership,
      db: tx as unknown as Db,
    });
    const facts = await listCareerFacts(
      userId,
      ["confirmed", "inferred", "aspirational", "rejected"],
      tx as unknown as Db,
    );
    const memory = {
      ...sync,
      summary: summarizeCareerFacts(facts),
      ownership: skipped,
    };
    // A refused memory sync means this document belongs to someone else. The
    // resume stays saved and fully editable; it is just filed separately.
    if (skipped) {
      await tx
        .update(resumes)
        .set({ subjectKind: "third_party" })
        .where(eq(resumes.id, resume.id));
    }
    const template = await upsertPrivateTemplate({
      userId,
      sourceResumeId: resume.id,
      doc,
      db: tx as unknown as Db,
    });
    return { resume, memory, template: { id: template.id } };
  });
  return NextResponse.json(saved, { status: 201 });
}

function defaultTitle(name: string): string {
  return name.trim() ? `${name.trim()}'s resume` : "Untitled resume";
}
