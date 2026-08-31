import { NextResponse } from "next/server";
import { llmConfigured, missingKeyMessage } from "@/lib/llm/client";
import { runCompressResume } from "@/lib/compress/service";
import { resumeDocSchema } from "@/lib/resume/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimit(req, { windowMs: 60_000, max: 6 });
  if (limited) return limited;

  if (!llmConfigured()) {
    return NextResponse.json({ error: missingKeyMessage() }, { status: 503 });
  }

  let body: { doc?: unknown; fit?: { overflowPx?: number; bodyPt?: number } };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = resumeDocSchema.safeParse(body.doc);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid resume document." },
      { status: 400 },
    );
  }

  const fit = body.fit ?? {};
  if (typeof fit.overflowPx !== "number" || typeof fit.bodyPt !== "number") {
    return NextResponse.json(
      { error: "Expected fit info (overflowPx, bodyPt)." },
      { status: 400 },
    );
  }

  try {
    const edits = await runCompressResume(parsed.data, {
      overflowPx: fit.overflowPx,
      bodyPt: fit.bodyPt,
    });
    return NextResponse.json({ edits });
  } catch (err) {
    console.error("compress-resume failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Compression failed: ${err.message}`
            : "Compression failed.",
      },
      { status: 502 },
    );
  }
}
