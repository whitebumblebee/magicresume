import { NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/ai/genkit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "mr-career-partner",
    model: GEMINI_MODEL,
    vertexLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
    revision: process.env.K_REVISION ?? "local",
    time: new Date().toISOString(),
  });
}
