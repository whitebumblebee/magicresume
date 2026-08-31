/**
 * Measurement abstraction for the fit engine. Implementations:
 *  - measure.ts        → pretext-backed (browser, production)
 *  - stub-measurer.ts  → deterministic approximation (tests, no DOM)
 */
export interface MeasureResult {
  lineCount: number;
  height: number;
}

export interface TextMeasurer {
  /** Wrap `text` at `widthPx`; report line count and total height (px). */
  measure(
    text: string,
    font: string,
    widthPx: number,
    lineHeightPx: number,
  ): MeasureResult;
  /** Natural single-line width of `text` in px. */
  width(text: string, font: string): number;
}

export function fontShorthand(
  weight: number,
  sizePx: number,
  family: string,
): string {
  return `${weight} ${round2(sizePx)}px "${family}"`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The levers the fit engine searches over. All multipliers are unitless. */
export interface FitConfig {
  /** Multiplies every theme font size (hierarchy preserved). */
  sizeScale: number;
  /** Absolute line-height multiplier. */
  lineHeight: number;
  /** Multiplies theme spacing values. */
  spacingScale: number;
  /** Multiplies theme margins. */
  marginScale: number;
  /** Axis-specific overrides; legacy saved configs fall back to marginScale. */
  marginXScale?: number;
  marginYScale?: number;
  /** Layout-aware horizontal and vertical compaction levers. */
  columnRatioScale?: number;
  columnGapScale?: number;
  regionPaddingXScale?: number;
  regionPaddingYScale?: number;
  inlineGapScale?: number;
  /** Auto-fit-only section moves between parallel regions. Keys are section
   * ids and values are target region ids. The ResumeDoc layout remains the
   * user's editable source of truth. */
  placementOverrides?: Record<string, string>;
  /** Auto-fit may collapse stacked contacts into the renderer's wrapping row
   * for standard presets. Custom/imported layouts keep their source choice. */
  contactLayoutOverride?: "inline" | "stacked";
}

export function defaultFitConfig(theme: { lineHeight: number }): FitConfig {
  return {
    sizeScale: 1,
    lineHeight: theme.lineHeight,
    spacingScale: 1,
    marginScale: 1,
    marginXScale: 1,
    marginYScale: 1,
    columnRatioScale: 1,
    columnGapScale: 1,
    regionPaddingXScale: 1,
    regionPaddingYScale: 1,
    inlineGapScale: 1,
  };
}
