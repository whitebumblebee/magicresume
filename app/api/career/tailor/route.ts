import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { buildTailoredApplication } from "@/lib/career/tailor";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const requestSchema = z.object({
  rawJobDescription: z.string().trim().min(80).max(100_000),
  // Deliberately absent: the base document is composed server-side from the
  // user's master resume and profile, not from the editor's current contents.
  sourceResumeId: z.string().uuid().optional(),
  sessionId: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in is required." },
      { status: 401 },
    );
  }
  const limited = rateLimit(req, { windowMs: 60_000, max: 5 });
  if (limited) return limited;

  try {
    const input = requestSchema.parse(await req.json());
    const result = await buildTailoredApplication({
      userId: session.user.id,
      ...input,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? "Invalid request.")
        : error instanceof Error
          ? error.message
          : "Application tailoring failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
