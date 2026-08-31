import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteCareerFact,
  listCareerFacts,
  setCareerFactState,
  summarizeCareerFacts,
  syncImportedResumeFacts,
  updateCareerFact,
} from "@/lib/career/repository";
import { CareerMemoryOwnershipError } from "@/lib/career/identity";
import { getDb, type Db } from "@/lib/db";
import { resumeDocSchema } from "@/lib/resume/schema";

export const runtime = "nodejs";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ingest"),
    doc: resumeDocSchema,
    sourceType: z
      .enum(["resume_pdf", "resume_screenshot"])
      .default("resume_pdf"),
    /** Explicit "this resume is mine" acknowledgement for a partial match. */
    confirmOwnership: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("set-state"),
    factId: z.string().uuid(),
    state: z.enum(["confirmed", "rejected"]),
  }),
  z.object({
    action: z.literal("update"),
    factId: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    skills: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    metrics: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
    userNote: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("delete"),
    factId: z.string().uuid(),
  }),
]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in is required." },
      { status: 401 },
    );
  }
  const facts = await listCareerFacts(session.user.id, [
    "confirmed",
    "inferred",
    "aspirational",
    "rejected",
  ]);
  return NextResponse.json({ facts, summary: summarizeCareerFacts(facts) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in is required." },
      { status: 401 },
    );
  }
  const userId = session.user.id;
  try {
    const input = mutationSchema.parse(await req.json());
    if (input.action === "ingest") {
      const db = getDb();
      const result = await db.transaction((tx) =>
        syncImportedResumeFacts({
          userId,
          doc: input.doc,
          sourceType: input.sourceType,
          confirmedOwnership: input.confirmOwnership,
          db: tx as unknown as Db,
        }),
      );
      return NextResponse.json(result);
    }
    if (input.action === "update") {
      const fact = await updateCareerFact({
        userId,
        factId: input.factId,
        title: input.title,
        description: input.description,
        skills: input.skills,
        metrics: input.metrics,
        userNote: input.userNote,
      });
      if (!fact) {
        return NextResponse.json({ error: "Fact not found." }, { status: 404 });
      }
      const facts = await listCareerFacts(userId, [
        "confirmed",
        "inferred",
        "aspirational",
        "rejected",
      ]);
      return NextResponse.json({
        fact,
        facts,
        summary: summarizeCareerFacts(facts),
      });
    }

    if (input.action === "delete") {
      const removed = await deleteCareerFact({ userId, factId: input.factId });
      if (!removed) {
        return NextResponse.json({ error: "Fact not found." }, { status: 404 });
      }
      const facts = await listCareerFacts(userId, [
        "confirmed",
        "inferred",
        "aspirational",
        "rejected",
      ]);
      return NextResponse.json({
        deleted: input.factId,
        facts,
        summary: summarizeCareerFacts(facts),
      });
    }

    const fact = await setCareerFactState(userId, input.factId, input.state);
    if (!fact) {
      return NextResponse.json({ error: "Fact not found." }, { status: 404 });
    }
    const facts = await listCareerFacts(userId, [
      "confirmed",
      "inferred",
      "aspirational",
      "rejected",
    ]);
    return NextResponse.json({
      fact,
      facts,
      summary: summarizeCareerFacts(facts),
    });
  } catch (error) {
    // Another person's resume is a normal, explainable outcome — not a fault.
    if (error instanceof CareerMemoryOwnershipError) {
      return NextResponse.json(
        { error: error.message, ownership: error.assessment },
        { status: 409 },
      );
    }
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request.")
        : error instanceof Error
          ? error.message
          : "Career memory update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
