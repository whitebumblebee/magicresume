import { z } from "genkit/beta";
import { runAtsScore } from "@/lib/ats/service";
import { resumeToFactDrafts } from "@/lib/career/ingest";
import {
  createCareerFacts,
  listCareerFacts,
  listCareerPreferences,
  recordFeedback,
  setCareerFactState,
  upsertCareerPreference,
} from "@/lib/career/repository";
import {
  careerFactDraftSchema,
  careerFactSchema,
  gapItemSchema,
  groundedResumeArtifactSchema,
  jobProfileSchema,
  learningGoalSchema,
  preferenceSchema,
} from "@/lib/career/schema";
import { buildTailoredApplication } from "@/lib/career/tailor";
import { resumeDocSchema } from "@/lib/resume/schema";
import { ai } from "@/lib/ai/genkit";
import { requireAgentUserId } from "../context";

export const ingestResumeTool = ai.defineTool(
  {
    name: "ingest_resume_memory",
    description:
      "Convert an imported ResumeDoc into provisional career-memory facts. Facts remain inferred until the user confirms them.",
    inputSchema: z.object({
      doc: resumeDocSchema,
      sourceRef: z.string().default("resume-import"),
    }),
    outputSchema: z.object({
      created: z.number().int(),
      facts: z.array(careerFactSchema),
    }),
  },
  async ({ doc, sourceRef }, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    const drafts = resumeToFactDrafts(doc, sourceRef);
    const facts = await createCareerFacts(userId, drafts);
    return { created: drafts.length, facts };
  },
);

export const getCareerContextTool = ai.defineTool(
  {
    name: "get_career_context",
    description:
      "Retrieve the authenticated user's career facts and learned preferences before answering or tailoring.",
    inputSchema: z.object({
      includeInferred: z.boolean().default(true),
      includeAspirational: z.boolean().default(true),
    }),
    outputSchema: z.object({
      facts: z.array(careerFactSchema),
      preferences: z.array(preferenceSchema),
    }),
  },
  async ({ includeInferred, includeAspirational }, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    const states: Array<"confirmed" | "inferred" | "aspirational"> = [
      "confirmed",
    ];
    if (includeInferred) states.push("inferred");
    if (includeAspirational) states.push("aspirational");
    const [facts, preferences] = await Promise.all([
      listCareerFacts(userId, states),
      listCareerPreferences(userId),
    ]);
    return { facts, preferences };
  },
);

export const proposeCareerFactTool = ai.defineTool(
  {
    name: "propose_career_fact",
    description:
      "Save a fact supported by the user's current conversation as provisional memory. It remains inferred and cannot enter applications until the user confirms it.",
    inputSchema: careerFactDraftSchema,
    outputSchema: z.object({
      created: z.boolean(),
      fact: careerFactSchema,
      needsConfirmation: z.literal(true),
    }),
  },
  async (input, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    const facts = await createCareerFacts(userId, [
      {
        ...input,
        state: "inferred",
        sources:
          input.sources.length > 0
            ? input.sources
            : [
                {
                  type: "conversation",
                  excerpt: input.description,
                  metadata: {},
                },
              ],
      },
    ]);
    const created = facts.find(
      (fact) =>
        fact.state === "inferred" &&
        fact.title === input.title &&
        fact.description === input.description,
    );
    if (!created) throw new Error("Provisional fact was not persisted.");
    return { created: true, fact: created, needsConfirmation: true as const };
  },
);

const confirmationSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const reviewCareerFactTool = ai.defineTool(
  {
    name: "review_career_fact",
    description:
      "Ask for explicit human approval before confirming or rejecting a provisional career fact.",
    inputSchema: z.object({
      factId: z.string().uuid(),
      proposedState: z.enum(["confirmed", "rejected"]),
      summary: z.string(),
    }),
    outputSchema: z.object({
      applied: z.boolean(),
      fact: careerFactSchema.nullable(),
      reason: z.string().optional(),
    }),
  },
  async (input, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    if (!ctx.resumed) {
      ctx.interrupt({
        type: "career_fact_approval",
        factId: input.factId,
        proposedState: input.proposedState,
        summary: input.summary,
      });
    }
    const decision = confirmationSchema.parse(ctx.resumed);
    if (!decision.approved) {
      return {
        applied: false,
        fact: null,
        reason: decision.reason ?? "User declined the change.",
      };
    }
    const fact = await setCareerFactState(
      userId,
      input.factId,
      input.proposedState,
    );
    return {
      applied: Boolean(fact),
      fact,
      reason: decision.reason,
    };
  },
);

export const learnPreferenceTool = ai.defineTool(
  {
    name: "learn_career_preference",
    description:
      "Persist an explicit user correction or preference so future applications honor it. Never infer a preference from silence.",
    inputSchema: preferenceSchema,
    outputSchema: preferenceSchema,
  },
  async (input, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    return upsertCareerPreference(userId, input);
  },
);

export const buildApplicationTool = ai.defineTool(
  {
    name: "build_tailored_application",
    description:
      "Analyze a JD, retrieve confirmed evidence, generate a truthful application resume, private aspirational target resume, and gap-closing plan.",
    inputSchema: z.object({
      rawJobDescription: z.string().min(80),
      // No baseDoc: composed from the user's master resume and profile so the
      // agent cannot tailor from an unrelated document.
      sourceResumeId: z.string().uuid().optional(),
      sessionId: z.string().optional(),
    }),
    outputSchema: z.object({
      applicationId: z.string().uuid(),
      jobProfile: jobProfileSchema,
      gaps: z.array(gapItemSchema),
      goals: z.array(learningGoalSchema),
      application: groundedResumeArtifactSchema,
      target: groundedResumeArtifactSchema,
      rationale: z.string(),
    }),
  },
  async (input, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    return buildTailoredApplication({ userId, ...input });
  },
);

export const observeLayoutTool = ai.defineTool(
  {
    name: "observe_browser_layout",
    description:
      "Consume the browser pretext fit oracle's deterministic layout result and decide whether content revision or user approval is needed.",
    inputSchema: z.object({
      applicationId: z.string().uuid().optional(),
      status: z.enum(["fit", "overflow"]),
      overflowPx: z.number().min(0),
      estimatedPages: z.number().int().min(1),
      bodyPt: z.number().positive(),
    }),
    outputSchema: z.object({
      action: z.enum(["ready", "compress", "ask_user"]),
      message: z.string(),
    }),
  },
  async (input, ctx) => {
    requireAgentUserId(ctx.context);
    if (input.status === "fit") {
      return {
        action: "ready" as const,
        message: `The application fits one page at ${input.bodyPt.toFixed(2)}pt.`,
      };
    }
    if (input.bodyPt > 8.5 || input.estimatedPages === 2) {
      return {
        action: "compress" as const,
        message:
          "The draft overflows. Propose grounded shortening edits, then re-run the browser fit oracle.",
      };
    }
    return {
      action: "ask_user" as const,
      message:
        "The resume still overflows at the readability floor. Ask the user which low-priority evidence may be omitted.",
    };
  },
);

export const scoreResumeTool = ai.defineTool(
  {
    name: "score_truthful_resume",
    description:
      "Run deterministic ATS checks and the Gemini rubric against a grounded application resume.",
    inputSchema: z.object({
      doc: resumeDocSchema,
      jd: z.string().optional(),
      fit: z
        .object({
          status: z.enum(["fit", "overflow"]),
          bodyPt: z.number().positive(),
        })
        .optional(),
    }),
    outputSchema: z.unknown(),
  },
  async ({ doc, fit, jd }) => runAtsScore(doc, fit, jd),
);

export const recordFeedbackTool = ai.defineTool(
  {
    name: "record_application_feedback",
    description:
      "Record an explicit accept/reject/correction event and optionally persist the user's stated preference.",
    inputSchema: z.object({
      applicationId: z.string().uuid().optional(),
      sessionId: z.string().optional(),
      type: z.string(),
      subject: z.string(),
      decision: z.enum(["accepted", "rejected", "corrected"]),
      rationale: z.string().optional(),
      preference: preferenceSchema.optional(),
    }),
    outputSchema: z.object({
      recorded: z.boolean(),
      preferenceLearned: z.boolean(),
    }),
  },
  async (input, ctx) => {
    const userId = requireAgentUserId(ctx.context);
    await recordFeedback({
      userId,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
      type: input.type,
      subject: input.subject,
      decision: input.decision,
      rationale: input.rationale,
      preferencePatch: input.preference,
    });
    if (input.preference) {
      await upsertCareerPreference(userId, input.preference);
    }
    return {
      recorded: true,
      preferenceLearned: Boolean(input.preference),
    };
  },
);

export const careerTools = [
  ingestResumeTool,
  getCareerContextTool,
  proposeCareerFactTool,
  reviewCareerFactTool,
  learnPreferenceTool,
  buildApplicationTool,
  observeLayoutTool,
  scoreResumeTool,
  recordFeedbackTool,
];
