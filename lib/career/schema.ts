import { z } from "zod";
import { resumeDocSchema, type ResumeDoc } from "@/lib/resume/schema";
import {
  engagementOrganizationDisplay,
  entryOrganizationDisplay,
  walkEngagements,
} from "@/lib/resume/engagements";

export const factKindSchema = z.enum([
  "experience",
  "project",
  "skill",
  "education",
  "certification",
  "award",
  "achievement",
  "career_transition",
  "other",
]);

export const factStateSchema = z.enum([
  "inferred",
  "confirmed",
  "aspirational",
  "rejected",
]);

/**
 * Facts the user actually supplied, whether or not they have clicked confirm.
 *
 * The product does not verify employment history — an interviewer does. So a
 * fact extracted from the user's own resume, or stated by them, is trusted for
 * an exportable application. Confirmation is optional reassurance.
 *
 * What this still excludes is the part that matters: `aspirational` facts are
 * things the user has not done yet and belong only in the watermarked target
 * preview, and `rejected` facts were explicitly disowned. Combined with the
 * per-field claim check, the model can select and reorder the user's own
 * material but cannot invent or inflate it.
 */
export function isUserClaimedFact(fact: {
  state: z.infer<typeof factStateSchema>;
}): boolean {
  return fact.state === "confirmed" || fact.state === "inferred";
}

export const sourceTypeSchema = z.enum([
  "resume_pdf",
  "resume_screenshot",
  "saved_resume",
  "conversation",
  "user_edit",
  "link",
  "agent_inference",
]);

export const evidenceStrengthSchema = z.enum([
  "narrative",
  "metric",
  "artifact",
  "source",
]);

export const factSourceSchema = z.object({
  id: z.string().uuid(),
  type: sourceTypeSchema,
  excerpt: z.string().min(1),
  reference: z.string().optional(),
  key: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const factSourceDraftSchema = factSourceSchema.omit({ id: true });

export const careerFactSchema = z.object({
  id: z.string().uuid(),
  kind: factKindSchema,
  title: z.string().min(1),
  organization: z.string().optional(),
  description: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  skills: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  state: factStateSchema,
  /** User instruction the agent should honour when using this item. */
  userNote: z.string().nullable().optional(),
  /** Present when the user rewrote the wording themselves. */
  editedAt: z.union([z.string(), z.date()]).nullable().optional(),
  qualityScore: z.number().int().min(0).max(100).default(0),
  evidenceStrength: z.array(evidenceStrengthSchema).default([]),
  sources: z.array(factSourceSchema).default([]),
});

export const careerFactDraftSchema = careerFactSchema
  .omit({ id: true, sources: true })
  .extend({
    state: factStateSchema.default("inferred"),
    sources: z.array(factSourceDraftSchema).default([]),
  });

export const preferenceSchema = z.object({
  category: z.enum([
    "voice",
    "content",
    "role",
    "format",
    "integrity",
    "workflow",
  ]),
  key: z.string().min(1),
  value: z.unknown(),
  learnedFrom: z.string().min(1),
  active: z.boolean().default(true),
});

export const jobRequirementSchema = z.object({
  capability: z.string().min(1),
  importance: z.enum(["must_have", "nice_to_have"]),
  evidenceHint: z.string().min(1),
});

export const jobProfileSchema = z.object({
  title: z.string().min(1),
  company: z.string().optional(),
  seniority: z.string().optional(),
  summary: z.string().min(1),
  requirements: z.array(jobRequirementSchema),
  keywords: z.array(z.string()),
});

export const gapStateSchema = z.enum([
  "demonstrated",
  "transferable",
  "currently_learning",
  "missing",
]);

export const gapItemSchema = z.object({
  capability: z.string().min(1),
  importance: z.enum(["must_have", "nice_to_have"]),
  state: gapStateSchema,
  sourceFactIds: z.array(z.string().uuid()).default([]),
  rationale: z.string().min(1),
  recommendation: z.string().min(1),
});

export const learningTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  completionEvidence: z.string().min(1),
  status: z.enum(["planned", "in_progress", "completed"]).default("planned"),
});

export const learningGoalSchema = z.object({
  id: z.string().uuid(),
  capability: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["planned", "in_progress", "completed", "dismissed"]),
  tasks: z.array(learningTaskSchema),
});

export const claimModeSchema = z.enum([
  "confirmed",
  "currently_learning",
  "aspirational",
]);

export const groundedClaimSchema = z.object({
  path: z.string().min(1),
  text: z.string().min(1),
  sourceFactIds: z.array(z.string().uuid()).min(1),
  mode: claimModeSchema,
});

export const groundedResumeArtifactSchema = z.object({
  kind: z.enum(["application", "target"]),
  doc: resumeDocSchema,
  claims: z.array(groundedClaimSchema),
  exportable: z.boolean(),
  watermark: z.string().optional(),
});

export type CareerFact = z.infer<typeof careerFactSchema>;
export type CareerFactDraft = z.infer<typeof careerFactDraftSchema>;
export type CareerPreference = z.infer<typeof preferenceSchema>;
export type JobProfile = z.infer<typeof jobProfileSchema>;
export type GapItem = z.infer<typeof gapItemSchema>;
export type LearningGoal = z.infer<typeof learningGoalSchema>;
export type GroundedResumeArtifact = z.infer<
  typeof groundedResumeArtifactSchema
>;

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
}

/**
 * Every generated factual field is represented by a stable path so model
 * output can be checked against canonical career facts before persistence.
 * Contact fields are user profile data and are intentionally outside this
 * career-claim check.
 */
export function collectGroundableText(doc: ResumeDoc): Map<string, string> {
  const fields = new Map<string, string>();
  if (doc.headline?.trim()) fields.set("headline", doc.headline.trim());
  if (doc.summary?.trim()) fields.set("summary", doc.summary.trim());

  doc.sections.forEach((section, sectionIndex) => {
    section.entries.forEach((entry, entryIndex) => {
      const prefix = `sections.${sectionIndex}.entries.${entryIndex}`;
      const scalarFields = [
        ["heading", entry.heading],
        ["subheading", entryOrganizationDisplay(entry)],
        ["dateRange", entry.dateRange],
        ["location", entry.location],
        ["narrative", entry.narrative ?? ""],
      ] as const;
      scalarFields.forEach(([name, value]) => {
        if (value?.trim()) fields.set(`${prefix}.${name}`, value.trim());
      });
      entry.bullets.forEach((bullet, bulletIndex) => {
        if (bullet.trim()) {
          fields.set(`${prefix}.bullets.${bulletIndex}`, bullet.trim());
        }
      });
      walkEngagements(entry.engagements, ({ engagement, path }) => {
        const engagementPrefix = path.reduce(
          (current, index) => `${current}.engagements.${index}`,
          prefix,
        );
        const engagementFields = [
          ["name", engagement.name],
          ["role", engagement.role],
          ["organization", engagementOrganizationDisplay(engagement)],
          ["dateRange", engagement.dateRange],
          ["location", engagement.location],
          ["narrative", engagement.narrative],
        ] as const;
        engagementFields.forEach(([name, value]) => {
          if (value.trim()) {
            fields.set(`${engagementPrefix}.${name}`, value.trim());
          }
        });
        engagement.bullets.forEach((bullet, bulletIndex) => {
          if (bullet.trim()) {
            fields.set(
              `${engagementPrefix}.bullets.${bulletIndex}`,
              bullet.trim(),
            );
          }
        });
      });
    });
  });

  return fields;
}

export function validateArtifactIntegrity(
  artifactInput: unknown,
  factsInput: unknown,
): IntegrityResult {
  const artifactResult = groundedResumeArtifactSchema.safeParse(artifactInput);
  const factsResult = z.array(careerFactSchema).safeParse(factsInput);
  const issues: string[] = [];

  if (!artifactResult.success) {
    return {
      ok: false,
      issues: artifactResult.error.issues.map(
        (issue) => `artifact.${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }
  if (!factsResult.success) {
    return {
      ok: false,
      issues: factsResult.error.issues.map(
        (issue) => `facts.${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  const artifact = artifactResult.data;
  const facts = new Map(factsResult.data.map((fact) => [fact.id, fact]));
  const groundable = collectGroundableText(artifact.doc);
  const claimsByPath = new Map<string, typeof artifact.claims>();

  artifact.claims.forEach((claim) => {
    const existing = claimsByPath.get(claim.path) ?? [];
    existing.push(claim);
    claimsByPath.set(claim.path, existing);

    const actual = groundable.get(claim.path);
    if (!actual) {
      issues.push(`Claim path "${claim.path}" does not exist in the resume.`);
    } else if (actual !== claim.text.trim()) {
      issues.push(`Claim text at "${claim.path}" does not match the resume.`);
    }

    claim.sourceFactIds.forEach((factId) => {
      const fact = facts.get(factId);
      if (!fact) {
        issues.push(`Claim "${claim.path}" references unknown fact ${factId}.`);
        return;
      }
      if (artifact.kind === "application" && !isUserClaimedFact(fact)) {
        issues.push(
          `Application claim "${claim.path}" references ${fact.state} fact ${factId}.`,
        );
      }
      if (
        artifact.kind === "target" &&
        !["confirmed", "inferred", "aspirational"].includes(fact.state)
      ) {
        issues.push(
          `Target claim "${claim.path}" references unusable ${fact.state} fact ${factId}.`,
        );
      }
    });

    if (artifact.kind === "application" && claim.mode === "aspirational") {
      issues.push(`Application claim "${claim.path}" is aspirational.`);
    }
  });

  groundable.forEach((_text, path) => {
    const claims = claimsByPath.get(path) ?? [];
    if (claims.length === 0) {
      issues.push(`Resume field "${path}" has no grounded claim.`);
    } else if (claims.length > 1) {
      issues.push(`Resume field "${path}" has duplicate grounded claims.`);
    }
  });

  if (artifact.kind === "application" && !artifact.exportable) {
    issues.push("An application artifact must be exportable.");
  }
  if (artifact.kind === "target") {
    if (artifact.exportable) {
      issues.push("A target-state artifact can never be exportable.");
    }
    if (!artifact.watermark?.trim()) {
      issues.push(
        "A target-state artifact requires an aspirational watermark.",
      );
    }
  }

  return { ok: issues.length === 0, issues };
}

export function assertArtifactIntegrity(
  artifact: unknown,
  facts: unknown,
): asserts artifact is GroundedResumeArtifact {
  const result = validateArtifactIntegrity(artifact, facts);
  if (!result.ok) {
    throw new Error(
      `Resume integrity check failed:\n${result.issues.join("\n")}`,
    );
  }
}
