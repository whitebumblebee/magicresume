import { stripBulletGlyph } from "@/lib/render/text-utils";

/**
 * Pure PDF text-item → line clustering. Deterministic and node-testable;
 * used by the client-side extractor (pdf-extract.ts).
 *
 * PDF coordinate space: y grows upward, so lines are emitted top-to-bottom.
 */

export interface PdfItem {
  str: string;
  /** left edge in pt */
  x: number;
  /** baseline y in pt (PDF space, y-up) */
  y: number;
  /** font size in pt */
  size: number;
  fontName: string;
  /** item advance width in pt */
  width: number;
}

export interface PdfLine {
  text: string;
  /** left edge of the line's first item */
  x: number;
  /** baseline y of the dominant item */
  y: number;
  /** dominant (max) font size on the line, pt */
  size: number;
  fontName: string;
  bold: boolean;
}

function isBoldFont(fontName: string): boolean {
  const n = fontName.toLowerCase();
  return (
    n.includes("bold") || n.includes("black") || n.includes("heavy") ||
    n.includes("semibold") || n.includes("demi")
  );
}

/**
 * Groups items into visual lines: same baseline (within a tolerance scaled by
 * font size), reading order top→bottom, left→right. Items on the same line are
 * joined with a space when the horizontal gap suggests one was intended.
 */
export function groupItemsIntoLines(
  items: PdfItem[],
  yToleranceFactor = 0.5,
): PdfLine[] {
  const real = items.filter((it) => it.str.trim().length > 0);
  if (real.length === 0) return [];

  // sort top→bottom (y desc), then left→right
  const sorted = [...real].sort((a, b) => b.y - a.y || a.x - b.x);

  const clusters: PdfItem[][] = [];
  let current: PdfItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  let currentSize = sorted[0].size;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const tolerance =
      Math.max(item.size, currentSize) * yToleranceFactor + 0.5;
    if (Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
      // keep anchor on the dominant size so a small superscript doesn't
      // swallow a following line
      if (item.size > currentSize * 1.2) {
        currentY = item.y;
        currentSize = item.size;
      }
    } else {
      clusters.push(current);
      current = [item];
      currentY = item.y;
      currentSize = item.size;
    }
  }
  clusters.push(current);

  return clusters.map((cluster) => {
    const lineItems = [...cluster].sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const it of lineItems) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        if (gap > 0.25 * it.size && !text.endsWith(" ")) text += " ";
      }
      text += it.str;
      prevEnd = it.x + it.width;
    }
    const dominant = lineItems.reduce((a, b) => (b.size > a.size ? b : a));
    const boldShare =
      lineItems.filter((it) => isBoldFont(it.fontName)).length /
      lineItems.length;
    return {
      text: stripBulletGlyph(text.replace(/\s+/g, " ").trim()),
      x: lineItems[0].x,
      y: dominant.y,
      size: Math.round(dominant.size * 10) / 10,
      fontName: dominant.fontName,
      bold: boldShare >= 0.5,
    };
  });
}
