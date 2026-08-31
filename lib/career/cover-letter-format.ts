/**
 * Client-safe cover-letter shape and renderer.
 *
 * Kept separate from `cover-letter.ts` on purpose: that module reaches Genkit and
 * Vertex, which must never enter a browser bundle. Anything the UI needs lives
 * here and has no AI or Node dependencies.
 */

export interface CoverLetter {
  greeting: string;
  hook: string;
  whyThem: string;
  evidence: string[];
  remoteProof: string;
  close: string;
  signature: string;
  wordCount: number;
  companyUnderstanding: string;
  companySources: string[];
}

/** Render the six blocks as sendable plain text, omitting blocks that do nothing. */
export function coverLetterToText(letter: CoverLetter): string {
  return [
    letter.greeting,
    "",
    letter.hook,
    "",
    letter.whyThem,
    "",
    ...(letter.evidence.length > 0
      ? [
          "Relevant experience:",
          ...letter.evidence.map((line) => `• ${line}`),
          "",
        ]
      : []),
    ...(letter.remoteProof.trim() ? [letter.remoteProof, ""] : []),
    letter.close,
    "",
    letter.signature,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
