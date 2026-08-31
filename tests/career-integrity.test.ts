import { describe, expect, it } from "vitest";
import {
  collectGroundableText,
  validateArtifactIntegrity,
  type CareerFact,
  type GroundedResumeArtifact,
} from "@/lib/career/schema";
import { emptyResumeDoc } from "@/lib/resume/defaults";

const FACT_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_FACT_ID = "00000000-0000-4000-8000-000000000002";

function fact(
  id: string,
  state: CareerFact["state"],
): CareerFact {
  return {
    id,
    kind: "experience",
    title: "Distributed systems work",
    description: "Reduced API latency by 35%.",
    skills: ["TypeScript"],
    metrics: ["35%"],
    state,
    qualityScore: 90,
    evidenceStrength: ["metric"],
    sources: [],
  };
}

function artifact(
  kind: GroundedResumeArtifact["kind"],
  sourceFactId: string,
): GroundedResumeArtifact {
  const doc = emptyResumeDoc();
  doc.summary = "Backend engineer focused on reliable systems.";
  doc.sections = [
    {
      id: "section-1",
      type: "experience",
      title: "Experience",
      entries: [
        {
          id: "entry-1",
          heading: "Senior Engineer",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: ["Reduced API latency by 35%."],
        },
      ],
    },
  ];

  return {
    kind,
    doc,
    exportable: kind === "application",
    watermark: kind === "target" ? "ASPIRATIONAL — NOT FOR APPLICATION" : undefined,
    claims: [
      {
        path: "summary",
        text: doc.summary,
        sourceFactIds: [sourceFactId],
        mode: kind === "target" ? "aspirational" : "confirmed",
      },
      {
        path: "sections.0.entries.0.heading",
        text: "Senior Engineer",
        sourceFactIds: [sourceFactId],
        mode: kind === "target" ? "aspirational" : "confirmed",
      },
      {
        path: "sections.0.entries.0.bullets.0",
        text: "Reduced API latency by 35%.",
        sourceFactIds: [sourceFactId],
        mode: kind === "target" ? "aspirational" : "confirmed",
      },
    ],
  };
}

describe("career artifact integrity", () => {
  it("collects every generated factual field as a stable path", () => {
    const fields = collectGroundableText(artifact("application", FACT_ID).doc);
    expect([...fields.keys()]).toEqual([
      "summary",
      "sections.0.entries.0.heading",
      "sections.0.entries.0.bullets.0",
    ]);
  });

  it("accepts a fully grounded application artifact", () => {
    const result = validateArtifactIntegrity(
      artifact("application", FACT_ID),
      [fact(FACT_ID, "confirmed")],
    );
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("rejects aspirational facts from an application artifact", () => {
    const result = validateArtifactIntegrity(
      artifact("application", TARGET_FACT_ID),
      [fact(TARGET_FACT_ID, "aspirational")],
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("aspirational fact");
  });

  it("allows aspirational facts only in a non-exportable target artifact", () => {
    const target = artifact("target", TARGET_FACT_ID);
    expect(
      validateArtifactIntegrity(target, [
        fact(TARGET_FACT_ID, "aspirational"),
      ]).ok,
    ).toBe(true);

    target.exportable = true;
    const result = validateArtifactIntegrity(target, [
      fact(TARGET_FACT_ID, "aspirational"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      "A target-state artifact can never be exportable.",
    );
  });

  it("rejects ungrounded generated fields", () => {
    const draft = artifact("application", FACT_ID);
    draft.claims.pop();
    const result = validateArtifactIntegrity(draft, [
      fact(FACT_ID, "confirmed"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("has no grounded claim");
  });
});
