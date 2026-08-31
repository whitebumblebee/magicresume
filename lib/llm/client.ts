import { z } from "zod";
import { ai, careerModel, vertexConfigured } from "@/lib/ai/genkit";
import {
  recordGenerationTelemetry,
  thinkingConfigFor,
  type TaskProfile,
} from "@/lib/ai/profiles";

/**
 * Structured generation compatibility layer for the imported MagicResume
 * services. All calls run through Genkit + Vertex AI Gemini 3.7 Flash.
 */

export interface GeminiPart {
  text?: string;
  /** data URL (data:image/jpeg;base64,…) */
  dataUrl?: string;
}

export interface StructuredArgs<T = unknown> {
  system: string;
  parts: GeminiPart[];
  schema: z.ZodType<T>;
  profile: TaskProfile;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxAttempts?: 1 | 2;
}

export type Provider = "vertex-gemini" | null;

export function activeProvider(): Provider {
  return vertexConfigured() ? "vertex-gemini" : null;
}

export function llmConfigured(): boolean {
  return activeProvider() !== null;
}

export function missingKeyMessage(): string {
  return "Vertex AI is not configured — set GOOGLE_CLOUD_PROJECT and Application Default Credentials (or VERTEX_API_KEY for express mode).";
}

/** Generate structured JSON output validated by `schema`. Retries once on
 * transient failures; schema violations surface immediately. */
export async function generateStructured<T>(
  args: StructuredArgs<T>,
): Promise<T> {
  const provider = activeProvider();
  if (!provider) throw new Error(missingKeyMessage());

  const prompt = args.parts.map((part) =>
    part.text !== undefined
      ? { text: part.text }
      : {
          media: {
            url: part.dataUrl!,
            contentType: part.dataUrl!.slice(5, part.dataUrl!.indexOf(";")),
          },
        },
  );
  let lastError: unknown = null;
  const maxAttempts = args.maxAttempts ?? 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
          prompt,
          output: { schema: args.schema },
          config: {
            maxOutputTokens: args.maxOutputTokens ?? 16384,
            temperature: 0.2,
            ...thinkingConfigFor(args.profile),
          },
        }),
        args.timeoutMs ?? 60_000,
      );
      usage = response.usage;
      if (response.output === null || response.output === undefined) {
        throw new Error("Gemini returned no structured output.");
      }
      const parsed = args.schema.parse(response.output) as T;
      const layout =
        parsed && typeof parsed === "object" && "layout" in parsed
          ? (
              parsed as {
                layout?: {
                  confidence?: number;
                  unsupportedFeatures?: unknown[];
                };
              }
            ).layout
          : undefined;
      recordGenerationTelemetry({
        profile: args.profile,
        attempt,
        latencyMs: Date.now() - startedAt,
        validation: "passed",
        retry: attempt > 1,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
        confidence: layout?.confidence,
        unsupportedFeatures: layout?.unsupportedFeatures?.length,
      });
      return parsed;
    } catch (error) {
      lastError = error;
      recordGenerationTelemetry({
        profile: args.profile,
        attempt,
        latencyMs: Date.now() - startedAt,
        validation: "failed",
        retry: attempt > 1,
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
      if (
        error instanceof z.ZodError ||
        (error instanceof Error && error.message.includes("INVALID_ARGUMENT"))
      ) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM call failed");
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
