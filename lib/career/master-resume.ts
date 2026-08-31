import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { getDb } from "@/lib/db";
import { resumes, users } from "@/lib/db/schema";
import { resumeDocSchema, type ResumeDoc } from "@/lib/resume/schema";
import { extractResumeDesign } from "@/lib/templates/design";
import type { ResumeTemplateDesign } from "@/lib/templates/schema";

/**
 * The master resume is the user's source-of-truth document. Generated resumes
 * borrow its design and contact block so every application looks like the user's
 * own resume rather than a default template.
 *
 * Only a resume the user owns and that is their own (`subjectKind = "self"`) may
 * be master: a relative's resume must never supply the name, contact details, or
 * styling for an application generated from this account's history.
 */

export type MasterResumeSource = "master" | "latest-own" | "none";

export interface ResolvedMasterResume {
  source: MasterResumeSource;
  resumeId: string | null;
  title: string | null;
  doc: ResumeDoc | null;
  design: ResumeTemplateDesign | null;
}

const EMPTY: ResolvedMasterResume = {
  source: "none",
  resumeId: null,
  title: null,
  doc: null,
  design: null,
};

/** Stored resumes hold `{ doc, fitConfig }`; tolerate legacy/invalid rows. */
function parseStoredDoc(stored: unknown): ResumeDoc | null {
  const payload = stored as { doc?: unknown } | null;
  const parsed = resumeDocSchema.safeParse(payload?.doc);
  return parsed.success ? parsed.data : null;
}

/**
 * Design extraction is stricter than the resume schema — it rejects fonts
 * outside the template allowlist, which an imported resume can legitimately
 * carry. A resume that cannot yield a reusable design is still perfectly good as
 * a contact source, so degrade instead of failing the caller.
 */
function safeDesign(doc: ResumeDoc): ResumeTemplateDesign | null {
  try {
    return extractResumeDesign(doc);
  } catch {
    return null;
  }
}

/**
 * Resolve the design and contact source for generated resumes.
 *
 * Falls back to the most recent resume the user owns when no master has been
 * designated, and reports which of the two happened so the UI can nudge the user
 * to pick one deliberately.
 */
export async function resolveMasterResume(
  userId: string,
  db: Db = getDb(),
): Promise<ResolvedMasterResume> {
  const [account] = await db
    .select({ masterResumeId: users.masterResumeId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (account?.masterResumeId) {
    const [row] = await db
      .select({ id: resumes.id, title: resumes.title, doc: resumes.doc })
      .from(resumes)
      .where(
        and(
          eq(resumes.id, account.masterResumeId),
          eq(resumes.userId, userId),
          eq(resumes.subjectKind, "self"),
        ),
      )
      .limit(1);
    const doc = row ? parseStoredDoc(row.doc) : null;
    if (row && doc) {
      return {
        source: "master",
        resumeId: row.id,
        title: row.title,
        doc,
        design: safeDesign(doc),
      };
    }
  }

  // No usable master: use the newest resume that is actually the user's own.
  const ownRows = await db
    .select({ id: resumes.id, title: resumes.title, doc: resumes.doc })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.subjectKind, "self")))
    .orderBy(desc(resumes.updatedAt))
    .limit(10);

  for (const row of ownRows) {
    const doc = parseStoredDoc(row.doc);
    if (doc) {
      return {
        source: "latest-own",
        resumeId: row.id,
        title: row.title,
        doc,
        design: safeDesign(doc),
      };
    }
  }
  return EMPTY;
}

/** Raised when a resume may not be designated as master. */
export class MasterResumeError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MasterResumeError";
    this.status = status;
  }
}

export async function setMasterResume(args: {
  userId: string;
  resumeId: string;
  db?: Db;
}): Promise<{ resumeId: string; title: string }> {
  const db = args.db ?? getDb();
  const [row] = await db
    .select({
      id: resumes.id,
      title: resumes.title,
      subjectKind: resumes.subjectKind,
      doc: resumes.doc,
    })
    .from(resumes)
    .where(and(eq(resumes.id, args.resumeId), eq(resumes.userId, args.userId)))
    .limit(1);
  if (!row) {
    throw new MasterResumeError("Resume not found.", 404);
  }
  if (row.subjectKind !== "self") {
    throw new MasterResumeError(
      "Only your own resume can be the master. This one is filed as someone else's.",
      409,
    );
  }
  if (!parseStoredDoc(row.doc)) {
    throw new MasterResumeError(
      "This saved resume cannot be read, so it cannot be the master.",
      422,
    );
  }
  await db
    .update(users)
    .set({ masterResumeId: row.id })
    .where(eq(users.id, args.userId));
  return { resumeId: row.id, title: row.title };
}

export async function clearMasterResume(args: {
  userId: string;
  db?: Db;
}): Promise<void> {
  const db = args.db ?? getDb();
  await db
    .update(users)
    .set({ masterResumeId: null })
    .where(eq(users.id, args.userId));
}

/**
 * Clear the pointer when the master resume itself is deleted. Called explicitly
 * because the column intentionally carries no foreign key: `resume` already
 * references `user`, and a reverse constraint would make migration ordering
 * circular.
 */
export async function forgetMasterResumeIfDeleted(args: {
  userId: string;
  resumeId: string;
  db?: Db;
}): Promise<void> {
  const db = args.db ?? getDb();
  await db
    .update(users)
    .set({ masterResumeId: null })
    .where(
      and(eq(users.id, args.userId), eq(users.masterResumeId, args.resumeId)),
    );
}
