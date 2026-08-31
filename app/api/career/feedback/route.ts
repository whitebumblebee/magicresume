import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  recordFeedback,
  upsertCareerPreference,
} from "@/lib/career/repository";
import { preferenceSchema } from "@/lib/career/schema";

export const runtime = "nodejs";

const requestSchema = z.object({
  applicationId: z.string().uuid().optional(),
  sessionId: z.string().max(200).optional(),
  type: z.string().min(1).max(100),
  subject: z.string().min(1).max(5000),
  decision: z.enum(["accepted", "rejected", "corrected"]),
  rationale: z.string().max(5000).optional(),
  preference: preferenceSchema.optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  try {
    const input = requestSchema.parse(await req.json());
    await recordFeedback({
      userId: session.user.id,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      type: input.type,
      subject: input.subject,
      decision: input.decision,
      rationale: input.rationale,
      preferencePatch: input.preference,
    });
    if (input.preference) {
      await upsertCareerPreference(session.user.id, input.preference);
    }
    return NextResponse.json({
      recorded: true,
      preferenceLearned: Boolean(input.preference),
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : error instanceof Error
          ? error.message
          : "Feedback update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
