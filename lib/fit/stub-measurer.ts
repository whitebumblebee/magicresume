import type { MeasureResult, TextMeasurer } from "./types";

/**
 * Deterministic measurer for node tests — no DOM, no pretext.
 * Approximates glyph advance as `charWidthRatio × font-size` and wraps
 * greedily by words. Sizes are parsed out of the font shorthand produced by
 * fontShorthand().
 *
 * Default 0.48 ≈ real average glyph advance for common sans fonts
 * (Carlito/Lato measure ~0.45–0.52); 0.5 overestimates and pushes dense
 * fixtures past fit floors.
 */
export function createStubMeasurer(charWidthRatio = 0.48): TextMeasurer {
  const sizeOf = (font: string): number => {
    const match = font.match(/([\d.]+)px/);
    return match ? parseFloat(match[1]) : 16;
  };

  const charWidth = (font: string) => sizeOf(font) * charWidthRatio;

  return {
    measure(text, font, widthPx, lineHeightPx): MeasureResult {
      if (!text.trim()) return { lineCount: 0, height: 0 };
      const cw = charWidth(font);
      const words = text.split(/\s+/).filter(Boolean);
      let lines = 1;
      let lineW = 0;
      for (const word of words) {
        const wordW = word.length * cw;
        const spaceW = lineW > 0 ? cw : 0;
        if (lineW > 0 && lineW + spaceW + wordW > widthPx) {
          lines += 1;
          lineW = wordW;
        } else {
          lineW += spaceW + wordW;
        }
      }
      return { lineCount: lines, height: lines * lineHeightPx };
    },
    width(text, font) {
      return text.length * charWidth(font);
    },
  };
}
