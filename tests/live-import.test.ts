import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runImportPdf, runCloneScreenshot } from "@/lib/import/service";
import { resumeDocSchema } from "@/lib/resume/schema";

/**
 * LIVE e2e tests — call the real LLM provider. Skipped unless
 * OPENAI_API_KEY or GEMINI_API_KEY is set.
 * Run: OPENAI_API_KEY=… npx vitest run tests/live-import.test.ts
 */

const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
const d = describe.skipIf(!hasKey);

const fixtures = path.resolve(__dirname, "fixtures");

async function extractLinesWithPdfjs(): Promise<{
  pageLines: { text: string; x: number; size: number; bold: boolean }[][];
  pageWidthPt: number;
  pageHeightPt: number;
}> {
  // legacy build = node-compatible (no DOM worker / canvas requirements for
  // text extraction)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(
    readFileSync(path.join(fixtures, "sample-resume.pdf")),
  );
  const pdf = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    useSystemFonts: false,
  }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const rawItems = tc.items as Array<Record<string, unknown>>;
  const items = [];
  for (const it of rawItems) {
    const str = it.str;
    if (typeof str !== "string" || !str) continue;
    const t = it.transform as number[];
    items.push({
      str,
      x: t[4],
      y: t[5],
      size: Math.hypot(t[1], t[3]),
      fontName: (it.fontName as string) ?? "",
      width: (it.width as number) ?? 0,
    });
  }
  const { groupItemsIntoLines } = await import("@/lib/import/pdf-lines");
  return {
    pageLines: [groupItemsIntoLines(items)],
    pageWidthPt: viewport.width,
    pageHeightPt: viewport.height,
  };
}

d("live: import-pdf service", () => {
  it(
    "round-trips the fixture PDF into a valid ResumeDoc",
    { timeout: 120_000 },
    async () => {
      const { pageLines, pageWidthPt, pageHeightPt } =
        await extractLinesWithPdfjs();
      expect(pageLines[0].length).toBeGreaterThan(20);

      const png = readFileSync(path.join(fixtures, "sample-page.png"));
      const image = `data:image/png;base64,${png.toString("base64")}`;

      const doc = await runImportPdf({
        pageSize: "A4",
        pageWidthPt,
        pageHeightPt,
        pageLines,
        images: [image],
      });

      expect(resumeDocSchema.safeParse(doc).success).toBe(true);
      expect(doc.contact.name).toContain("Shishir");
      expect(doc.sections.length).toBeGreaterThan(2);
      const experience = doc.sections.find((s) => s.type === "experience");
      expect(experience?.entries.length).toBeGreaterThan(3);
      expect(
        experience?.entries.some((e) => e.bullets.some((b) => b.startsWith("**"))),
      ).toBe(true);
    },
  );
});

d("live: clone-screenshot service", () => {
  it(
    "clones the fixture page image into a valid ResumeDoc",
    { timeout: 120_000 },
    async () => {
      const png = readFileSync(path.join(fixtures, "sample-page.png"));
      const doc = await runCloneScreenshot(
        `data:image/png;base64,${png.toString("base64")}`,
      );
      expect(resumeDocSchema.safeParse(doc).success).toBe(true);
      expect(doc.contact.name).toContain("Shishir");
      expect(doc.sections.length).toBeGreaterThan(1);
    },
  );
});
