import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createAgentContext } from "@/lib/agent/context";
import { observeLayoutTool } from "@/lib/agent/tools";

export const runtime = "nodejs";

const requestSchema = z.object({
  applicationId: z.string().uuid().optional(),
  status: z.enum(["fit", "overflow"]),
  overflowPx: z.number().min(0),
  estimatedPages: z.number().int().min(1),
  bodyPt: z.number().positive(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  try {
    const input = requestSchema.parse(await req.json());
    const output = await observeLayoutTool.run(input, {
      context: createAgentContext({
        userId: session.user.id,
        email: session.user.email,
        requestId: randomUUID(),
      }),
      telemetryLabels: { feature: "browser-fit-oracle" },
    });
    return NextResponse.json({
      ...output.result,
      traceId: output.telemetry.traceId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Layout observation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
