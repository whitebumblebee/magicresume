import {
  layout,
  measureNaturalWidth,
  prepare,
  prepareWithSegments,
  type PreparedText,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import type { MeasureResult, TextMeasurer } from "./types";

/**
 * Production measurer backed by pretext: `prepare()` does one-time canvas
 * shaping per (text, font); `layout()` is pure arithmetic afterwards, so the
 * fit engine can evaluate hundreds of candidate configs per keystroke without
 * a single DOM reflow.
 *
 * Client-only — never import from server components or node tests.
 */
export function createPretextMeasurer(): TextMeasurer {
  const prepCache = new Map<string, PreparedText>();
  const segCache = new Map<string, PreparedTextWithSegments>();

  const prepared = (text: string, font: string): PreparedText => {
    const key = `${font}${text}`;
    let p = prepCache.get(key);
    if (!p) {
      p = prepare(text, font);
      prepCache.set(key, p);
    }
    return p;
  };

  const preparedSeg = (text: string, font: string): PreparedTextWithSegments => {
    const key = `${font}${text}`;
    let p = segCache.get(key);
    if (!p) {
      p = prepareWithSegments(text, font);
      segCache.set(key, p);
    }
    return p;
  };

  return {
    measure(text, font, widthPx, lineHeightPx): MeasureResult {
      if (!text.trim()) return { lineCount: 0, height: 0 };
      return layout(
        prepared(text, font),
        Math.max(8, widthPx),
        Math.max(4, lineHeightPx),
      );
    },
    width(text, font) {
      if (!text.trim()) return 0;
      return measureNaturalWidth(preparedSeg(text, font));
    },
  };
}

let singleton: TextMeasurer | null = null;

export function getMeasurer(): TextMeasurer {
  if (!singleton) singleton = createPretextMeasurer();
  return singleton;
}

/** Measurement is only correct once the webfonts are actually available to
 *  the canvas 2D context. Await this before running the engine. */
export async function ensureFontsLoaded(families: string[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const unique = [...new Set(families)];
  await Promise.all(
    unique.flatMap((family) => [
      document.fonts.load(`400 16px "${family}"`).catch(() => undefined),
      document.fonts.load(`700 16px "${family}"`).catch(() => undefined),
    ]),
  );
}
