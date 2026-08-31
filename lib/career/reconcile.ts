import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { careerFacts, factSources } from "@/lib/db/schema";
import { evidenceFingerprint } from "./evidence";
import type { CareerFactDraft } from "./schema";

export async function findEquivalentOwnedFact(args: {
  db: Db;
  userId: string;
  draft: CareerFactDraft;
  excludeFactId?: string;
}) {
  const rows = await args.db
    .select({
      id: careerFacts.id,
      kind: careerFacts.kind,
      title: careerFacts.title,
      organization: careerFacts.organization,
      description: careerFacts.description,
      startDate: careerFacts.startDate,
      endDate: careerFacts.endDate,
      state: careerFacts.state,
    })
    .from(careerFacts)
    .where(eq(careerFacts.userId, args.userId));
  const target = evidenceFingerprint(args.draft);
  return rows.find(
    (row) =>
      row.id !== args.excludeFactId &&
      evidenceFingerprint({
        kind: row.kind as CareerFactDraft["kind"],
        title: row.title,
        organization: row.organization ?? undefined,
        description: row.description,
        startDate: row.startDate ?? undefined,
        endDate: row.endDate ?? undefined,
      }) === target,
  );
}

export async function insertCareerFactDraft(args: {
  db: Db;
  userId: string;
  draft: CareerFactDraft;
}): Promise<string> {
  const [row] = await args.db
    .insert(careerFacts)
    .values({
      userId: args.userId,
      kind: args.draft.kind,
      title: args.draft.title,
      organization: args.draft.organization,
      description: args.draft.description,
      startDate: args.draft.startDate,
      endDate: args.draft.endDate,
      skills: args.draft.skills,
      metrics: args.draft.metrics,
      state: args.draft.state,
      qualityScore: args.draft.qualityScore,
    })
    .returning({ id: careerFacts.id });
  await attachDraftSource({
    db: args.db,
    userId: args.userId,
    factId: row.id,
    draft: args.draft,
  });
  return row.id;
}

export async function attachDraftSource(args: {
  db: Db;
  userId: string;
  factId: string;
  draft: CareerFactDraft;
}): Promise<void> {
  const source = args.draft.sources[0];
  if (!source) return;
  await args.db.insert(factSources).values({
    factId: args.factId,
    userId: args.userId,
    sourceType: source.type,
    sourceRef: source.reference,
    sourceKey: source.key,
    excerpt: source.excerpt,
    metadata: {
      ...source.metadata,
      evidenceFingerprint: evidenceFingerprint(args.draft),
    },
  });
}

export async function sourceAlreadyAttached(args: {
  db: Db;
  userId: string;
  sourceRef: string;
  sourceKey: string;
}) {
  const [row] = await args.db
    .select({ id: factSources.id, factId: factSources.factId })
    .from(factSources)
    .where(
      and(
        eq(factSources.userId, args.userId),
        eq(factSources.sourceRef, args.sourceRef),
        eq(factSources.sourceKey, args.sourceKey),
      ),
    )
    .limit(1);
  return row;
}
