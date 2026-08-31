import { describe, expect, it } from "vitest";
import {
  autoFit,
  effectiveConfig,
  evaluateConfig,
  FIT_LIMITS,
} from "@/lib/fit/engine";
import { createStubMeasurer } from "@/lib/fit/stub-measurer";
import { defaultFitConfig } from "@/lib/fit/types";
import { computeLayout } from "@/lib/fit/layout";
import { optimizeMultiColumnFlow } from "@/lib/fit/flow";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import { emptyResumeDoc, newId } from "@/lib/resume/defaults";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import type { ResumeDoc } from "@/lib/resume/schema";
import { underfilledRightSidebarDoc } from "./fixtures/multi-column";

const measurer = createStubMeasurer();

function denseDoc(multiplier: number): ResumeDoc {
  const doc = structuredClone(SAMPLE_RESUME);
  const exp = doc.sections.find((s) => s.type === "experience")!;
  exp.entries = exp.entries.map((entry) => ({
    ...entry,
    bullets: Array.from({ length: multiplier }, (_, i) =>
      entry.bullets.map((b) => `${b} [dup ${i}]`),
    ).flat(),
  }));
  return doc;
}

/** Finer density knob: append k extra bullets (the sample is already ~full,
 *  so the standard→squeeze window is only a few bullets wide). */
function denseDocExtra(k: number): ResumeDoc {
  const doc = structuredClone(SAMPLE_RESUME);
  const exp = doc.sections.find((s) => s.type === "experience")!;
  const first = exp.entries[0];
  first.bullets = [
    ...first.bullets,
    ...Array.from({ length: k }, (_, i) => `Extra achievement number ${i} with some detail about the work done`),
  ];
  return doc;
}

function tinyDoc(): ResumeDoc {
  const doc = emptyResumeDoc();
  doc.contact = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "",
    location: "",
    links: [],
  };
  doc.sections = [
    {
      id: newId(),
      type: "experience",
      title: "Experience",
      entries: [
        {
          id: newId(),
          heading: "Engineer",
          subheading: "Analytical Engines Ltd",
          dateRange: "1843",
          location: "",
          bullets: ["Wrote the first algorithm intended for a machine."],
        },
      ],
    },
  ];
  return doc;
}

describe("autoFit", () => {
  it("fits the dense sample resume on one page", () => {
    const result = autoFit(SAMPLE_RESUME, measurer);
    expect(result.status).toBe("fit");
    expect(result.estimatedPages).toBe(1);
    const bodyPt = SAMPLE_RESUME.theme.sizes.body * result.config.sizeScale;
    expect(bodyPt).toBeGreaterThanOrEqual(FIT_LIMITS.minBodyPt - 1e-6);
    expect(result.fillRatio).toBeGreaterThan(0.5);
  });

  it("relaxes line-height, spacing and margins back toward the theme when content is light", () => {
    const result = autoFit(tinyDoc(), measurer);
    expect(result.status).toBe("fit");
    // light content → nearly the theme's own line-height and full margins
    expect(result.config.lineHeight).toBeGreaterThan(
      SAMPLE_RESUME.theme.lineHeight - 0.05,
    );
    expect(result.config.marginScale).toBeGreaterThan(0.95);
    expect(result.config.spacingScale).toBeGreaterThan(0.95);
  });

  it("grows the font for very sparse resumes (up to the growth cap)", () => {
    const result = autoFit(tinyDoc(), measurer);
    expect(result.config.sizeScale).toBeGreaterThan(1.05);
    expect(result.config.sizeScale).toBeLessThanOrEqual(
      FIT_LIMITS.maxGrowth + 1e-6,
    );
  });

  it("shrinks the font as content grows (monotonic)", () => {
    const small = autoFit(denseDoc(2), measurer);
    const large = autoFit(denseDoc(6), measurer);
    if (small.status === "fit" && large.status === "fit") {
      expect(large.config.sizeScale).toBeLessThanOrEqual(
        small.config.sizeScale + 1e-9,
      );
    } else {
      // the larger one must at least be the one more likely to overflow
      expect(large.status).toBe("overflow");
    }
  });

  it("reports overflow honestly when content cannot fit at readable floors", () => {
    const result = autoFit(denseDoc(30), measurer);
    expect(result.status).toBe("overflow");
    expect(result.estimatedPages).toBeGreaterThanOrEqual(2);
    // must be sitting at the deepest squeeze floors, not somewhere arbitrary
    const bodyPt = SAMPLE_RESUME.theme.sizes.body * result.config.sizeScale;
    expect(bodyPt).toBeCloseTo(FIT_LIMITS.minBodyPt, 3);
    expect(result.config.lineHeight).toBeCloseTo(
      FIT_LIMITS.squeeze.minLineHeight,
      3,
    );
  });

  it("uses deep squeeze before declaring overflow", () => {
    // Walk the density boundary one bullet at a time: some density must fail
    // standard floors yet still fit via deep squeeze (status fit + tight).
    const outcomes = [];
    for (let k = 1; k <= 24; k++) {
      const r = autoFit(denseDocExtra(k), measurer);
      outcomes.push({ k, status: r.status, tight: r.tight });
    }
    expect(outcomes.some((o) => o.status === "fit" && o.tight)).toBe(true);
    // and monotonic: once overflow starts, it never goes back to fit
    const firstOverflow = outcomes.findIndex((o) => o.status === "overflow");
    if (firstOverflow !== -1) {
      expect(
        outcomes.slice(firstOverflow).every((o) => o.status === "overflow"),
      ).toBe(true);
    }
  });

  it("never lets margins below the squeeze floor", () => {
    const result = autoFit(denseDoc(30), measurer);
    const m = SAMPLE_RESUME.theme.margins;
    const smallest = Math.min(m.top, m.right, m.bottom, m.left);
    expect(smallest * result.config.marginScale).toBeGreaterThanOrEqual(
      FIT_LIMITS.squeeze.minMarginPt - 0.5,
    );
  });

  it("repairs legacy manual configs that breach readability floors", () => {
    const doc = tinyDoc();
    doc.theme.margins = { top: 12, right: 12, bottom: 12, left: 12 };
    const config = effectiveConfig(
      doc,
      false,
      {
        sizeScale: 0.5,
        lineHeight: 0.9,
        spacingScale: 0.5,
        marginScale: 0.5,
      },
      null,
    );
    expect(doc.theme.sizes.body * config.sizeScale).toBeGreaterThanOrEqual(
      FIT_LIMITS.minBodyPt,
    );
    expect(config.lineHeight).toBeGreaterThanOrEqual(FIT_LIMITS.minLineHeight);
    expect(doc.theme.margins.left * config.marginXScale!).toBeGreaterThanOrEqual(
      FIT_LIMITS.minMarginPt,
    );
    expect(doc.theme.margins.top * config.marginYScale!).toBeGreaterThanOrEqual(
      FIT_LIMITS.minMarginPt,
    );
  });

  it("uses empty sidebar capacity before declaring a second page", () => {
    const doc = underfilledRightSidebarDoc();
    const baselineConfig = defaultFitConfig(doc.theme);
    const before = computeLayout(doc, baselineConfig, measurer);
    const optimizedConfig = optimizeMultiColumnFlow(
      doc,
      baselineConfig,
      measurer,
    );
    const after = computeLayout(doc, optimizedConfig, measurer);

    expect(before.fits).toBe(false);
    expect(optimizedConfig.placementOverrides?.projects).toBe(
      "region-sidebar",
    );
    expect(optimizedConfig.contactLayoutOverride).toBe("inline");
    expect(after.totalHeightPx).toBeLessThan(before.totalHeightPx - 100);

    const result = autoFit(doc, measurer);
    expect(result.status).toBe("fit");
    expect(result.estimatedPages).toBe(1);
    expect(result.config.placementOverrides?.projects).toBe(
      "region-sidebar",
    );
  });

  it.each(["two-column", "three-column"] as const)(
    "balances whole sections only across the body row for %s",
    (preset) => {
      const doc = underfilledRightSidebarDoc();
      doc.layout = createLayoutPreset(doc, preset);
      const baseline = defaultFitConfig(doc.theme);
      const before = computeLayout(doc, baseline, measurer);
      const optimized = optimizeMultiColumnFlow(doc, baseline, measurer);
      const after = computeLayout(doc, optimized, measurer);

      expect(after.totalHeightPx).toBeLessThanOrEqual(before.totalHeightPx);
      expect(optimized.contactLayoutOverride).toBe("inline");
      for (const regionId of Object.values(
        optimized.placementOverrides ?? {},
      )) {
        expect(regionId).toMatch(/^region-column-/);
        expect(regionId).not.toBe("region-header");
      }
    },
  );

  it("does not rewrite custom/imported flow or contact composition", () => {
    const doc = underfilledRightSidebarDoc();
    doc.layout = { ...doc.layout!, preset: "custom" };
    const optimized = optimizeMultiColumnFlow(
      doc,
      defaultFitConfig(doc.theme),
      measurer,
    );
    expect(optimized.placementOverrides).toBeUndefined();
    expect(optimized.contactLayoutOverride).toBeUndefined();
  });
});

describe("evaluateConfig", () => {
  it("reports overflow for default config on oversized content", () => {
    const metrics = computeLayout(
      denseDoc(30),
      defaultFitConfig(SAMPLE_RESUME.theme),
      measurer,
    );
    expect(metrics.fits).toBe(false);
    const result = evaluateConfig(
      denseDoc(30),
      defaultFitConfig(SAMPLE_RESUME.theme),
      measurer,
    );
    expect(result.status).toBe("overflow");
  });
});

describe("layout mirror — header/entry style tokens", () => {
  const cfg = defaultFitConfig(SAMPLE_RESUME.theme);

  it("plain contact row measures no taller than the icon row (and usually shorter/narrower)", () => {
    const withIcons = structuredClone(SAMPLE_RESUME);
    withIcons.theme.contactStyle = "icons";
    const plain = structuredClone(SAMPLE_RESUME);
    plain.theme.contactStyle = "plain";
    const a = computeLayout(withIcons, cfg, measurer);
    const b = computeLayout(plain, cfg, measurer);
    expect(b.totalHeightPx).toBeLessThanOrEqual(a.totalHeightPx + 1e-6);
  });

  it("inline subheading collapses the company line into the role line", () => {
    const ownLine = tinyDoc();
    ownLine.theme.entryStyle = {
      subheadingInline: false,
      subheadingItalic: false,
      dateItalic: false,
    };
    const inline = tinyDoc();
    inline.theme.entryStyle = {
      subheadingInline: true,
      subheadingItalic: true,
      dateItalic: true,
    };
    const a = computeLayout(ownLine, defaultFitConfig(ownLine.theme), measurer);
    const b = computeLayout(inline, defaultFitConfig(inline.theme), measurer);
    // "Engineer — Analytical Engines Ltd" fits on one line → the separate
    // company body line (10pt × 1.25 × 96/72 ≈ 16.7px) is reclaimed.
    expect(a.totalHeightPx - b.totalHeightPx).toBeGreaterThanOrEqual(15);
  });

  it("missing style tokens keep the legacy layout (defaults)", () => {
    const doc = structuredClone(SAMPLE_RESUME);
    delete doc.theme.headerAlignment;
    delete doc.theme.contactStyle;
    delete doc.theme.entryStyle;
    const legacy = computeLayout(doc, cfg, measurer);
    const explicit = computeLayout(SAMPLE_RESUME, cfg, measurer);
    expect(legacy.totalHeightPx).toBeCloseTo(explicit.totalHeightPx, 6);
  });
});
