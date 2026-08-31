import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { runCareerPartnerTurn } from "@/lib/agent/career-agent";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const limited = rateLimit(req, { windowMs: 60_000, max: 20 });
  if (limited) return limited;

  try {
    const input = requestSchema.parse(await req.json());
    const result = await runCareerPartnerTurn({
      userId: session.user.id,
      email: session.user.email,
      message: input.message,
      sessionId: input.sessionId,
      requestId: randomUUID(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : error instanceof Error
          ? error.message
          : "Career partner failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
