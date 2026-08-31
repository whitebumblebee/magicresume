import { describe, expect, it } from "vitest";
import { verifyEdits, estimateLinesToCut } from "@/lib/compress/service";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import type { LlmCompressionEdit } from "@/lib/llm/schemas";

function edit(partial: Partial<LlmCompressionEdit>): LlmCompressionEdit {
  return {
    sectionIndex: 1,
    entryIndex: 0,
    bulletIndex: 0,
    original: "",
    compressed: "",
    action: "shorten",
    reason: "test",
    ...partial,
  };
}

// SAMPLE_RESUME.sections[1] = experience; entries[0] = Expleo; bullets[0]:
const expleoBullet0 =
  SAMPLE_RESUME.sections[1].entries[0].bullets[0] as string;

describe("verifyEdits", () => {
  it("accepts a well-formed shorten edit", () => {
    const verified = verifyEdits(SAMPLE_RESUME, [
      edit({
        original: expleoBullet0,
        compressed: "**Polaris (Voltron):** Built observability for an IoT platform; 24 CloudWatch alarms via Jenkins, Lambda-formatted alerts.",
        action: "shorten",
      }),
    ]);
    expect(verified).toHaveLength(1);
    expect(verified[0].sectionId).toBe(SAMPLE_RESUME.sections[1].id);
  });

  it("rejects edits whose original text doesn't match the doc", () => {
    const verified = verifyEdits(SAMPLE_RESUME, [
      edit({ original: "This bullet does not exist", compressed: "x" }),
    ]);
    expect(verified).toHaveLength(0);
  });

  it("recovers from wrong indices by matching text within the entry", () => {
    const verified = verifyEdits(SAMPLE_RESUME, [
      edit({
        bulletIndex: 5, // wrong index
        original: expleoBullet0, // but right text
        compressed: "Shortened version here for the Polaris bullet, ok.",
      }),
    ]);
    expect(verified).toHaveLength(1);
    expect(verified[0].bulletIndex).toBe(0);
  });

  it("rejects 'shorten' edits that don't actually shorten", () => {
    const longOriginal = "short one";
    const verified = verifyEdits(
      SAMPLE_RESUME,
      [
        edit({
          original: longOriginal,
          compressed: "this is somehow much longer than the original text",
        }),
      ],
    );
    // original doesn't exist in doc → rejected anyway; force a real case:
    const real = verifyEdits(SAMPLE_RESUME, [
      edit({
        original: expleoBullet0,
        compressed: expleoBullet0, // same length → rejected
      }),
    ]);
    expect(verified).toHaveLength(0);
    expect(real).toHaveLength(0);
  });

  it("deduplicates edits to the same bullet", () => {
    const verified = verifyEdits(SAMPLE_RESUME, [
      edit({ original: expleoBullet0, compressed: "ok short enough now really" }),
      edit({ original: expleoBullet0, compressed: "another different shorter one" }),
    ]);
    expect(verified).toHaveLength(1);
  });

  it("accepts drop edits", () => {
    const verified = verifyEdits(SAMPLE_RESUME, [
      edit({
        original: expleoBullet0,
        action: "drop",
        reason: "duplicated elsewhere",
      }),
    ]);
    expect(verified).toHaveLength(1);
    expect(verified[0].action).toBe("drop");
  });
});

describe("estimateLinesToCut", () => {
  it("converts overflow px into a positive line count", () => {
    expect(estimateLinesToCut({ overflowPx: 0, bodyPt: 10 })).toBe(1);
    expect(
      estimateLinesToCut({ overflowPx: 300, bodyPt: 10 }),
    ).toBeGreaterThanOrEqual(20);
    expect(
      estimateLinesToCut({ overflowPx: 14.8, bodyPt: 10 }),
    ).toBe(1); // one line-height
  });
});
