import type { ResumeDoc } from "@/lib/resume/schema";
import { computeLayout, type LayoutMetrics } from "./layout";
import { defaultFitConfig, type FitConfig, type TextMeasurer } from "./types";
import { optimizeMultiColumnFlow } from "./flow";

export const FIT_LIMITS = {
  /** Body text never shrinks below this — readability floor. */
  minBodyPt: 8.5,
  /** Sparse resumes may grow up to this multiple of the theme's base size. */
  maxGrowth: 1.35,
  sizeStepPt: 0.25,
  minLineHeight: 1.1,
  maxLineHeight: 1.6,
  minSpacingScale: 0.55,
  minColumnGapScale: 0.7,
  minRegionPaddingXScale: 0.75,
  minRegionPaddingYScale: 0.75,
  minInlineGapScale: 0.7,
  minColumnRatioScale: 0.85,
  maxColumnRatioScale: 1.15,
  /** No page margin may go below this (pt) in the standard phase. */
  minMarginPt: 18,
  /** Absolute last resort before declaring overflow: squeeze harder.
   *  Body size floor still applies — readability is never breached. */
  squeeze: {
    minLineHeight: 1.1,
    minSpacingScale: 0.5,
    minMarginPt: 18,
    minColumnGapScale: 0.5,
    minRegionPaddingXScale: 0.6,
    minRegionPaddingYScale: 0.6,
    minInlineGapScale: 0.5,
  },
} as const;

export interface FitResult extends LayoutMetrics {
  config: FitConfig;
  status: "fit" | "overflow";
  estimatedPages: number;
  /** True when the fit only succeeds at deep-squeeze floors. */
  tight: boolean;
}

function minAxisMarginScale(
  first: number,
  second: number,
  minPt: number,
): number {
  return minPt / Math.min(first, second);
}

function marginFloors(
  margins: ResumeDoc["theme"]["margins"],
  minPt: number,
): { x: number; y: number } {
  return {
    x: minAxisMarginScale(margins.left, margins.right, minPt),
    y: minAxisMarginScale(margins.top, margins.bottom, minPt),
  };
}

export function minMarginScale(
  margins: { top: number; right: number; bottom: number; left: number },
  minPt: number,
): number {
  const smallest = Math.min(margins.top, margins.right, margins.bottom, margins.left);
  return minPt / smallest;
}

export function enforceReadability(
  doc: ResumeDoc,
  config: FitConfig,
): FitConfig {
  const marginXFloor = minAxisMarginScale(
    doc.theme.margins.left,
    doc.theme.margins.right,
    FIT_LIMITS.minMarginPt,
  );
  const marginYFloor = minAxisMarginScale(
    doc.theme.margins.top,
    doc.theme.margins.bottom,
    FIT_LIMITS.minMarginPt,
  );
  const marginXScale = Math.max(
    config.marginXScale ?? config.marginScale,
    marginXFloor,
  );
  const marginYScale = Math.max(
    config.marginYScale ?? config.marginScale,
    marginYFloor,
  );
  return {
    ...config,
    sizeScale: Math.max(
      config.sizeScale,
      FIT_LIMITS.minBodyPt / doc.theme.sizes.body,
    ),
    lineHeight: Math.max(config.lineHeight, FIT_LIMITS.minLineHeight),
    marginScale: Math.max(marginXScale, marginYScale),
    marginXScale,
    marginYScale,
  };
}

/** Largest value in [lo, hi] whose predicate still holds. Predicate must be
 *  monotonic (true at lo, false somewhere above). */
function bsearchMax(
  lo: number,
  hi: number,
  pred: (v: number) => boolean,
  iterations = 14,
): number {
  if (!pred(lo)) return lo;
  let best = lo;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (pred(mid)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

interface Floors {
  lineHeight: number;
  spacingScale: number;
  marginXScale: number;
  marginYScale: number;
  columnGapScale: number;
  regionPaddingXScale: number;
  regionPaddingYScale: number;
  inlineGapScale: number;
}

function toResult(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
  tight: boolean,
): FitResult {
  const safeConfig = enforceReadability(doc, config);
  const metrics = computeLayout(doc, safeConfig, measurer);
  return {
    ...metrics,
    config: safeConfig,
    status: metrics.fits ? "fit" : "overflow",
    tight,
    estimatedPages: metrics.fits
      ? 1
      : Math.max(2, Math.ceil(metrics.totalHeightPx / metrics.contentHeightPx)),
  };
}

/**
 * One search attempt at a given floor set:
 *  1. Largest font size at the tightest floors (font shrink and margin
 *     shrinking work together — margins are already at their floor here).
 *  2. Relax line-height → spacing → margins back toward the theme while it
 *     still fits.
 * Returns null if no font size down to the floor fits at these floors.
 */
function searchAtFloors(
  doc: ResumeDoc,
  measurer: TextMeasurer,
  floors: Floors,
): FitConfig | null {
  const theme = doc.theme;
  const base = theme.sizes.body;
  const fits = (cfg: FitConfig) => computeLayout(doc, cfg, measurer).fits;

  let chosen: FitConfig | null = null;
  const startPt = base * FIT_LIMITS.maxGrowth;
  const ratioCandidates = [1, 0.95, 1.05, 0.9, 1.1, 0.85, 1.15];
  const flowByRatio = new Map<number, FitConfig>();
  for (const columnRatioScale of ratioCandidates) {
    const seed: FitConfig = {
      sizeScale: FIT_LIMITS.minBodyPt / base,
      lineHeight: floors.lineHeight,
      spacingScale: floors.spacingScale,
      marginScale: Math.max(floors.marginXScale, floors.marginYScale),
      marginXScale: floors.marginXScale,
      marginYScale: floors.marginYScale,
      columnRatioScale,
      columnGapScale: floors.columnGapScale,
      regionPaddingXScale: floors.regionPaddingXScale,
      regionPaddingYScale: floors.regionPaddingYScale,
      inlineGapScale: floors.inlineGapScale,
    };
    flowByRatio.set(
      columnRatioScale,
      optimizeMultiColumnFlow(doc, seed, measurer),
    );
  }
  for (
    let bodyPt = startPt;
    bodyPt >= FIT_LIMITS.minBodyPt - 1e-6;
    bodyPt -= FIT_LIMITS.sizeStepPt
  ) {
    for (const columnRatioScale of ratioCandidates) {
      const flow = flowByRatio.get(columnRatioScale);
      const cfg: FitConfig = {
        sizeScale: bodyPt / base,
        lineHeight: floors.lineHeight,
        spacingScale: floors.spacingScale,
        marginScale: Math.max(floors.marginXScale, floors.marginYScale),
        marginXScale: floors.marginXScale,
        marginYScale: floors.marginYScale,
        columnRatioScale,
        columnGapScale: floors.columnGapScale,
        regionPaddingXScale: floors.regionPaddingXScale,
        regionPaddingYScale: floors.regionPaddingYScale,
        inlineGapScale: floors.inlineGapScale,
        placementOverrides: flow?.placementOverrides,
        contactLayoutOverride: flow?.contactLayoutOverride,
      };
      if (fits(cfg)) {
        chosen = cfg;
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) return null;
  // Re-score flow at the selected readable font size before relaxing the
  // remaining visual dimensions. This is the width+height Pretext pass that
  // decides whether compact sections should consume another column.
  chosen = optimizeMultiColumnFlow(doc, chosen, measurer);

  const lhMax = Math.min(
    Math.max(theme.lineHeight, floors.lineHeight),
    FIT_LIMITS.maxLineHeight,
  );
  chosen = {
    ...chosen,
    lineHeight: bsearchMax(floors.lineHeight, lhMax, (v) =>
      fits({ ...chosen!, lineHeight: v }),
    ),
  };
  chosen = {
    ...chosen,
    spacingScale: bsearchMax(floors.spacingScale, 1, (v) =>
      fits({ ...chosen!, spacingScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    regionPaddingYScale: bsearchMax(floors.regionPaddingYScale, 1, (v) =>
      fits({ ...chosen!, regionPaddingYScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    marginYScale: bsearchMax(floors.marginYScale, 1, (v) =>
      fits({ ...chosen!, marginYScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    inlineGapScale: bsearchMax(floors.inlineGapScale, 1, (v) =>
      fits({ ...chosen!, inlineGapScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    columnGapScale: bsearchMax(floors.columnGapScale, 1, (v) =>
      fits({ ...chosen!, columnGapScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    regionPaddingXScale: bsearchMax(floors.regionPaddingXScale, 1, (v) =>
      fits({ ...chosen!, regionPaddingXScale: v }),
    ),
  };
  chosen = {
    ...chosen,
    marginXScale: bsearchMax(floors.marginXScale, 1, (v) =>
      fits({ ...chosen!, marginXScale: v }),
    ),
  };
  chosen.marginScale = Math.max(
    chosen.marginXScale ?? chosen.marginScale,
    chosen.marginYScale ?? chosen.marginScale,
  );
  const rebalanced = optimizeMultiColumnFlow(doc, chosen, measurer);
  if (fits(rebalanced)) chosen = rebalanced;
  return chosen;
}

/**
 * Staged search:
 *  Phase A — standard readability floors (margins ≥ 18pt, lh ≥ 1.1).
 *  Phase B — spacing/gap/padding squeeze while preserving the same 18pt
 *            margin and 1.1 line-height floors before
 *            giving up; body size never breaches 8.5pt.
 */
export function autoFit(doc: ResumeDoc, measurer: TextMeasurer): FitResult {
  const standardMargins = marginFloors(
    doc.theme.margins,
    FIT_LIMITS.minMarginPt,
  );
  const standard = searchAtFloors(doc, measurer, {
    lineHeight: FIT_LIMITS.minLineHeight,
    spacingScale: FIT_LIMITS.minSpacingScale,
    marginXScale: standardMargins.x,
    marginYScale: standardMargins.y,
    columnGapScale: FIT_LIMITS.minColumnGapScale,
    regionPaddingXScale: FIT_LIMITS.minRegionPaddingXScale,
    regionPaddingYScale: FIT_LIMITS.minRegionPaddingYScale,
    inlineGapScale: FIT_LIMITS.minInlineGapScale,
  });
  if (standard) return toResult(doc, standard, measurer, false);

  const squeezedMargins = marginFloors(
    doc.theme.margins,
    FIT_LIMITS.squeeze.minMarginPt,
  );
  const squeezeFloors: Floors = {
    lineHeight: FIT_LIMITS.squeeze.minLineHeight,
    spacingScale: FIT_LIMITS.squeeze.minSpacingScale,
    marginXScale: squeezedMargins.x,
    marginYScale: squeezedMargins.y,
    columnGapScale: FIT_LIMITS.squeeze.minColumnGapScale,
    regionPaddingXScale: FIT_LIMITS.squeeze.minRegionPaddingXScale,
    regionPaddingYScale: FIT_LIMITS.squeeze.minRegionPaddingYScale,
    inlineGapScale: FIT_LIMITS.squeeze.minInlineGapScale,
  };
  const squeezed = searchAtFloors(doc, measurer, squeezeFloors);
  if (squeezed) return toResult(doc, squeezed, measurer, true);

  // Even deep squeeze overflows — report honestly (LLM compression / manual
  // trimming are the remaining levers).
  const tightest: FitConfig = optimizeMultiColumnFlow(doc, {
    sizeScale: FIT_LIMITS.minBodyPt / doc.theme.sizes.body,
    lineHeight: squeezeFloors.lineHeight,
    spacingScale: squeezeFloors.spacingScale,
    marginScale: Math.max(
      squeezeFloors.marginXScale,
      squeezeFloors.marginYScale,
    ),
    marginXScale: squeezeFloors.marginXScale,
    marginYScale: squeezeFloors.marginYScale,
    columnRatioScale: 1,
    columnGapScale: squeezeFloors.columnGapScale,
    regionPaddingXScale: squeezeFloors.regionPaddingXScale,
    regionPaddingYScale: squeezeFloors.regionPaddingYScale,
    inlineGapScale: squeezeFloors.inlineGapScale,
  }, measurer);
  return toResult(doc, tightest, measurer, true);
}

/** Evaluate a fixed (manual) config without searching. */
export function evaluateConfig(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
): FitResult {
  return toResult(doc, config, measurer, false);
}

export function effectiveConfig(
  doc: ResumeDoc,
  autoFitOn: boolean,
  manual: FitConfig | null,
  fit: FitResult | null,
): FitConfig {
  return enforceReadability(doc, (
    (autoFitOn ? fit?.config : null) ??
    manual ??
    fit?.config ??
    defaultFitConfig(doc.theme)
  ));
}
