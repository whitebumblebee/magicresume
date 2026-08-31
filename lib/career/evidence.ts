import type { CareerFactDraft } from "./schema";

type EvidenceFields = Pick<
  CareerFactDraft,
  | "kind"
  | "title"
  | "organization"
  | "description"
  | "startDate"
  | "endDate"
>;

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

function canonical(fields: EvidenceFields, includeDescription: boolean): string {
  return JSON.stringify([
    normalize(fields.kind),
    normalize(fields.title),
    normalize(fields.organization),
    normalize(fields.startDate),
    normalize(fields.endDate),
    ...(includeDescription ? [normalize(fields.description)] : []),
  ]);
}

/** Exact-enough semantic identity used only inside one authenticated tenant. */
export function evidenceFingerprint(fields: EvidenceFields): string {
  return compactHash(canonical(fields, true));
}

/** Stable entry identity that survives description/bullet edits. */
export function evidenceEntryFingerprint(fields: EvidenceFields): string {
  return compactHash(canonical(fields, false));
}

export function documentEvidenceFingerprint(
  drafts: EvidenceFields[],
): string {
  return compactHash(drafts.map(evidenceFingerprint).join("|"));
}
