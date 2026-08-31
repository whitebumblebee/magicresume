"use client";

import type { PdfItem, PdfLine } from "./pdf-lines";
import { groupItemsIntoLines } from "./pdf-lines";
import { PAGE_DIMS } from "@/lib/resume/defaults";
import type { PageSize } from "@/lib/resume/schema";

/**
 * Client-side PDF extraction (browser pdfjs — no native deps). Produces:
 *  - text lines with font metadata for deterministic content reconstruction
 *  - page renders (JPEG data URLs) for Gemini style/theme inference
 *
 * Everything is computed locally; only the resulting JSON + images go to the
 * server route (where GEMINI_API_KEY lives).
 */

export interface PdfExtract {
  pageSize: PageSize;
  pageWidthPt: number;
  pageHeightPt: number;
  /** per-page lines, reading order */
  pageLines: PdfLine[][];
  /** up to `maxImagePages` page renders as JPEG data URLs */
  images: string[];
}

const MAX_TEXT_PAGES = 6;
const MAX_IMAGE_PAGES = 2;
const RENDER_TARGET_WIDTH = 1240; // ~150dpi for an A4 — enough for theme reads

export async function extractPdf(file: File): Promise<PdfExtract> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pageLines: PdfLine[][] = [];
  const images: string[] = [];
  let pageWidthPt = PAGE_DIMS.A4.widthPt;
  let pageHeightPt = PAGE_DIMS.A4.heightPt;

  const pageCount = Math.min(pdf.numPages, MAX_TEXT_PAGES);
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    if (i === 1) {
      pageWidthPt = base.width;
      pageHeightPt = base.height;
    }

    const textContent = await page.getTextContent();
    // fontName on items is an internal id; `styles` maps it to the embedded
    // family name (e.g. "g_d0_f1" → "Calibri"). Without this the font census
    // and LLM font inference have nothing real to work with.
    const styleMap = (textContent.styles ?? {}) as Record<
      string,
      { fontFamily?: string }
    >;
    const items: PdfItem[] = [];
    for (const raw of textContent.items) {
      if (!("str" in raw) || !raw.str) continue;
      const t = raw.transform; // [a, b, c, d, e, f]
      const size = Math.hypot(t[1], t[3]) || Math.abs(t[3]) || raw.height;
      if (!size || !isFinite(size)) continue;
      items.push({
        str: raw.str,
        x: t[4],
        y: t[5],
        size,
        fontName:
          styleMap[raw.fontName ?? ""]?.fontFamily?.replace(/^[A-Z]{6}\+/, "") ??
          raw.fontName ??
          "",
        width: raw.width ?? raw.str.length * size * 0.5,
      });
    }
    pageLines.push(groupItemsIntoLines(items));

    if (images.length < MAX_IMAGE_PAGES) {
      images.push(await renderPageToJpeg(page, base.width));
    }
  }

  const pageSize = detectPageSize(pageWidthPt, pageHeightPt);
  return { pageSize, pageWidthPt, pageHeightPt, pageLines, images };
}

async function renderPageToJpeg(
  page: import("pdfjs-dist").PDFPageProxy,
  widthPt: number,
): Promise<string> {
  const viewport = page.getViewport({ scale: RENDER_TARGET_WIDTH / widthPt });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function detectPageSize(w: number, h: number): PageSize {
  const a4 = PAGE_DIMS.A4;
  const letter = PAGE_DIMS.LETTER;
  const dA4 = Math.abs(w - a4.widthPt) + Math.abs(h - a4.heightPt);
  const dLetter = Math.abs(w - letter.widthPt) + Math.abs(h - letter.heightPt);
  return dA4 <= dLetter ? "A4" : "LETTER";
}
