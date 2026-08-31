import { GEMINI_MODEL } from "./genkit";

export type TaskProfile =
  | "resume-import"
  | "layout-retry"
  | "ats-readiness"
  | "resume-compression"
  | "career-jd"
  | "career-gap"
  | "career-artifacts"
  | "career-partner";

/** Gemini 3.7 Flash supports exactly LOW, MEDIUM, and HIGH. */
export type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

const THINKING_LEVELS: Record<TaskProfile, ThinkingLevel> = {
  "resume-import": "LOW",
  "layout-retry": "HIGH",
  "ats-readiness": "LOW",
  "resume-compression": "LOW",
  "career-jd": "MEDIUM",
  "career-gap": "HIGH",
  "career-artifacts": "HIGH",
  "career-partner": "MEDIUM",
};

export function thinkingLevelFor(profile: TaskProfile): ThinkingLevel {
  return THINKING_LEVELS[profile];
}

export function thinkingConfigFor(profile: TaskProfile) {
  return {
    thinkingConfig: {
      thinkingLevel: thinkingLevelFor(profile),
    },
  } as const;
}

export interface GenerationTelemetry {
  profile: TaskProfile;
  attempt: number;
  latencyMs: number;
  validation: "passed" | "failed";
  retry: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  confidence?: number;
  unsupportedFeatures?: number;
  errorType?: string;
}

export function recordGenerationTelemetry(event: GenerationTelemetry): void {
  console.info("mr_ai_generation", {
    model: GEMINI_MODEL,
    thinkingLevel: thinkingLevelFor(event.profile),
    ...event,
  });
}
