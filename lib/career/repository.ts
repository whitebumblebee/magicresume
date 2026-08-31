import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import {
  applications,
  careerFacts,
  careerPreferences,
  factSources,
  feedbackEvents,
  jobProfiles,
  learningGoals,
} from "@/lib/db/schema";
import {
  careerFactDraftSchema,
  careerFactSchema,
  jobProfileSchema,
  preferenceSchema,
  type CareerFact,
  type CareerFactDraft,
  type GroundedResumeArtifact,
  type JobProfile,
  type LearningGoal,
} from "./schema";
import type { ResumeDoc } from "@/lib/resume/schema";
import { resumeDocumentFingerprint, resumeToFactDrafts } from "./ingest";
import { assertResumeOwnership } from "./identity";
import {
  attachDraftSource,
  findEquivalentOwnedFact,
  insertCareerFactDraft,
  sourceAlreadyAttached,
} from "./reconcile";

export interface MemorySummary {
  total: number;
  confirmed: number;
  needsReview: number;
  aspirational: number;
  rejected: number;
}

export interface ResumeMemorySyncResult {
  created: number;
  reused: number;
  facts: CareerFact[];
  summary: MemorySummary;
  sourceRef: string;
}

export async function listCareerFacts(
  userId: string,
  states: CareerFact["state"][] = ["confirmed", "inferred", "aspirational"],
  db: Db = getDb(),
): Promise<CareerFact[]> {
  const rows = await db
    .select()
    .from(careerFacts)
    .where(
      and(eq(careerFacts.userId, userId), inArray(careerFacts.state, states)),
    )
    .orderBy(desc(careerFacts.updatedAt));

  if (rows.length === 0) return [];
  const rowIds = rows.map((row) => row.id);
  const sources = await db
    .select()
    .from(factSources)
    .where(
      and(eq(factSources.userId, userId), inArray(factSources.factId, rowIds)),
    );
  const sourcesByFact = new Map<string, typeof sources>();
  sources.forEach((source) => {
    const list = sourcesByFact.get(source.factId) ?? [];
    list.push(source);
    sourcesByFact.set(source.factId, list);
  });

  return rows.map((row) =>
    careerFactSchema.parse({
      id: row.id,
      kind: row.kind,
      title: row.title,
      organization: row.organization ?? undefined,
      description: row.description,
      startDate: row.startDate ?? undefined,
      endDate: row.endDate ?? undefined,
      skills: row.skills,
      metrics: row.metrics,
      state: row.state,
      userNote: row.userNote ?? null,
      editedAt: row.editedAt ?? null,
      qualityScore: row.qualityScore,
      evidenceStrength: deriveEvidenceStrength(
        sourcesByFact.get(row.id) ?? [],
        row.metrics,
      ),
      sources: (sourcesByFact.get(row.id) ?? []).map((source) => ({
        id: source.id,
        type: source.sourceType,
        excerpt: source.excerpt,
        reference: source.sourceRef ?? undefined,
        key: source.sourceKey ?? undefined,
        metadata: source.metadata,
      })),
    }),
  );
}

export function summarizeCareerFacts(facts: CareerFact[]): MemorySummary {
  return {
    total: facts.length,
    confirmed: facts.filter((fact) => fact.state === "confirmed").length,
    needsReview: facts.filter((fact) => fact.state === "inferred").length,
    aspirational: facts.filter((fact) => fact.state === "aspirational").length,
    rejected: facts.filter((fact) => fact.state === "rejected").length,
  };
}

/**
 * Idempotently ingest one imported document. Equivalent evidence owned by the
 * authenticated tenant adopts this import as another source instead of
 * creating a second fact, preserving any prior review state.
 */
export async function syncImportedResumeFacts(args: {
  userId: string;
  doc: ResumeDoc;
  sourceType?: "resume_pdf" | "resume_screenshot";
  confirmedOwnership?: boolean;
  db?: Db;
}): Promise<ResumeMemorySyncResult> {
  const db = args.db ?? getDb();
  // Career memory is personal: refuse another person's resume before any write.
  await assertResumeOwnership({
    userId: args.userId,
    doc: args.doc,
    confirmedOwnership: args.confirmedOwnership,
    db,
  });
  const sourceRef = `resume-import:${resumeDocumentFingerprint(args.doc)}`;
  const drafts = resumeToFactDrafts(args.doc, sourceRef, {
    sourceType: args.sourceType ?? "resume_pdf",
    keyedEntries: true,
  });
  let created = 0;
  let reused = 0;

  for (const draft of drafts) {
    const source = draft.sources[0];
    if (!source?.key || !source.reference) continue;
    const existingSource = await sourceAlreadyAttached({
      db,
      userId: args.userId,
      sourceRef: source.reference,
      sourceKey: source.key,
    });
    if (existingSource) {
      reused += 1;
      continue;
    }
    const equivalent = await findEquivalentOwnedFact({
      db,
      userId: args.userId,
      draft,
    });
    if (equivalent) {
      await attachDraftSource({
        db,
        userId: args.userId,
        factId: equivalent.id,
        draft,
      });
      reused += 1;
      continue;
    }
    await insertCareerFactDraft({ db, userId: args.userId, draft });
    created += 1;
  }

  const facts = await listCareerFacts(
    args.userId,
    ["confirmed", "inferred", "aspirational", "rejected"],
    db,
  );
  return {
    created,
    reused,
    facts,
    summary: summarizeCareerFacts(facts),
    sourceRef,
  };
}

export async function createCareerFacts(
  userId: string,
  draftsInput: CareerFactDraft[],
): Promise<CareerFact[]> {
  const drafts = careerFactDraftSchema.array().parse(draftsInput);
  const db = getDb();

  for (const draft of drafts) {
    const [row] = await db
      .insert(careerFacts)
      .values({
        userId,
        kind: draft.kind,
        title: draft.title,
        organization: draft.organization,
        description: draft.description,
        startDate: draft.startDate,
        endDate: draft.endDate,
        skills: draft.skills,
        metrics: draft.metrics,
        state: draft.state,
        qualityScore: draft.qualityScore,
      })
      .returning({ id: careerFacts.id });

    if (draft.sources.length > 0) {
      await db.insert(factSources).values(
        draft.sources.map((source) => ({
          factId: row.id,
          userId,
          sourceType: source.type,
          sourceRef: source.reference,
          sourceKey: source.key,
          excerpt: source.excerpt,
          metadata: source.metadata,
        })),
      );
    }
  }

  return listCareerFacts(userId);
}

export async function setCareerFactState(
  userId: string,
  factId: string,
  state: CareerFact["state"],
  db: Db = getDb(),
): Promise<CareerFact | null> {
  const [updated] = await db
    .update(careerFacts)
    .set({ state, updatedAt: new Date() })
    .where(and(eq(careerFacts.id, factId), eq(careerFacts.userId, userId)))
    .returning({ id: careerFacts.id });
  if (!updated) return null;
  const facts = await listCareerFacts(
    userId,
    ["confirmed", "inferred", "aspirational", "rejected"],
    db,
  );
  return facts.find((fact) => fact.id === factId) ?? null;
}

/**
 * Let the user correct what the agent remembers.
 *
 * Rewriting the text records `editedAt` and attaches a `user_edit` source, so an
 * exported claim stays honest that the wording came from the user rather than the
 * original document. A note alone is an instruction to the agent and does not
 * count as an edit.
 */
export async function updateCareerFact(
  args: {
    userId: string;
    factId: string;
    title?: string;
    description?: string;
    skills?: string[];
    metrics?: string[];
    userNote?: string | null;
  },
  db: Db = getDb(),
): Promise<CareerFact | null> {
  const rewrote =
    args.title !== undefined ||
    args.description !== undefined ||
    args.skills !== undefined ||
    args.metrics !== undefined;

  const [updated] = await db
    .update(careerFacts)
    .set({
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.skills !== undefined ? { skills: args.skills } : {}),
      ...(args.metrics !== undefined ? { metrics: args.metrics } : {}),
      ...(args.userNote !== undefined ? { userNote: args.userNote } : {}),
      ...(rewrote ? { editedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(careerFacts.id, args.factId), eq(careerFacts.userId, args.userId)),
    )
    .returning({ id: careerFacts.id });
  if (!updated) return null;

  if (rewrote) {
    // One provenance row per fact, refreshed on each edit, so repeated edits do
    // not accumulate rows and the latest user wording is always attributable.
    const ref = `user-edit:${args.factId}`;
    const excerpt =
      [args.title, args.description].filter(Boolean).join("\n") ||
      "User edited this memory item.";
    await db
      .insert(factSources)
      .values({
        factId: args.factId,
        userId: args.userId,
        sourceType: "user_edit",
        excerpt,
        sourceRef: ref,
        sourceKey: ref,
        metadata: { active: true, editedAt: new Date().toISOString() },
      })
      .onConflictDoUpdate({
        target: [
          factSources.userId,
          factSources.sourceRef,
          factSources.sourceKey,
        ],
        set: {
          excerpt,
          metadata: { active: true, editedAt: new Date().toISOString() },
        },
      });
  }

  const facts = await listCareerFacts(
    args.userId,
    ["confirmed", "inferred", "aspirational", "rejected"],
    db,
  );
  return facts.find((fact) => fact.id === args.factId) ?? null;
}

/** Remove a memory item outright. Its sources cascade. */
export async function deleteCareerFact(
  args: { userId: string; factId: string },
  db: Db = getDb(),
): Promise<boolean> {
  const [deleted] = await db
    .delete(careerFacts)
    .where(
      and(eq(careerFacts.id, args.factId), eq(careerFacts.userId, args.userId)),
    )
    .returning({ id: careerFacts.id });
  return Boolean(deleted);
}

export async function listCareerPreferences(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(careerPreferences)
    .where(
      and(
        eq(careerPreferences.userId, userId),
        eq(careerPreferences.active, true),
      ),
    )
    .orderBy(desc(careerPreferences.updatedAt));
  return rows.map((row) =>
    preferenceSchema.parse({
      category: row.category,
      key: row.key,
      value: row.value,
      learnedFrom: row.learnedFrom,
      active: row.active,
    }),
  );
}

export async function upsertCareerPreference(userId: string, input: unknown) {
  const preference = preferenceSchema.parse(input);
  const db = getDb();
  await db
    .insert(careerPreferences)
    .values({
      userId,
      category: preference.category,
      key: preference.key,
      value: preference.value ?? null,
      learnedFrom: preference.learnedFrom,
      active: preference.active,
    })
    .onConflictDoUpdate({
      target: [
        careerPreferences.userId,
        careerPreferences.category,
        careerPreferences.key,
      ],
      set: {
        value: preference.value,
        learnedFrom: preference.learnedFrom,
        active: preference.active,
        updatedAt: new Date(),
      },
    });
  return preference;
}

export async function createJobProfile(
  userId: string,
  rawText: string,
  profileInput: JobProfile,
) {
  const profile = jobProfileSchema.parse(profileInput);
  const db = getDb();
  const [row] = await db
    .insert(jobProfiles)
    .values({
      userId,
      inputType: "text",
      title: profile.title,
      company: profile.company,
      rawText,
      structured: profile,
    })
    .returning();
  return row;
}

export async function createApplication(args: {
  userId: string;
  jobProfileId: string;
  title: string;
  sourceResumeId?: string;
  agentSessionId?: string;
}) {
  const db = getDb();
  const [row] = await db.insert(applications).values(args).returning();
  return row;
}

export async function saveApplicationArtifacts(args: {
  userId: string;
  applicationId: string;
  applicationArtifact?: GroundedResumeArtifact;
  targetArtifact?: GroundedResumeArtifact;
  gapPlan?: unknown;
  coverLetter?: unknown;
  integrityStatus: "pending" | "passed" | "failed";
}) {
  const db = getDb();
  const [row] = await db
    .update(applications)
    .set({
      applicationArtifact: args.applicationArtifact,
      targetArtifact: args.targetArtifact,
      gapPlan: args.gapPlan,
      coverLetter: args.coverLetter,
      integrityStatus: args.integrityStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(applications.id, args.applicationId),
        eq(applications.userId, args.userId),
      ),
    )
    .returning();
  return row ?? null;
}

/** Tenant-scoped lookup so a resume can only file against this user's JDs. */
export async function findOwnedApplication(
  userId: string,
  applicationId: string,
  db: Db = getDb(),
) {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveLearningGoals(
  userId: string,
  applicationId: string,
  goals: LearningGoal[],
) {
  const db = getDb();
  if (goals.length === 0) return [];
  return db
    .insert(learningGoals)
    .values(
      goals.map((goal) => ({
        id: goal.id,
        userId,
        applicationId,
        capability: goal.capability,
        title: goal.title,
        description: goal.description,
        status: goal.status,
        tasks: goal.tasks,
      })),
    )
    .onConflictDoNothing()
    .returning();
}

export async function recordFeedback(args: {
  userId: string;
  applicationId?: string;
  sessionId?: string;
  type: string;
  subject: string;
  decision: string;
  rationale?: string;
  preferencePatch?: unknown;
}) {
  const db = getDb();
  const [row] = await db.insert(feedbackEvents).values(args).returning();
  return row;
}

function deriveEvidenceStrength(
  sources: { sourceType: string; sourceRef: string | null }[],
  metrics: unknown,
): CareerFact["evidenceStrength"] {
  const strength = new Set<CareerFact["evidenceStrength"][number]>();
  if (sources.length > 0) strength.add("source");
  if (sources.some((source) => source.sourceType === "conversation")) {
    strength.add("narrative");
  }
  if (sources.some((source) => Boolean(source.sourceRef))) {
    strength.add("artifact");
  }
  if (Array.isArray(metrics) && metrics.length > 0) strength.add("metric");
  return [...strength];
}
