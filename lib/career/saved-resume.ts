import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { getDb } from "@/lib/db";
import { careerFacts, factSources } from "@/lib/db/schema";
import type { ResumeDoc } from "@/lib/resume/schema";
import { resumeToFactDrafts } from "./ingest";
import {
  CareerMemoryOwnershipError,
  assertResumeOwnership,
  type OwnershipAssessment,
} from "./identity";
import type { CareerFactDraft } from "./schema";
import {
  attachDraftSource,
  findEquivalentOwnedFact,
  insertCareerFactDraft,
} from "./reconcile";

export interface SavedResumeSyncResult {
  created: number;
  reused: number;
  updated: number;
  removed: number;
  preserved: number;
}

export function savedResumeSourceRef(resumeId: string): string {
  return `saved-resume:${resumeId}`;
}

/**
 * Synchronize provisional facts owned by one saved resume.
 *
 * Inferred facts follow the source document. Reviewed facts never do: when
 * their source entry changes or disappears, its provenance is archived and a
 * new inferred fact is created for the candidate to review.
 */
export async function syncSavedResumeFacts(args: {
  userId: string;
  resumeId: string;
  doc: ResumeDoc;
  confirmedOwnership?: boolean;
  db?: Db;
}): Promise<SavedResumeSyncResult> {
  // Saving another person's resume stays allowed; remembering it does not.
  await assertResumeOwnership({
    userId: args.userId,
    doc: args.doc,
    confirmedOwnership: args.confirmedOwnership,
    db: args.db,
  });
  return reconcileSavedResumeFacts({ ...args, draftsFromDoc: true });
}

export interface SavedResumeSyncOutcome {
  sync: SavedResumeSyncResult;
  /** Set when the resume belongs to someone else; the resume itself still saved. */
  skipped: OwnershipAssessment | null;
}

const NO_SYNC: SavedResumeSyncResult = {
  created: 0,
  reused: 0,
  updated: 0,
  removed: 0,
  preserved: 0,
};

/**
 * Saving a resume must never fail because career memory was refused. The
 * ownership check runs before any write, so a refusal leaves no partial state.
 */
export async function syncSavedResumeFactsIfOwned(args: {
  userId: string;
  resumeId: string;
  doc: ResumeDoc;
  confirmedOwnership?: boolean;
  db?: Db;
}): Promise<SavedResumeSyncOutcome> {
  try {
    return { sync: await syncSavedResumeFacts(args), skipped: null };
  } catch (error) {
    if (error instanceof CareerMemoryOwnershipError) {
      return { sync: NO_SYNC, skipped: error.assessment };
    }
    throw error;
  }
}

export async function removeSavedResumeFacts(args: {
  userId: string;
  resumeId: string;
  db?: Db;
}): Promise<SavedResumeSyncResult> {
  return reconcileSavedResumeFacts({ ...args, draftsFromDoc: false });
}

async function reconcileSavedResumeFacts(args: {
  userId: string;
  resumeId: string;
  db?: Db;
  draftsFromDoc: boolean;
  doc?: ResumeDoc;
}): Promise<SavedResumeSyncResult> {
  const db = args.db ?? getDb();
  const sourceRef = savedResumeSourceRef(args.resumeId);
  const drafts =
    args.draftsFromDoc && args.doc
      ? resumeToFactDrafts(args.doc, sourceRef, {
          sourceType: "saved_resume",
          keyedEntries: true,
        })
      : [];
  const existingRows = await db
    .select({
      sourceId: factSources.id,
      sourceKey: factSources.sourceKey,
      sourceExcerpt: factSources.excerpt,
      sourceMetadata: factSources.metadata,
      factId: careerFacts.id,
      factKind: careerFacts.kind,
      factTitle: careerFacts.title,
      factOrganization: careerFacts.organization,
      factDescription: careerFacts.description,
      factStartDate: careerFacts.startDate,
      factEndDate: careerFacts.endDate,
      factSkills: careerFacts.skills,
      factMetrics: careerFacts.metrics,
      factState: careerFacts.state,
      factQualityScore: careerFacts.qualityScore,
    })
    .from(factSources)
    .innerJoin(
      careerFacts,
      and(
        eq(factSources.factId, careerFacts.id),
        eq(careerFacts.userId, args.userId),
      ),
    )
    .where(
      and(
        eq(factSources.userId, args.userId),
        eq(factSources.sourceType, "saved_resume"),
        eq(factSources.sourceRef, sourceRef),
      ),
    );

  const activeRows = existingRows.filter(
    (row) =>
      row.sourceKey &&
      !row.sourceKey.startsWith("archived:") &&
      asMetadata(row.sourceMetadata).active !== false,
  );
  const existingByKey = new Map(
    activeRows.map((row) => [row.sourceKey as string, row]),
  );
  const incomingKeys = new Set<string>();
  const result: SavedResumeSyncResult = {
    created: 0,
    reused: 0,
    updated: 0,
    removed: 0,
    preserved: 0,
  };

  for (const draft of drafts) {
    const source = draft.sources[0];
    if (!source?.key) {
      throw new Error("Saved-resume facts require a stable source key.");
    }
    incomingKeys.add(source.key);
    const existing = existingByKey.get(source.key);
    if (!existing) {
      const reused = await adoptEquivalentOrInsert({
        db,
        userId: args.userId,
        draft,
      });
      result[reused ? "reused" : "created"] += 1;
      continue;
    }

    if (sameFact(existing, draft)) {
      if (
        existing.sourceExcerpt !== source.excerpt ||
        stableJson(existing.sourceMetadata) !== stableJson(source.metadata)
      ) {
        await db
          .update(factSources)
          .set({
            excerpt: source.excerpt,
            metadata: source.metadata,
          })
          .where(
            and(
              eq(factSources.id, existing.sourceId),
              eq(factSources.userId, args.userId),
            ),
          );
        result.updated += 1;
      }
      result.reused += 1;
      continue;
    }

    if (existing.factState === "inferred") {
      const siblingSources = await db
        .select({ id: factSources.id })
        .from(factSources)
        .where(eq(factSources.factId, existing.factId));
      if (siblingSources.length > 1) {
        await db
          .delete(factSources)
          .where(
            and(
              eq(factSources.id, existing.sourceId),
              eq(factSources.userId, args.userId),
            ),
          );
        const reused = await adoptEquivalentOrInsert({
          db,
          userId: args.userId,
          draft,
          excludeFactId: existing.factId,
        });
        result[reused ? "reused" : "created"] += 1;
        continue;
      }
      await db
        .update(careerFacts)
        .set({
          kind: draft.kind,
          title: draft.title,
          organization: draft.organization ?? null,
          description: draft.description,
          startDate: draft.startDate ?? null,
          endDate: draft.endDate ?? null,
          skills: draft.skills,
          metrics: draft.metrics,
          qualityScore: draft.qualityScore,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(careerFacts.id, existing.factId),
            eq(careerFacts.userId, args.userId),
          ),
        );
      await db
        .update(factSources)
        .set({
          excerpt: source.excerpt,
          metadata: source.metadata,
        })
        .where(
          and(
            eq(factSources.id, existing.sourceId),
            eq(factSources.userId, args.userId),
          ),
        );
      result.updated += 1;
      continue;
    }

    await archiveSource(db, args.userId, existing, "source-updated");
    const reused = await adoptEquivalentOrInsert({
      db,
      userId: args.userId,
      draft,
      excludeFactId: existing.factId,
    });
    result[reused ? "reused" : "created"] += 1;
    result.preserved += 1;
  }

  for (const existing of activeRows) {
    if (incomingKeys.has(existing.sourceKey as string)) continue;
    if (existing.factState === "inferred") {
      const siblingSources = await db
        .select({ id: factSources.id })
        .from(factSources)
        .where(eq(factSources.factId, existing.factId));
      if (siblingSources.length === 1) {
        await db
          .delete(careerFacts)
          .where(
            and(
              eq(careerFacts.id, existing.factId),
              eq(careerFacts.userId, args.userId),
            ),
          );
      } else {
        await db
          .delete(factSources)
          .where(
            and(
              eq(factSources.id, existing.sourceId),
              eq(factSources.userId, args.userId),
            ),
          );
      }
      result.removed += 1;
      continue;
    }
    await archiveSource(db, args.userId, existing, "source-removed");
    result.preserved += 1;
  }

  return result;
}

async function adoptEquivalentOrInsert(args: {
  db: Db;
  userId: string;
  draft: CareerFactDraft;
  excludeFactId?: string;
}): Promise<boolean> {
  const equivalent = await findEquivalentOwnedFact(args);
  if (equivalent) {
    await attachDraftSource({
      db: args.db,
      userId: args.userId,
      factId: equivalent.id,
      draft: args.draft,
    });
    return true;
  }
  await insertCareerFactDraft({
    db: args.db,
    userId: args.userId,
    draft: args.draft,
  });
  return false;
}

async function archiveSource(
  db: Db,
  userId: string,
  row: {
    sourceId: string;
    sourceKey: string | null;
    sourceMetadata: unknown;
  },
  reason: "source-updated" | "source-removed",
) {
  await db
    .update(factSources)
    .set({
      sourceKey: `archived:${row.sourceKey ?? "unknown"}:${row.sourceId}`,
      metadata: {
        ...asMetadata(row.sourceMetadata),
        active: false,
        reconciliationReason: reason,
        reconciledAt: new Date().toISOString(),
      },
    })
    .where(
      and(eq(factSources.id, row.sourceId), eq(factSources.userId, userId)),
    );
}

function sameFact(
  existing: {
    factKind: string;
    factTitle: string;
    factOrganization: string | null;
    factDescription: string;
    factStartDate: string | null;
    factEndDate: string | null;
    factSkills: unknown;
    factMetrics: unknown;
    factQualityScore: number;
  },
  draft: CareerFactDraft,
): boolean {
  return (
    existing.factKind === draft.kind &&
    existing.factTitle === draft.title &&
    existing.factOrganization === (draft.organization ?? null) &&
    existing.factDescription === draft.description &&
    existing.factStartDate === (draft.startDate ?? null) &&
    existing.factEndDate === (draft.endDate ?? null) &&
    JSON.stringify(existing.factSkills) === JSON.stringify(draft.skills) &&
    JSON.stringify(existing.factMetrics) === JSON.stringify(draft.metrics) &&
    existing.factQualityScore === draft.qualityScore
  );
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
