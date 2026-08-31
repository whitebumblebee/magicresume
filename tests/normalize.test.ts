import { describe, expect, it } from "vitest";
import { normalizeImportResult } from "@/lib/import/normalize";
import { resumeDocSchema } from "@/lib/resume/schema";

const validResult = {
  resume: {
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 555 0100",
      location: "NYC",
      links: [{ label: "", url: "https://github.com/janedoe" }],
    },
    summary: "Engineer.",
    sections: [
      {
        type: "experience",
        title: "EXPERIENCE",
        entries: [
          {
            heading: "Role",
            subheading: "Corp",
            dateRange: "2020",
            location: "",
            bullets: ["**Proj:** built things", "shipped"],
          },
        ],
      },
    ],
  },
  theme: {
    fonts: { heading: "Helvetical", body: "Roboto" },
    colors: { primary: "#1a2b3c", text: "not-a-hex", muted: "#444444" },
    sizes: { name: 999, body: 2 },
    lineHeight: 9,
    margins: { top: -5, left: 30 },
    spacing: { section: 8 },
    sectionHeaderStyle: { case: "upper", rule: "bottom" },
    dateStyle: "right",
    bulletGlyph: "•",
    boldLeadIns: true,
  },
};

describe("normalizeImportResult", () => {
  it("produces a schema-valid ResumeDoc from messy LLM output", () => {
    const doc = normalizeImportResult(validResult, "LETTER");
    expect(resumeDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.page.size).toBe("LETTER");
    expect(doc.layout?.preset).toBe("single");
    expect(doc.layout?.placements).toHaveLength(4);
  });

  it("normalizes region geometry and repairs incomplete placements", () => {
    const withLayout = {
      ...structuredClone(validResult),
      layout: {
        preset: "sidebar-left",
        regions: [
          {
            id: "sidebar",
            row: -4,
            column: 0,
            width: 0.01,
            background: "#102030",
            padding: { top: -2, right: 12, bottom: 999, left: 12 },
            repeatOnPage: true,
          },
          {
            id: "sidebar",
            row: 0,
            column: 1,
            width: 3,
            background: "invalid",
          },
        ],
        placements: [
          { kind: "identity", regionId: "sidebar", order: 0 },
          { kind: "identity", regionId: "missing", order: 1 },
          {
            kind: "section",
            regionId: "missing",
            order: 2,
            sectionIndex: 0,
          },
        ],
        columnGap: 999,
        rowGap: -1,
        confidence: 4,
        unsupportedFeatures: [
          "photo",
          "",
          "a".repeat(200),
        ],
      },
    };

    const doc = normalizeImportResult(withLayout);
    expect(resumeDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.layout?.regions.map((region) => region.id)).toEqual([
      "sidebar",
      "sidebar-2",
    ]);
    expect(doc.layout?.regions[0]).toMatchObject({
      row: 0,
      width: 0.12,
      background: "#102030",
      padding: { top: 0, right: 12, bottom: 72, left: 12 },
    });
    expect(doc.layout?.regions[1].background).toBeUndefined();
    expect(doc.layout?.columnGap).toBe(72);
    expect(doc.layout?.rowGap).toBe(0);
    expect(doc.layout?.confidence).toBe(1);
    expect(doc.layout?.unsupportedFeatures).toEqual([
      "Repeated regions on later pages require manual approximation.",
      "photo",
      "a".repeat(120),
    ]);
    expect(doc.layout?.regions[0].repeatOnPage).toBe(false);
    expect(
      doc.layout?.placements.filter((placement) => placement.kind === "identity"),
    ).toHaveLength(1);
    expect(
      doc.layout?.placements.find((placement) => placement.kind === "section"),
    ).toMatchObject({ sectionId: doc.sections[0].id });
    expect(
      doc.layout?.placements.map((placement) => placement.kind),
    ).toEqual(expect.arrayContaining(["identity", "contact", "summary", "section"]));
  });

  it("clamps out-of-range numbers to sane values", () => {
    const doc = normalizeImportResult(validResult);
    expect(doc.theme.sizes.name).toBeLessThanOrEqual(32);
    expect(doc.theme.sizes.body).toBeGreaterThanOrEqual(8.5);
    expect(doc.theme.lineHeight).toBeLessThanOrEqual(1.6);
    expect(doc.theme.lineHeight).toBeGreaterThanOrEqual(1.1);
    expect(doc.theme.margins.top).toBeGreaterThanOrEqual(18);
  });

  it("rejects invalid hex colors and falls back to defaults", () => {
    const doc = normalizeImportResult(validResult);
    expect(doc.theme.colors.primary).toBe("#1a2b3c");
    expect(doc.theme.colors.text).toBe("#1f2937"); // default (input was invalid)
  });

  it("maps unknown fonts onto the allowlist", () => {
    const doc = normalizeImportResult(validResult);
    // "Helvetical" should not survive verbatim
    expect(doc.theme.fonts.heading).not.toBe("Helvetical");
    expect(doc.theme.fonts.body).toBe("Roboto");
  });

  it("maps common PDF font names via aliases", () => {
    const base = structuredClone(validResult);
    base.resume.sections = []; // keep it minimal
    for (const [input, expected] of [
      ["Times New Roman PSMT", "PT Serif"],
      ["ABCDEF+Calibri-Bold", "Carlito"],
      ["ArialMT", "Inter"],
      ["Garamond", "EB Garamond"],
      ["Verdana", "Open Sans"],
    ] as const) {
      const doc = normalizeImportResult({
        ...base,
        theme: { ...base.theme, fonts: { heading: input, body: input } },
      });
      expect(doc.theme.fonts.heading, input).toBe(expected);
    }
  });

  it("infers link labels when missing", () => {
    const doc = normalizeImportResult(validResult);
    expect(doc.contact.links[0].label).toBe("GitHub");
  });

  it("canonicalizes imported web links and drops unsafe protocols", () => {
    const withLinks = structuredClone(validResult);
    withLinks.resume.contact.links = [
      { label: "Portfolio", url: "example.test/work" },
      { label: "Unsafe", url: "javascript:alert(1)" },
    ];
    const doc = normalizeImportResult(withLinks);
    expect(doc.contact.links).toEqual([
      expect.objectContaining({
        label: "Portfolio",
        url: "https://example.test/work",
      }),
    ]);
  });

  it("drops empty entries/sections and keeps bold markers", () => {
    const doc = normalizeImportResult(validResult);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].entries[0].bullets[0]).toBe("**Proj:** built things");
  });

  it("strips leftover bullet glyphs and numbering from bullets", () => {
    const messy = structuredClone(validResult);
    messy.resume.sections[0].entries[0].bullets = [
      "• Built a thing",
      "• • Doubled markers",
      "- Dash marker",
      "– En dash marker",
      "3. numbered",
      "**• Lead:** with glyph",
    ];
    const doc = normalizeImportResult(messy);
    expect(doc.sections[0].entries[0].bullets).toEqual([
      "Built a thing",
      "Doubled markers",
      "Dash marker",
      "En dash marker",
      "numbered",
      "**Lead:** with glyph",
    ]);
  });

  it("throws on structurally invalid LLM output", () => {
    expect(() => normalizeImportResult({ nonsense: true })).toThrow();
  });

  it("defaults the header/entry style tokens when the LLM omits them", () => {
    const doc = normalizeImportResult(validResult);
    expect(doc.theme.headerAlignment).toBe("left");
    expect(doc.theme.contactStyle).toBe("icons");
    expect(doc.theme.entryStyle).toEqual({
      subheadingInline: false,
      subheadingItalic: false,
      dateItalic: false,
    });
    expect(doc.theme.colors.name).toBe(doc.theme.colors.primary);
  });

  it("passes through header/entry style tokens from the LLM", () => {
    const styled = structuredClone(validResult) as unknown as {
      theme: Record<string, unknown> & {
        colors: Record<string, unknown>;
        entryStyle: Record<string, unknown>;
      };
    };
    styled.theme.colors.name = "#000000";
    styled.theme.headerAlignment = "center";
    styled.theme.contactStyle = "plain";
    styled.theme.entryStyle = {
      subheadingInline: true,
      subheadingItalic: true,
      dateItalic: true,
    };
    const doc = normalizeImportResult(styled);
    expect(doc.theme.colors.name).toBe("#000000");
    expect(doc.theme.headerAlignment).toBe("center");
    expect(doc.theme.contactStyle).toBe("plain");
    expect(doc.theme.entryStyle).toEqual({
      subheadingInline: true,
      subheadingItalic: true,
      dateItalic: true,
    });
  });

  it("normalizes screenshot-fidelity identity, contacts, summary title, and rules", () => {
    const styled = structuredClone(validResult) as typeof validResult & {
      resume: typeof validResult.resume & {
        headline?: string;
        summaryTitle?: string;
        contact: typeof validResult.resume.contact & {
          details?: { label: string; value: string }[];
        };
      };
      layout?: Record<string, unknown>;
    };
    styled.resume.headline = "Platform Developer";
    styled.resume.summaryTitle = "Profile Summary";
    styled.resume.contact.details = [
      { label: "Experience", value: "4 Years" },
    ];
    Object.assign(styled.theme, {
      contactStyle: "labeled",
      contactLayout: "stacked",
      contactLabelStyle: {
        case: "upper",
        divider: true,
        labelWidth: 999,
        rowGap: -2,
      },
      identityStyle: {
        nameLayout: "stacked",
        accent: "first-word",
        headlineCase: "upper",
        headlineSize: 99,
        headlineGap: 99,
      },
    });
    styled.layout = {
      preset: "custom",
      regions: [
        {
          id: "header",
          row: 0,
          column: 0,
          width: 1,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      ],
      placements: [
        { kind: "identity", regionId: "header", order: 0 },
        {
          kind: "rule",
          regionId: "header",
          order: 1,
          rule: {
            orientation: "vertical",
            color: "#3366ff",
            width: 99,
            length: 999,
            align: "start",
            marginBefore: -2,
            marginAfter: 999,
          },
        },
        { kind: "contact", regionId: "header", order: 2 },
        { kind: "summary", regionId: "header", order: 3 },
        {
          kind: "section",
          regionId: "header",
          order: 4,
          sectionIndex: 0,
        },
      ],
      columnGap: 0,
      rowGap: 0,
      confidence: 0.9,
      unsupportedFeatures: [],
    };

    const doc = normalizeImportResult(styled);
    expect(resumeDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.headline).toBe("Platform Developer");
    expect(doc.summaryTitle).toBe("Profile Summary");
    expect(doc.contact.details?.[0]).toMatchObject({
      label: "Experience",
      value: "4 Years",
    });
    expect(doc.theme.contactStyle).toBe("labeled");
    expect(doc.theme.contactLabelStyle).toMatchObject({
      labelWidth: 140,
      rowGap: 0,
    });
    expect(doc.theme.identityStyle).toMatchObject({
      headlineSize: 24,
      headlineGap: 36,
    });
    expect(
      doc.layout?.placements.find((placement) => placement.kind === "rule"),
    ).toMatchObject({
      rule: {
        width: 8,
        length: 400,
        marginBefore: 0,
        marginAfter: 72,
      },
    });
  });

  it("maps Charter to a serif allowlist font", () => {
    const base = structuredClone(validResult);
    base.resume.sections = [];
    const doc = normalizeImportResult({
      ...base,
      theme: {
        ...base.theme,
        fonts: { heading: "Charter", body: "Charter-Bold" },
      },
    });
    expect(doc.theme.fonts.heading).toBe("Source Serif 4");
    expect(doc.theme.fonts.body).toBe("Source Serif 4");
  });
});
