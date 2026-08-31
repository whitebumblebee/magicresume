import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { ResumeDoc } from "@/lib/resume/schema";

/**
 * Career memory is personal to the authenticated account. A resume belonging to
 * someone else may still be imported, edited, fitted, exported, and saved — it
 * simply cannot become this user's remembered career history.
 *
 * Ownership is decided from the authenticated account profile and the resume's
 * own candidate name. Model output never participates in this decision.
 */

export type OwnershipVerdict =
  /** The names agree; ingestion proceeds. */
  | "match"
  /** Plausibly the same person; requires one explicit user confirmation. */
  | "near"
  /** Clearly a different person; ingestion is refused outright. */
  | "mismatch"
  /** Not enough profile/resume identity to decide; ask the user. */
  | "unknown";

export interface OwnershipAssessment {
  verdict: OwnershipVerdict;
  accountName: string | null;
  resumeName: string | null;
  /** True when an explicit user confirmation may unlock ingestion. */
  canConfirm: boolean;
  message: string;
}

const HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "professor",
  "er",
  "sri",
  "shri",
  "smt",
]);

const SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "phd",
  "md",
  "mba",
  "msc",
  "bsc",
  "be",
  "btech",
  "mtech",
  "cpa",
  "pmp",
  "cfa",
]);

/** Reduce a display name to comparable lowercase alphabetic tokens. */
export function personNameTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return (
    value
      .normalize("NFKD")
      // Drop combining marks so "José" and "Jose" compare equal.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // Email-style identities occasionally arrive as the account name.
      .replace(/@.*$/, "")
      .replace(/[._-]+/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !HONORIFICS.has(token) && !SUFFIXES.has(token))
  );
}

function isInitialOf(candidate: string, full: string): boolean {
  return candidate.length === 1 && full.startsWith(candidate);
}

/**
 * Compare an account identity with a resume's candidate name.
 *
 * Deliberately conservative: anything short of an unambiguous agreement asks
 * the user rather than assuming, and a name with no overlap at all is refused
 * without an override.
 */
export function assessNameOwnership(
  accountName: string | null | undefined,
  resumeName: string | null | undefined,
): OwnershipAssessment {
  const account = personNameTokens(accountName);
  const resume = personNameTokens(resumeName);
  const base = {
    accountName: accountName?.trim() || null,
    resumeName: resumeName?.trim() || null,
  };

  if (resume.length === 0) {
    return {
      ...base,
      verdict: "unknown",
      canConfirm: true,
      message:
        "This resume has no readable candidate name, so it cannot be matched to your account. Confirm it is yours to build career memory from it.",
    };
  }
  if (account.length === 0) {
    return {
      ...base,
      verdict: "unknown",
      canConfirm: true,
      message:
        "Add your full name to your profile so imported resumes can be matched to you before they become career memory.",
    };
  }

  const accountSet = new Set(account);
  const resumeSet = new Set(resume);
  const shared = account.filter((token) => resumeSet.has(token));

  const subset =
    account.every((token) => resumeSet.has(token)) ||
    resume.every((token) => accountSet.has(token));
  if (subset) {
    return {
      ...base,
      verdict: "match",
      canConfirm: false,
      message: "This resume matches your account name.",
    };
  }

  // Same family name plus a compatible initial, e.g. "S. Jha" vs "Shishir Jha".
  const accountLast = account.at(-1)!;
  const resumeLast = resume.at(-1)!;
  const initialCompatible =
    accountLast === resumeLast &&
    account
      .slice(0, -1)
      .some((token) =>
        resume
          .slice(0, -1)
          .some(
            (other) => isInitialOf(token, other) || isInitialOf(other, token),
          ),
      );

  if (initialCompatible || shared.length > 0) {
    return {
      ...base,
      verdict: "near",
      canConfirm: true,
      message: `This resume is written for “${base.resumeName}”, which only partly matches your profile name${
        base.accountName ? ` “${base.accountName}”` : ""
      }. Confirm it is yours before it becomes career memory.`,
    };
  }

  return {
    ...base,
    verdict: "mismatch",
    canConfirm: false,
    message: `This resume belongs to “${base.resumeName}”, not to your account${
      base.accountName ? ` “${base.accountName}”` : ""
    }. You can still edit, fit, export, and save it, but career memory only stores your own history. Update your profile name if this really is you.`,
  };
}

/** Raised when a resume may not become this account's career memory. */
export class CareerMemoryOwnershipError extends Error {
  readonly assessment: OwnershipAssessment;

  constructor(assessment: OwnershipAssessment) {
    super(assessment.message);
    this.name = "CareerMemoryOwnershipError";
    this.assessment = assessment;
  }
}

export async function assessResumeOwnership(args: {
  userId: string;
  doc: ResumeDoc;
  db?: Db;
}): Promise<OwnershipAssessment> {
  const db = args.db ?? getDb();
  const [account] = await db
    .select({
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, args.userId))
    .limit(1);
  // Prefer the explicit first/last name from the profile; fall back to the
  // display name written by the auth provider. An email local-part is a weak
  // signal and is intentionally treated as "no name on file".
  const structured = [account?.firstName, account?.lastName]
    .filter((part) => part?.trim())
    .join(" ")
    .trim();
  return assessNameOwnership(
    structured || account?.name || null,
    args.doc.contact.name,
  );
}

/**
 * Gate every career-memory ingestion path. Enforced inside the sync functions
 * themselves so no current or future route can forget it.
 */
export async function assertResumeOwnership(args: {
  userId: string;
  doc: ResumeDoc;
  confirmedOwnership?: boolean;
  db?: Db;
}): Promise<OwnershipAssessment> {
  const assessment = await assessResumeOwnership(args);
  if (assessment.verdict === "match") return assessment;
  if (args.confirmedOwnership && assessment.canConfirm) return assessment;
  throw new CareerMemoryOwnershipError(assessment);
}
