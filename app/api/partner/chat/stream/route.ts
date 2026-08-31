import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { careerAgent } from "@/lib/agent/career-agent";
import { createAgentContext } from "@/lib/agent/context";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }
  const limited = rateLimit(req, { windowMs: 60_000, max: 20 });
  if (limited) return limited;

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await req.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : "Invalid request.";
    return Response.json({ error: message }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      careerAgent
        .run(
          {
            message: {
              role: "user",
              content: [{ text: input.message }],
            },
          },
          {
            init: input.sessionId ? { sessionId: input.sessionId } : undefined,
            context: createAgentContext({
              userId: session.user!.id!,
              email: session.user!.email,
              requestId: randomUUID(),
            }),
            abortSignal: req.signal,
            telemetryLabels: { feature: "career-partner-stream" },
            onChunk(chunk) {
              const content = chunk.modelChunk?.content ?? [];
              content.forEach((part) => {
                if ("text" in part && part.text) {
                  send({ type: "text", text: part.text });
                } else if ("toolRequest" in part && part.toolRequest) {
                  send({
                    type: "tool",
                    status: "working",
                    name: part.toolRequest.name,
                  });
                } else if ("toolResponse" in part && part.toolResponse) {
                  send({
                    type: "tool",
                    status: "complete",
                    name: part.toolResponse.name,
                  });
                }
              });
            },
          },
        )
        .then(({ result, telemetry }) => {
          if (result.finishReason === "failed") {
            send({
              type: "error",
              error: result.error?.message ?? "Career partner turn failed.",
            });
            return;
          }
          send({
            type: "done",
            sessionId: result.sessionId,
            snapshotId: result.snapshotId,
            finishReason: result.finishReason,
            traceId: telemetry.traceId,
          });
        })
        .catch((error) => {
          send({
            type: "error",
            error:
              error instanceof Error ? error.message : "Career partner failed.",
          });
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
