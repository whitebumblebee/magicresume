import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "genkit/beta";
import { generateProfiled } from "@/lib/ai/generate-profiled";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { emptyResumeDoc } from "@/lib/resume/defaults";
import type { ResumeDoc } from "@/lib/resume/schema";
import { resolveMasterResume } from "./master-resume";
import { generateCoverLetter, type CoverLetter } from "./cover-letter";
import {
  createApplication,
  createCareerFacts,
  createJobProfile,
  listCareerFacts,
  listCareerPreferences,
  saveApplicationArtifacts,
  saveLearningGoals,
} from "./repository";
import {
  gapItemSchema,
  groundedResumeArtifactSchema,
  isUserClaimedFact,
  jobProfileSchema,
  learningTaskSchema,
  validateArtifactIntegrity,
  type CareerFact,
  type GapItem,
  type GroundedResumeArtifact,
  type JobProfile,
  type LearningGoal,
} from "./schema";

const gapAnalysisSchema = z.object({
  gaps: z.array(gapItemSchema),
  goals: z.array(
    z.object({
      capability: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      tasks: z.array(
        learningTaskSchema.omit({ id: true, status: true }).extend({
          status: z
            .enum(["planned", "in_progress", "completed"])
            .default("planned"),
        }),
      ),
    }),
  ),
});

const artifactPairSchema = z.object({
  application: groundedResumeArtifactSchema,
  target: groundedResumeArtifactSchema,
  rationale: z.string(),
});

export interface TailoringResult {
  applicationId: string;
  jobProfile: JobProfile;
  gaps: GapItem[];
  goals: LearningGoal[];
  application: GroundedResumeArtifact;
  target: GroundedResumeArtifact;
  rationale: string;
  /** Null when letter generation failed; the resume is still returned. */
  coverLetter: CoverLetter | null;
}

export async function analyzeJobDescription(
  rawText: string,
): Promise<JobProfile> {
  return generateProfiled({
    profile: "career-jd",
    system: [
      "You are MagicResume's job-description analyst.",
      "Extract the role faithfully. Separate explicit must-haves from nice-to-haves.",
      "Do not infer hidden requirements or inflate keyword importance.",
      "Evidence hints must describe what credible candidate evidence would look like.",
    ].join("\n"),
    prompt: rawText,
    schema: jobProfileSchema,
    temperature: 0.1,
    maxOutputTokens: 8192,
  });
}

export async function analyzeCareerGaps(args: {
  profile: JobProfile;
  facts: CareerFact[];
}) {
  const evidenceFacts = args.facts.filter(isUserClaimedFact);
  const parsed = await generateProfiled({
    profile: "career-gap",
    system: [
      "You are MagicResume's evidence-first career gap analyst.",
      "Classify every requirement as demonstrated, transferable, currently_learning, or missing.",
      "Use demonstrated only when the user's own supplied facts directly support it.",
      "Use transferable only when an adjacent supplied skill has a defensible connection.",
      "Use currently_learning only when a supplied fact explicitly says the user is learning it.",
      "Never treat an aspirational fact as current evidence.",
      "For every missing or currently-learning must-have, create small tasks with concrete completion evidence.",
      "Do not tell users to fabricate experience. Preparing for a future similar role is a valid recommendation.",
    ].join("\n"),
    prompt: JSON.stringify({
      job: args.profile,
      suppliedFacts: evidenceFacts.map(compactFact),
    }),
    schema: gapAnalysisSchema,
    temperature: 0.15,
    maxOutputTokens: 12288,
  });

  const knownIds = new Set(evidenceFacts.map((fact) => fact.id));
  const gaps = parsed.gaps.map((gap) => {
    const sourceFactIds = (gap.sourceFactIds ?? []).filter((id) =>
      knownIds.has(id),
    );
    const evidenceRequired =
      gap.state === "demonstrated" || gap.state === "transferable";
    return {
      ...gap,
      sourceFactIds,
      state:
        evidenceRequired && sourceFactIds.length === 0 ? "missing" : gap.state,
    } satisfies GapItem;
  });

  const goals: LearningGoal[] = parsed.goals.map((goal) => ({
    id: randomUUID(),
    capability: goal.capability,
    title: goal.title,
    description: goal.description,
    status: "planned",
    tasks: goal.tasks.map((task) => ({
      ...task,
      id: randomUUID(),
      status: task.status ?? "planned",
    })),
  }));

  return { gaps, goals };
}

/**
 * Build the skeleton the generated resume inherits: the user's own contact block
 * and their master resume's design. Content comes from career memory, so the
 * skeleton deliberately carries no sections.
 */
async function composeBaseDoc(userId: string): Promise<ResumeDoc> {
  const db = getDb();
  const master = await resolveMasterResume(userId, db);
  const [account] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      email: users.email,
      phone: users.phone,
      location: users.location,
      links: users.links,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Start from the master resume so typography, layout, and header treatment
  // carry over; fall back to a clean default when there is no usable master.
  const doc: ResumeDoc = master.doc
    ? structuredClone(master.doc)
    : emptyResumeDoc();

  const profileName = [account?.firstName, account?.lastName]
    .filter((part) => part?.trim())
    .join(" ")
    .trim();
  const profileLinks = Array.isArray(account?.links)
    ? (account.links as { label?: string; url?: string }[])
    : [];

  // The profile is authoritative for identity. Anything it does not specify keeps
  // the master resume's value rather than being blanked out.
  doc.contact = {
    ...doc.contact,
    name: profileName || account?.name?.trim() || doc.contact.name,
    email: account?.email?.trim() || doc.contact.email,
    phone: account?.phone?.trim() || doc.contact.phone,
    location: account?.location?.trim() || doc.contact.location,
    links:
      profileLinks.length > 0
        ? profileLinks
            .filter((link) => link.label?.trim() && link.url?.trim())
            .map((link, index) => ({
              id: `profile-link-${index}`,
              label: link.label!.trim(),
              url: link.url!.trim(),
            }))
        : doc.contact.links,
  };

  // Content is rebuilt from career memory for this specific JD.
  doc.sections = [];
  doc.summary = "";
  return doc;
}

export async function buildTailoredApplication(args: {
  userId: string;
  rawJobDescription: string;
  /**
   * Optional style/contact override. Normally omitted: the base document is
   * composed from the user's master resume and profile, never from whatever
   * happens to be open in the editor.
   */
  baseDoc?: ResumeDoc;
  sourceResumeId?: string;
  sessionId?: string;
  /** Optional company pages the user pasted alongside the JD. */
  companyContext?: { url: string; text: string }[];
}): Promise<TailoringResult> {
  const allFacts = await listCareerFacts(args.userId);
  // Trusted = supplied by the user, confirmed or not. Only aspirational and
  // rejected items are excluded from an application.
  const usableFacts = allFacts.filter(isUserClaimedFact);
  if (usableFacts.length === 0) {
    throw new Error(
      "Import a resume or add your experience to career memory before tailoring an application.",
    );
  }

  // The partner composes from what it remembers about the user plus their own
  // master resume for styling and contact details. The editor's current document
  // is deliberately not an input: a resume open for a relative must never become
  // the skeleton for an application built from this account's history.
  const baseDoc = args.baseDoc ?? (await composeBaseDoc(args.userId));

  const preferences = await listCareerPreferences(args.userId);
  const profile = await analyzeJobDescription(args.rawJobDescription);
  const jobRow = await createJobProfile(
    args.userId,
    args.rawJobDescription,
    profile,
  );
  const { gaps, goals } = await analyzeCareerGaps({
    profile,
    facts: allFacts,
  });
  const applicationRow = await createApplication({
    userId: args.userId,
    jobProfileId: jobRow.id,
    sourceResumeId: args.sourceResumeId,
    agentSessionId: args.sessionId,
    title: `${profile.title}${profile.company ? ` at ${profile.company}` : ""}`,
  });

  const missingCapabilities = [
    ...new Set(
      gaps
        .filter((gap) => ["missing", "currently_learning"].includes(gap.state))
        .map((gap) => gap.capability),
    ),
  ];
  if (missingCapabilities.length > 0) {
    await createCareerFacts(
      args.userId,
      missingCapabilities.map((capability) => ({
        kind: "skill",
        title: capability,
        description: `Target capability for ${profile.title}; not yet demonstrated.`,
        skills: [capability],
        metrics: [],
        state: "aspirational",
        qualityScore: 0,
        evidenceStrength: [],
        sources: [
          {
            type: "agent_inference",
            excerpt: args.rawJobDescription.slice(0, 2000),
            reference: `job:${jobRow.id}`,
            metadata: { capability },
          },
        ],
      })),
    );
  }

  await saveLearningGoals(args.userId, applicationRow.id, goals);
  const factsWithTargets = await listCareerFacts(args.userId);
  const pair = await generateArtifacts({
    baseDoc,
    profile,
    facts: factsWithTargets,
    gaps,
    preferences,
  });

  const applicationIntegrity = validateArtifactIntegrity(
    pair.application,
    factsWithTargets,
  );
  const targetIntegrity = validateArtifactIntegrity(
    pair.target,
    factsWithTargets,
  );
  if (!applicationIntegrity.ok || !targetIntegrity.ok) {
    const issues = [
      ...applicationIntegrity.issues.map((issue) => `application: ${issue}`),
      ...targetIntegrity.issues.map((issue) => `target: ${issue}`),
    ];
    throw new Error(
      `Generated artifacts failed integrity checks:\n${issues.join("\n")}`,
    );
  }

  // Every JD gets a letter as well as a resume. A failure here must not lose the
  // resume the user just waited for, so it degrades to no letter.
  let coverLetter: CoverLetter | null = null;
  try {
    coverLetter = await generateCoverLetter({
      profile,
      facts: factsWithTargets,
      candidate: {
        name: baseDoc.contact.name,
        email: baseDoc.contact.email,
        phone: baseDoc.contact.phone,
        location: baseDoc.contact.location,
      },
      companyContext: args.companyContext,
    });
  } catch (error) {
    console.error("cover letter generation failed", error);
  }

  await saveApplicationArtifacts({
    userId: args.userId,
    applicationId: applicationRow.id,
    applicationArtifact: pair.application,
    targetArtifact: pair.target,
    gapPlan: { gaps, goals },
    coverLetter,
    integrityStatus: "passed",
  });

  return {
    applicationId: applicationRow.id,
    jobProfile: profile,
    gaps,
    goals,
    application: pair.application,
    target: pair.target,
    rationale: pair.rationale,
    coverLetter,
  };
}

async function generateArtifacts(args: {
  baseDoc: ResumeDoc;
  profile: JobProfile;
  facts: CareerFact[];
  gaps: GapItem[];
  preferences: unknown[];
}) {
  const applicationFacts = args.facts.filter(isUserClaimedFact);
  const targetFacts = args.facts.filter((fact) =>
    ["confirmed", "inferred", "aspirational"].includes(fact.state),
  );
  const pair = await generateProfiled({
    profile: "career-artifacts",
    system: [
      "You are MagicResume's truthful application architect.",
      "Create two resume artifacts using the exact ResumeDoc schema and base theme/contact.",
      "APPLICATION: use only facts the user supplied. Every factual field (headline, summary, entry heading/organization/date/location/narrative/bullets, and every nested engagement name/role/export-safe organization/date/location/narrative/bullet at either supported depth) needs one claim with its exact collectGroundableText path/text and its source fact IDs. Select and reorder the user's own material; never invent, inflate, or upgrade it (do not turn 'reduced latency' into 'architected'). Preserve engagement ancestry. Never emit or retain a hidden real organization name, and never invent tools, metrics, roles, dates, or outcomes. It must be exportable and have no watermark.",
      "TARGET: show what the resume could look like after the gap plan. It may use supplied and aspirational facts. It must be non-exportable and watermarked exactly 'ASPIRATIONAL — NOT FOR APPLICATION'.",
      "Do not put aspirational content into the application artifact.",
      "Preserve contact information, summaryTitle, layout, and theme tokens exactly from baseDoc.",
      "Prefer evidence relevant to the JD; omit weak unrelated content instead of inventing relevance.",
      "Use user preferences when they do not conflict with truthfulness.",
      "Honour a fact's `userNote` as the user's own instruction about how that item should be represented; it never licenses a claim the fact itself does not support.",
    ].join("\n"),
    prompt: JSON.stringify({
      baseDoc: args.baseDoc,
      job: args.profile,
      gaps: args.gaps,
      suppliedFacts: applicationFacts.map(compactFact),
      targetFacts: targetFacts.map(compactFact),
      preferences: args.preferences,
    }),
    schema: artifactPairSchema,
    temperature: 0.15,
    maxOutputTokens: 32768,
  });
  return {
    ...pair,
    application: {
      ...pair.application,
      kind: "application" as const,
      exportable: true,
    },
    target: {
      ...pair.target,
      kind: "target" as const,
      exportable: false,
      watermark: "ASPIRATIONAL — NOT FOR APPLICATION",
    },
  };
}

function compactFact(fact: CareerFact) {
  return {
    id: fact.id,
    kind: fact.kind,
    title: fact.title,
    organization: fact.organization,
    description: fact.description,
    startDate: fact.startDate,
    endDate: fact.endDate,
    skills: fact.skills,
    metrics: fact.metrics,
    state: fact.state,
    qualityScore: fact.qualityScore,
    // The user's own instruction about this item, e.g. "I led this, not assisted".
    userNote: fact.userNote ?? undefined,
  };
}
