import { describe, expect, it } from "vitest";
import {
  combineAtsScores,
  groundJdEvidence,
} from "@/lib/ats/service";
import { SAMPLE_RESUME } from "@/lib/resume/sample";

describe("ATS readiness methodology", () => {
  it("uses the documented 55/45 blend and clamps the result", () => {
    expect(combineAtsScores(80, 60)).toBe(71);
    expect(combineAtsScores(120, 120)).toBe(100);
    expect(combineAtsScores(-20, -20)).toBe(0);
  });

  it("uses the deterministic score unchanged when Gemini is unavailable", () => {
    expect(combineAtsScores(73.4, null)).toBe(73);
  });

  it("does not report JD evidence when no JD was supplied", () => {
    expect(
      groundJdEvidence(
        SAMPLE_RESUME,
        {
          matchedTerms: [
            {
              term: "TypeScript",
              evidence: "TypeScript",
              sectionTitle: "Skills",
            },
          ],
          missingTerms: [],
        },
        false,
      ),
    ).toEqual({ status: "not_provided", matchedTerms: [], missingTerms: [] });
  });

  it("keeps only exact resume evidence and moves unsupported matches to missing", () => {
    const section = SAMPLE_RESUME.sections[0];
    const exactEvidence = section.entries[0].bullets[0];
    const report = groundJdEvidence(
      SAMPLE_RESUME,
      {
        matchedTerms: [
          {
            term: "Supported capability",
            evidence: exactEvidence,
            sectionTitle: section.title,
          },
          {
            term: "Invented capability",
            evidence: "This sentence is not in the resume.",
            sectionTitle: section.title,
          },
          {
            term: "Unknown section",
            evidence: exactEvidence,
            sectionTitle: "Not a real section",
          },
        ],
        missingTerms: ["Explicit gap"],
      },
      true,
    );

    expect(report.status).toBe("evaluated");
    expect(report.matchedTerms).toEqual([
      {
        term: "Supported capability",
        evidence: exactEvidence,
        sectionTitle: section.title,
      },
    ]);
    expect(report.missingTerms).toEqual([
      "Explicit gap",
      "Invented capability",
      "Unknown section",
    ]);
  });
});
