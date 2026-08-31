import { createCareerSessionStore, ai, careerModel } from "@/lib/ai/genkit";
import { thinkingConfigFor } from "@/lib/ai/profiles";
import { createAgentContext } from "./context";
import { careerAgentStateSchema, type CareerAgentState } from "./state";
import { careerTools } from "./tools";

export const CAREER_PARTNER_SYSTEM = [
  "You are MagicResume, an evidence-first long-term career partner.",
  "Your job is to understand the user's evolving career, ask focused clarifying questions, and help them build truthful applications and concrete skill-gap plans.",
  "",
  "Operating rules:",
  "1. Retrieve career context before making claims about the user.",
  "2. Ask one high-value question at a time. Prefer ownership, scope, outcome, constraints, and evidence. Do not pressure the user to invent a metric when a qualitative outcome is truthful.",
  "3. When the user supplies a coherent accomplishment, use propose_career_fact to save it as provisional memory. Inferred facts are provisional; use review_career_fact and explicit approval before confirming or rejecting them.",
  "4. Never place inferred, rejected, or aspirational claims in an application resume.",
  "5. Aspirational skills belong only in the private target-state artifact and preparation plan.",
  "6. Never imply that MagicResume guarantees interviews, bypasses ATS systems, or makes an unqualified person qualified.",
  "7. When a gap is large, recommend preparing first while still explaining transferable strengths.",
  "8. Learn preferences only from explicit corrections or choices, never from silence.",
  "9. Use tools to mutate data; do not claim something was saved, scored, fitted, or generated unless the corresponding tool succeeded.",
  "10. Explain trade-offs concisely and preserve user agency for destructive edits.",
].join("\n");

export const careerAgent = ai.defineAgent({
  name: "mrCareerPartner",
  model: careerModel,
  system: CAREER_PARTNER_SYSTEM,
  tools: careerTools,
  stateSchema: careerAgentStateSchema,
  store: createCareerSessionStore<CareerAgentState>(),
  config: {
    temperature: 0.2,
    maxOutputTokens: 16384,
    ...thinkingConfigFor("career-partner"),
  },
});

export interface CareerTurnResult {
  sessionId?: string;
  snapshotId?: string;
  text: string;
  finishReason?: string;
  state?: CareerAgentState;
  traceId: string;
}

export async function runCareerPartnerTurn(args: {
  userId: string;
  email?: string | null;
  message: string;
  sessionId?: string;
  requestId?: string;
}): Promise<CareerTurnResult> {
  const result = await careerAgent.run(
    {
      message: {
        role: "user",
        content: [{ text: args.message }],
      },
    },
    {
      init: args.sessionId ? { sessionId: args.sessionId } : undefined,
      context: createAgentContext({
        userId: args.userId,
        email: args.email,
        requestId: args.requestId,
      }),
      telemetryLabels: {
        feature: "career-partner",
        taskProfile: "career-partner",
      },
    },
  );
  const output = result.result;
  if (output.finishReason === "failed") {
    throw new Error(output.error?.message ?? "Career partner turn failed.");
  }
  const text =
    output.message?.content
      .map((part) => ("text" in part ? part.text : ""))
      .filter(Boolean)
      .join("") ?? "";
  return {
    sessionId: output.sessionId,
    snapshotId: output.snapshotId,
    text,
    finishReason: output.finishReason,
    state: output.state?.custom,
    traceId: result.telemetry.traceId,
  };
}
