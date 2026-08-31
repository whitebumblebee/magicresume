import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { syncSavedResumeFactsIfOwned } from "@/lib/career/saved-resume";
import { savedResumePayloadSchema } from "../route";
import { listCareerFacts, summarizeCareerFacts } from "@/lib/career/repository";

export const runtime = "nodejs";

const backfillSchema = z
  .object({ resumeId: z.string().uuid().optional() })
  .default({});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  let input: z.infer<typeof backfillSchema>;
  try {
    const body = await req.json().catch(() => ({}));
    input = backfillSchema.parse(body);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request.")
        : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select({ id: resumes.id, doc: resumes.doc })
    .from(resumes)
    .where(
      input.resumeId
        ? and(eq(resumes.userId, userId), eq(resumes.id, input.resumeId))
        : eq(resumes.userId, userId),
    );
  if (input.resumeId && rows.length === 0) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const totals = {
    resumes: 0,
    created: 0,
    reused: 0,
    updated: 0,
    removed: 0,
    preserved: 0,
    skipped: 0,
    notOwned: 0,
  };
  for (const row of rows) {
    const payload = savedResumePayloadSchema.safeParse(row.doc);
    if (!payload.success) {
      totals.skipped += 1;
      continue;
    }
    const { sync: result, skipped } = await db.transaction((tx) =>
      syncSavedResumeFactsIfOwned({
        userId,
        resumeId: row.id,
        doc: payload.data.doc,
        db: tx as unknown as Db,
      }),
    );
    if (skipped) {
      // Someone else's saved resume: leave it saved, never remember it.
      totals.notOwned += 1;
      continue;
    }
    totals.resumes += 1;
    totals.created += result.created;
    totals.reused += result.reused;
    totals.updated += result.updated;
    totals.removed += result.removed;
    totals.preserved += result.preserved;
  }
  const facts = await listCareerFacts(userId, [
    "confirmed",
    "inferred",
    "aspirational",
    "rejected",
  ]);
  return NextResponse.json({
    backfill: totals,
    summary: summarizeCareerFacts(facts),
  });
}
