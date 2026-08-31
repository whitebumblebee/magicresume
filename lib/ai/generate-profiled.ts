import { z } from "zod";
import { ai, careerModel } from "./genkit";
import {
  recordGenerationTelemetry,
  thinkingConfigFor,
  type TaskProfile,
} from "./profiles";

export async function generateProfiled<Schema extends z.ZodTypeAny>(args: {
  profile: TaskProfile;
  system: string;
  prompt: string;
  schema: Schema;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs?: number;
}): Promise<z.output<Schema>> {
  const startedAt = Date.now();
  let usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined;
  try {
    const response = await withTimeout(
      ai.generate({
        model: careerModel,
        system: args.system,
        prompt: args.prompt,
        output: { schema: args.schema },
        config: {
          temperature: args.temperature,
          maxOutputTokens: args.maxOutputTokens,
          ...thinkingConfigFor(args.profile),
        },
      }),
      args.timeoutMs ?? 90_000,
    );
    usage = response.usage;
    if (response.output === null || response.output === undefined) {
      throw new Error("Gemini returned no structured output.");
    }
    const output = args.schema.parse(response.output);
    recordGenerationTelemetry({
      profile: args.profile,
      attempt: 1,
      latencyMs: Date.now() - startedAt,
      validation: "passed",
      retry: false,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
    });
    return output;
  } catch (error) {
    recordGenerationTelemetry({
      profile: args.profile,
      attempt: 1,
      latencyMs: Date.now() - startedAt,
      validation: "failed",
      retry: false,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      errorType:
        error instanceof z.ZodError
          ? "schema"
          : error instanceof Error
            ? error.name
            : "unknown",
    });
    throw error;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Gemini timed out after ${timeoutMs}ms.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
