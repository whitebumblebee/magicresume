import { generateStructured } from "@/lib/llm/client";
import { llmCompressionSchema, type LlmCompressionEdit } from "@/lib/llm/schemas";
import { compressSystemPrompt, compressUserPrompt } from "@/lib/llm/prompts";
import { PT_TO_PX } from "@/lib/resume/defaults";
import type { ResumeDoc } from "@/lib/resume/schema";

/**
 * "Make it fit" compression. The LLM proposes edits; `verifyEdits` (pure)
 * drops any edit whose echoed original doesn't match the real doc, so the
 * client only ever sees applicable, verified edits.
 */

export interface VerifiedEdit {
  sectionId: string;
  entryId: string;
  bulletIndex: number;
  original: string;
  compressed: string;
  action: "shorten" | "drop";
  reason: string;
}

/** Pure: validate LLM edits against the doc — indices + text must match. */
export function verifyEdits(
  doc: ResumeDoc,
  edits: LlmCompressionEdit[],
): VerifiedEdit[] {
  const verified: VerifiedEdit[] = [];
  for (const edit of edits) {
    const section = doc.sections[edit.sectionIndex];
    const entry = section?.entries[edit.entryIndex];
    const bullet = entry?.bullets[edit.bulletIndex];
    if (!section || !entry) continue;

    // Primary path: exact index + exact text. Fallback: locate by exact text
    // within the same section (LLMs sometimes miscount indices).
    let bulletIndex = edit.bulletIndex;
    if (!bullet || bullet.trim() !== edit.original.trim()) {
      const found = entry.bullets.findIndex(
        (b) => b.trim() === edit.original.trim(),
      );
      if (found === -1) continue;
      bulletIndex = found;
    }

    if (edit.action === "shorten") {
      const compressed = edit.compressed.trim();
      // a "shorten" that doesn't shorten is useless; one that GROWS is a bug
      if (!compressed || compressed.length >= edit.original.trim().length - 10)
        continue;
    }
    if (verified.some((v) => v.sectionId === section.id && v.entryId === entry.id && v.bulletIndex === bulletIndex))
      continue;

    verified.push({
      sectionId: section.id,
      entryId: entry.id,
      bulletIndex,
      original: entry.bullets[bulletIndex],
      compressed: edit.compressed.trim(),
      action: edit.action,
      reason: edit.reason,
    });
  }
  return verified;
}

/** Estimate how many rendered lines the content is over one page. */
export function estimateLinesToCut(args: {
  overflowPx: number;
  bodyPt: number;
}): number {
  const lineHeightPx = Math.max(8, args.bodyPt * PT_TO_PX * 1.12);
  return Math.max(1, Math.ceil(args.overflowPx / lineHeightPx));
}

export async function runCompressResume(
  doc: ResumeDoc,
  fit: { overflowPx: number; bodyPt: number },
): Promise<VerifiedEdit[]> {
  const bulletCount = doc.sections.reduce(
    (acc, s) => acc + s.entries.reduce((a, e) => a + e.bullets.filter(Boolean).length, 0),
    0,
  );
  if (bulletCount === 0) return [];

  const payload = doc.sections.map((s, si) => ({
    sectionIndex: si,
    title: s.title,
    type: s.type,
    entries: s.entries.map((e, ei) => ({
      entryIndex: ei,
      heading: e.heading,
      subheading: e.subheading,
      dateRange: e.dateRange,
      bullets: e.bullets
        .map((b, bi) => ({ bulletIndex: bi, text: b }))
        .filter((b) => b.text.trim()),
    })),
  }));

  const result = await generateStructured({
    system: compressSystemPrompt(),
    parts: [
      {
        text:
          compressUserPrompt({
            linesToCut: estimateLinesToCut(fit),
            bulletCount,
          }) + JSON.stringify(payload),
      },
    ],
    schema: llmCompressionSchema,
    profile: "resume-compression",
  });

  return verifyEdits(doc, result.edits);
}
