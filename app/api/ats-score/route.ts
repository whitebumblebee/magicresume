import { NextResponse } from "next/server";
import { runAtsScore } from "@/lib/ats/service";
import { resumeDocSchema } from "@/lib/resume/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimit(req, { windowMs: 60_000, max: 8 });
  if (limited) return limited;

  let body: {
    doc?: unknown;
    fit?: { status?: string; bodyPt?: number };
    jd?: string;
  };
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

  const fitStatus = body.fit?.status;
  const fit =
    fitStatus === "fit" || fitStatus === "overflow"
      ? {
          status: fitStatus as "fit" | "overflow",
          bodyPt:
            typeof body.fit?.bodyPt === "number" ? body.fit.bodyPt : undefined,
        }
      : undefined;

  try {
    const report = await runAtsScore(parsed.data, fit, body.jd);
    return NextResponse.json(report);
  } catch (err) {
    console.error("ats-score failed", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Scoring failed: ${err.message}`
            : "Scoring failed.",
      },
      { status: 502 },
    );
  }
}
