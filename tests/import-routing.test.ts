import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateStructured } = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}));
vi.mock("@/lib/llm/client", () => ({ generateStructured }));

import { runImportPdf } from "@/lib/import/service";

function extraction(confidence: number) {
  return {
    resume: {
      contact: {
        name: "Demo Candidate",
        email: "candidate@example.test",
        phone: "",
        location: "",
        links: [],
      },
      summary: "Engineer.",
      sections: [
        {
          type: "experience",
          title: "Experience",
          entries: [
            {
              heading: "Engineer",
              subheading: "Example Co",
              dateRange: "2024",
              location: "",
              bullets: ["Built a reliable platform."],
            },
          ],
        },
      ],
    },
    theme: {},
    layout: {
      preset: "single",
      regions: [
        {
          id: "main",
          row: 0,
          column: 0,
          width: 1,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      ],
      placements: [
        { kind: "identity", regionId: "main", order: 0 },
        { kind: "contact", regionId: "main", order: 1 },
        { kind: "summary", regionId: "main", order: 2 },
        {
          kind: "section",
          regionId: "main",
          order: 3,
          sectionIndex: 0,
        },
      ],
      columnGap: 0,
      rowGap: 0,
      confidence,
      unsupportedFeatures: [],
    },
  };
}

const input = {
  pageSize: "A4" as const,
  pageWidthPt: 595.28,
  pageHeightPt: 841.89,
  pageLines: [[{ text: "Demo Candidate", x: 40, size: 20, bold: true }]],
  images: ["data:image/png;base64,AAAA"],
};

describe("profiled resume layout extraction", () => {
  beforeEach(() => generateStructured.mockReset());

  it("accepts a confident routine extraction without a second call", async () => {
    generateStructured.mockResolvedValueOnce(extraction(0.9));
    const doc = await runImportPdf(input);
    expect(doc.layout?.confidence).toBe(0.9);
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateStructured.mock.calls[0][0].profile).toBe("resume-import");
  });

  it("runs one focused high-thinking profile for low confidence", async () => {
    const first = extraction(0.4);
    const retriedLayout = { ...extraction(0.92).layout, preset: "two-column" };
    generateStructured
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ theme: first.theme, layout: retriedLayout });

    const doc = await runImportPdf(input);
    expect(doc.layout?.preset).toBe("two-column");
    expect(doc.layout?.confidence).toBe(0.92);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1][0]).toMatchObject({
      profile: "layout-retry",
      maxAttempts: 1,
    });
  });

  it("runs screenshot-authoritative design validation for complex layouts", async () => {
    const first = extraction(0.95);
    first.layout.preset = "two-column";
    first.layout.regions.push({
      id: "right",
      row: 0,
      column: 1,
      width: 0.6,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const validated = {
      theme: {
        identityStyle: {
          nameLayout: "stacked",
          accent: "first-word",
          headlineCase: "upper",
          headlineSize: 13,
          headlineGap: 12,
        },
        contactStyle: "labeled",
      },
      layout: first.layout,
    };
    generateStructured.mockResolvedValueOnce(first).mockResolvedValueOnce(validated);

    const doc = await runImportPdf(input);
    expect(doc.theme.identityStyle?.nameLayout).toBe("stacked");
    expect(doc.theme.contactStyle).toBe("labeled");
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1][0]).toMatchObject({
      profile: "layout-retry",
      maxAttempts: 1,
    });
  });

  it("falls back to the safe first extraction when the focused retry fails", async () => {
    generateStructured
      .mockResolvedValueOnce(extraction(0.4))
      .mockRejectedValueOnce(new Error("focused retry unavailable"));
    const doc = await runImportPdf(input);
    expect(doc.layout?.preset).toBe("single");
    expect(doc.layout?.confidence).toBe(0.4);
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });
});
