import { z } from "genkit/beta";

export const agentActivitySchema = z.object({
  id: z.string(),
  type: z.enum([
    "memory_read",
    "fact_proposed",
    "fact_confirmed",
    "jd_analyzed",
    "application_built",
    "layout_checked",
    "feedback_learned",
  ]),
  label: z.string(),
  status: z.enum(["working", "complete", "needs_input", "failed"]),
  createdAt: z.string(),
});

export const careerAgentStateSchema = z.object({
  phase: z
    .enum([
      "onboarding",
      "memory",
      "clarifying",
      "tailoring",
      "review",
      "planning",
    ])
    .default("onboarding"),
  activeApplicationId: z.string().uuid().optional(),
  pendingFactIds: z.array(z.string().uuid()).default([]),
  pendingApproval: z.string().optional(),
  lastLayout: z
    .object({
      status: z.enum(["fit", "overflow"]),
      overflowPx: z.number(),
      estimatedPages: z.number().int().min(1),
      bodyPt: z.number().positive(),
    })
    .optional(),
  activity: z.array(agentActivitySchema).max(50).default([]),
});

export type CareerAgentState = z.infer<typeof careerAgentStateSchema>;

export const DEFAULT_CAREER_AGENT_STATE: CareerAgentState = {
  phase: "onboarding",
  pendingFactIds: [],
  activity: [],
};
