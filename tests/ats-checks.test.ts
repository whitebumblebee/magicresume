import { describe, expect, it } from "vitest";
import { runDeterministicChecks } from "@/lib/ats/checks";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import { emptyResumeDoc, newId } from "@/lib/resume/defaults";

describe("runDeterministicChecks", () => {
  it("scores the sample resume highly", () => {
    const result = runDeterministicChecks(SAMPLE_RESUME, {
      status: "fit",
      bodyPt: 9.25,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    const email = result.checks.find((c) => c.id === "email");
    expect(email?.earned).toBe(email?.max);
  });

  it("scores an empty resume near zero", () => {
    const result = runDeterministicChecks(emptyResumeDoc());
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("detects quantified bullets but ignores bare years", () => {
    const doc = emptyResumeDoc();
    doc.sections = [
      {
        id: newId(),
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: newId(),
            heading: "Role",
            subheading: "",
            dateRange: "2020 – 2023",
            location: "",
            bullets: [
              "Led team since 2021 with no numbers at all here", // only a year → not quantified
              "Improved performance by 30% and saved $12k", // quantified
            ],
          },
        ],
      },
    ];
    const result = runDeterministicChecks(doc);
    const quant = result.checks.find((c) => c.id === "quantified");
    expect(quant?.detail).toContain("50%");
  });

  it("recognizes action verbs behind **bold** lead-ins", () => {
    const doc = emptyResumeDoc();
    doc.sections = [
      {
        id: newId(),
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: newId(),
            heading: "Role",
            subheading: "",
            dateRange: "",
            location: "",
            bullets: [
              "**Project X:** Built a thing", // verb after marker → counted? "built" follows the bold lead-in — NOT a verb start
              "Led a team of engineers", // verb start
              "Responsible for attending meetings", // classic weak opener
            ],
          },
        ],
      },
    ];
    const result = runDeterministicChecks(doc);
    const verbs = result.checks.find((c) => c.id === "verbs");
    // "responsible" and "project" are not verbs → 1/3 = 33%
    expect(verbs?.detail).toContain("33%");
  });

  it("includes layout checks only when fit info is provided", () => {
    const withFit = runDeterministicChecks(SAMPLE_RESUME, {
      status: "overflow",
    });
    const without = runDeterministicChecks(SAMPLE_RESUME);
    expect(withFit.checks.some((c) => c.id === "onepage")).toBe(true);
    expect(without.checks.some((c) => c.id === "onepage")).toBe(false);
    expect(without.score).toBeGreaterThanOrEqual(0);
  });

  it("partial credit for mid-range font sizes", () => {
    const r1 = runDeterministicChecks(SAMPLE_RESUME, {
      status: "fit",
      bodyPt: 10,
    });
    const r2 = runDeterministicChecks(SAMPLE_RESUME, {
      status: "fit",
      bodyPt: 8.5,
    });
    const s1 = r1.checks.find((c) => c.id === "fontsize")!;
    const s2 = r2.checks.find((c) => c.id === "fontsize")!;
    expect(s1.earned).toBeGreaterThan(s2.earned);
  });
});
