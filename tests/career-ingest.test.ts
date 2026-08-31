import { describe, expect, it } from "vitest";
import {
  nextClarifyingQuestion,
  resumeToFactDrafts,
  scoreCareerEvidence,
} from "@/lib/career/ingest";
import { emptyResumeDoc } from "@/lib/resume/defaults";

describe("career memory intake", () => {
  it("preserves source provenance and extracts truthful metrics", () => {
    const doc = emptyResumeDoc();
    doc.sections = [
      {
        id: "experience",
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: "entry",
            heading: "Gameplay Engineer",
            subheading: "Pixel Studio",
            dateRange: "2024–2026",
            location: "Remote",
            bullets: [
              "Owned multiplayer synchronization and reduced latency by 35%.",
            ],
          },
        ],
      },
    ];
    const [fact] = resumeToFactDrafts(doc, "resume:test");
    expect(fact.state).toBe("inferred");
    expect(fact.metrics).toContain("35%");
    expect(fact.sources[0]).toMatchObject({
      type: "resume_pdf",
      reference: "resume:test",
    });
    expect(fact.qualityScore).toBeGreaterThanOrEqual(80);
  });

  it("keeps a stable source entry key when only evidence wording changes", () => {
    const doc = emptyResumeDoc();
    doc.sections = [
      {
        id: "experience",
        type: "experience",
        title: "Experience",
        entries: [
          {
            id: "entry",
            heading: "Platform Engineer",
            subheading: "Example Co",
            dateRange: "2024 – Present",
            location: "",
            bullets: ["Reduced release time by 30%."],
          },
        ],
      },
    ];
    const first = resumeToFactDrafts(doc, "saved", { keyedEntries: true });
    doc.sections[0].entries[0].bullets = ["Reduced release time by 35%."];
    const changed = resumeToFactDrafts(doc, "saved", { keyedEntries: true });
    expect(changed[0].sources[0].key).toBe(first[0].sources[0].key);
    expect(changed[0].sources[0].metadata.evidenceFingerprint).not.toBe(
      first[0].sources[0].metadata.evidenceFingerprint,
    );
  });

  it("asks for ownership before suggesting invented numbers", () => {
    const question = nextClarifyingQuestion({
      title: "Backend migration",
      description: "Worked on a backend migration.",
      metrics: [],
      qualityScore: 20,
    });
    expect(question).toContain("personally own");
    expect(question).not.toMatch(/guess|estimate|invent/i);
  });

  it("scores ownership, outcomes, and metrics as stronger evidence", () => {
    expect(
      scoreCareerEvidence(
        "Led the redesign and reduced request latency by 40% for 20k users.",
      ),
    ).toBeGreaterThan(
      scoreCareerEvidence("Helped with a redesign project."),
    );
  });
});
