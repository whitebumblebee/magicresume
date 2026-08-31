import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { computeLayout } from "@/lib/fit/layout";
import { defaultFitConfig, type TextMeasurer } from "@/lib/fit/types";
import { resolveResumeLayout } from "@/lib/render/layout-geometry";
import { ResumePage } from "@/lib/render/ResumePage";
import { emptyResumeDoc } from "@/lib/resume/defaults";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import { resumeLayoutSchema, type ResumeDoc } from "@/lib/resume/schema";

const fixedMeasurer: TextMeasurer = {
  measure(text, _font, _width, lineHeight) {
    return text.trim()
      ? { lineCount: 1, height: lineHeight }
      : { lineCount: 0, height: 0 };
  },
  width(text) {
    return text.length * 6;
  },
};

function twoFlowDoc(stacked = false): ResumeDoc {
  const doc = emptyResumeDoc();
  doc.contact.name = "Ada Lovelace";
  doc.sections = [
    {
      id: "section-left",
      type: "skills",
      title: "Skills",
      entries: [
        {
          id: "entry-left",
          heading: "",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: ["Mathematics"],
        },
      ],
    },
    {
      id: "section-right",
      type: "experience",
      title: "Experience",
      entries: [
        {
          id: "entry-right",
          heading: "Analyst",
          subheading: "",
          dateRange: "",
          location: "",
          bullets: ["Designed an analytical engine program."],
        },
      ],
    },
  ];
  doc.layout = {
    version: 1,
    preset: "sidebar-left",
    regions: [
      {
        id: "left",
        row: 0,
        column: 0,
        width: 0.34,
        background: "#102030",
        textColor: "#ffffff",
        headingColor: "#f0c040",
        padding: { top: 12, right: 10, bottom: 12, left: 10 },
        minHeight: 0,
        fillPage: false,
        divider: { side: "right", color: "#f0c040", width: 1 },
        repeatOnPage: false,
      },
      {
        id: "right",
        row: stacked ? 1 : 0,
        column: stacked ? 0 : 1,
        width: 0.66,
        padding: { top: 4, right: 0, bottom: 4, left: 0 },
        minHeight: 0,
        fillPage: false,
        entryAccent: {
          side: "left",
          color: "#336699",
          width: 2,
          gap: 5,
        },
        repeatOnPage: false,
      },
    ],
    placements: [
      { kind: "identity", regionId: "left", order: 0 },
      { kind: "contact", regionId: "left", order: 1 },
      { kind: "summary", regionId: "left", order: 2 },
      {
        kind: "section",
        sectionId: "section-left",
        regionId: "left",
        order: 3,
      },
      {
        kind: "section",
        sectionId: "section-right",
        regionId: "right",
        order: 0,
      },
    ],
    columnGap: 18,
    rowGap: 10,
    confidence: 0.9,
    unsupportedFeatures: [],
  };
  return doc;
}

function splitHeaderFidelityDoc(): ResumeDoc {
  const doc = twoFlowDoc();
  doc.contact.name = "ALEX MORGAN";
  doc.contact.phone = "+1 555 0100";
  doc.contact.email = "alex@example.test";
  doc.contact.location = "Pune, India";
  doc.contact.details = [
    { id: "detail-experience", label: "Experience", value: "4 Years" },
  ];
  doc.headline = "Platform Developer";
  doc.summaryTitle = "Profile Summary";
  doc.summary = "Builds reliable backend systems.";
  doc.theme.colors.primary = "#3366ff";
  doc.theme.colors.name = "#111111";
  doc.theme.sectionHeaderStyle = { case: "title", rule: "none" };
  doc.theme.contactStyle = "labeled";
  doc.theme.contactLayout = "stacked";
  doc.theme.contactLabelStyle = {
    case: "upper",
    divider: true,
    labelWidth: 72,
    rowGap: 7,
  };
  doc.theme.identityStyle = {
    nameLayout: "stacked",
    accent: "first-word",
    headlineCase: "upper",
    headlineSize: 13,
    headlineGap: 16,
  };
  doc.layout = {
    version: 1,
    preset: "custom",
    regions: [
      {
        id: "identity-header",
        row: 0,
        column: 0,
        width: 0.39,
        padding: { top: 8, right: 12, bottom: 12, left: 8 },
        minHeight: 0,
        fillPage: false,
        repeatOnPage: false,
      },
      {
        id: "contact-header",
        row: 0,
        column: 1,
        width: 0.61,
        padding: { top: 0, right: 0, bottom: 0, left: 24 },
        minHeight: 0,
        fillPage: false,
        repeatOnPage: false,
      },
      {
        id: "left-body",
        row: 1,
        column: 0,
        width: 0.39,
        padding: { top: 24, right: 12, bottom: 0, left: 8 },
        minHeight: 0,
        fillPage: false,
        divider: { side: "top", color: "#3366ff", width: 8 },
        repeatOnPage: false,
      },
      {
        id: "right-body",
        row: 1,
        column: 1,
        width: 0.61,
        padding: { top: 20, right: 0, bottom: 0, left: 24 },
        minHeight: 0,
        fillPage: false,
        repeatOnPage: false,
      },
    ],
    placements: [
      { kind: "identity", regionId: "identity-header", order: 0 },
      {
        kind: "rule",
        regionId: "contact-header",
        order: 0,
        rule: {
          orientation: "vertical",
          color: "#111111",
          width: 1.5,
          length: 70,
          align: "start",
          marginBefore: 0,
          marginAfter: 10,
        },
      },
      { kind: "contact", regionId: "contact-header", order: 1 },
      {
        kind: "rule",
        regionId: "contact-header",
        order: 2,
        rule: {
          orientation: "vertical",
          color: "#111111",
          width: 1.5,
          length: 36,
          align: "start",
          marginBefore: 10,
          marginAfter: 0,
        },
      },
      {
        kind: "section",
        sectionId: doc.sections[0].id,
        regionId: "left-body",
        order: 0,
      },
      { kind: "summary", regionId: "right-body", order: 0 },
      {
        kind: "section",
        sectionId: doc.sections[1].id,
        regionId: "right-body",
        order: 1,
      },
    ],
    columnGap: 18,
    rowGap: 0,
    confidence: 0.96,
    unsupportedFeatures: [],
  };
  return doc;
}

describe("region layout", () => {
  it.each([
    "single",
    "sidebar-left",
    "sidebar-right",
    "two-column",
    "three-column",
  ] as const)("creates a complete %s preset", (preset) => {
    const doc = twoFlowDoc();
    const layout = createLayoutPreset(doc, preset);
    expect(resumeLayoutSchema.safeParse(layout).success).toBe(true);
    for (const kind of ["identity", "contact", "summary"] as const) {
      expect(
        layout.placements.filter((placement) => placement.kind === kind),
      ).toHaveLength(1);
    }
    expect(
      layout.placements
        .filter((placement) => placement.kind === "section")
        .map((placement) => placement.sectionId)
        .sort(),
    ).toEqual(doc.sections.map((section) => section.id).sort());
  });
  it("resolves asymmetric columns and both-axis scales from one geometry model", () => {
    const doc = twoFlowDoc();
    const cfg = {
      ...defaultFitConfig(doc.theme),
      marginXScale: 0.8,
      marginYScale: 0.9,
      columnRatioScale: 0.85,
      columnGapScale: 0.5,
      regionPaddingXScale: 0.75,
      regionPaddingYScale: 0.5,
    };
    const layout = resolveResumeLayout(doc, cfg);
    const [left, right] = layout.rows[0].regions;

    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].gapPx).toBeCloseTo(12, 5);
    expect(left.widthPx / right.widthPx).toBeCloseTo(
      Math.pow(0.34 / 0.66, 0.85),
      5,
    );
    expect(left.padding.l).toBeCloseTo(10, 5);
    expect(left.padding.t).toBeCloseTo(8, 5);
    expect(left.contentWidthPx).toBeLessThan(left.widthPx);
  });

  it("uses the tallest parallel flow per row instead of flattening columns", () => {
    const parallel = twoFlowDoc(false);
    const stacked = twoFlowDoc(true);
    const parallelMetrics = computeLayout(
      parallel,
      defaultFitConfig(parallel.theme),
      fixedMeasurer,
    );
    const stackedMetrics = computeLayout(
      stacked,
      defaultFitConfig(stacked.theme),
      fixedMeasurer,
    );

    expect(parallelMetrics.totalHeightPx).toBeLessThan(
      stackedMetrics.totalHeightPx,
    );
    expect(stackedMetrics.totalHeightPx - parallelMetrics.totalHeightPx).toBeGreaterThan(
      40,
    );
  });

  it("applies fit-only section moves only within the same parallel row", () => {
    const doc = twoFlowDoc();
    const config = {
      ...defaultFitConfig(doc.theme),
      placementOverrides: {
        "section-right": "left",
        "section-left": "missing-region",
      },
    };
    const resolved = resolveResumeLayout(doc, config);
    const leftSections = resolved.rows[0].regions[0].placements
      .filter((placement) => placement.kind === "section")
      .map((placement) => placement.sectionId);
    const rightSections = resolved.rows[0].regions[1].placements
      .filter((placement) => placement.kind === "section")
      .map((placement) => placement.sectionId);
    expect(leftSections).toEqual(["section-left", "section-right"]);
    expect(rightSections).toEqual([]);
  });

  it("renders region backgrounds, dividers, and entry accents", () => {
    const doc = twoFlowDoc();
    const html = renderToStaticMarkup(
      <ResumePage doc={doc} config={defaultFitConfig(doc.theme)} />,
    );

    expect(html).toContain("background:#102030");
    expect(html).toContain("border-right:1.3333333333333333px solid #f0c040");
    expect(html).toContain("border-left:2.6666666666666665px solid #336699");
    expect(html).toContain("Skills");
    expect(html).toContain("Experience");
  });

  it("preserves split-header identity, labeled contacts, titles, and rules", () => {
    const doc = splitHeaderFidelityDoc();
    expect(resumeLayoutSchema.safeParse(doc.layout).success).toBe(true);

    const config = defaultFitConfig(doc.theme);
    const html = renderToStaticMarkup(<ResumePage doc={doc} config={config} />);
    const metrics = computeLayout(doc, config, fixedMeasurer);

    expect(html).toContain("color:#3366ff\">ALEX");
    expect(html).toContain("MORGAN");
    expect(html).toContain("PLATFORM DEVELOPER");
    expect(html).toContain("Profile Summary");
    expect(html).toContain("EXPERIENCE");
    expect(html).toContain("grid-template-columns:96px 1px minmax(0, 1fr)");
    expect(html).toContain("border-top:10.666666666666666px solid #3366ff");
    expect(html).toContain("height:93.33333333333333px");
    expect(metrics.totalHeightPx).toBeGreaterThan(0);
  });
});
