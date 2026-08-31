import { generateStructured } from "@/lib/llm/client";
import {
  expandImportGenerationResult,
  llmImportGenerationSchema,
  llmVisualDesignSchema,
  type LlmImportResult,
} from "@/lib/llm/schemas";
import { normalizeImportResult } from "./normalize";
import {
  cloneSystemPrompt,
  cloneUserPrompt,
  importSystemPrompt,
  importUserPrompt,
  visualRetrySystemPrompt,
  serializeLinesForPrompt,
} from "@/lib/llm/prompts";
import type { PageSize } from "@/lib/resume/schema";

/**
 * Import/clone core, shared by the API routes and the live e2e test.
 * Route handlers do HTTP guards; this does the Gemini work + normalization.
 */

export interface ImportPdfArgs {
  pageSize: PageSize;
  pageWidthPt: number;
  pageHeightPt: number;
  pageLines: {
    text: string;
    x: number;
    size: number;
    bold: boolean;
    fontName?: string;
  }[][];
  images: string[];
}

/** Aggregate embedded font usage so the LLM grounds its theme in real data
 *  instead of eyeballing the render. Top entries by character count. */
export function fontCensus(pageLines: ImportPdfArgs["pageLines"]): string {
  const acc = new Map<string, number>();
  for (const lines of pageLines) {
    for (const line of lines) {
      if (!line.text) continue;
      const family = (line.fontName || "unknown").split(/[-,]/)[0] || "unknown";
      const key = `${family} @ ${Math.round(line.size)}pt`;
      acc.set(key, (acc.get(key) ?? 0) + line.text.length);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, chars]) => `${k} — ${chars} chars`)
    .join("\n");
}

export async function runImportPdf(args: ImportPdfArgs) {
  const generated = await generateStructured({
    system: importSystemPrompt(),
    parts: [
      {
        text:
          importUserPrompt({
            pageWidthPt: args.pageWidthPt,
            pageHeightPt: args.pageHeightPt,
            numPages: args.pageLines.length,
            fontCensus: fontCensus(args.pageLines),
          }) + serializeLinesForPrompt(args.pageLines),
      },
      ...args.images.map((dataUrl) => ({ dataUrl })),
    ],
    schema: llmImportGenerationSchema,
    profile: "resume-import",
  });
  let result = expandImportGenerationResult(generated);
  result = await validateVisualDesignIfNeeded(result, [
    {
      text: [
        "Prior extraction JSON:",
        JSON.stringify(result),
        "Original extracted line geometry:",
        serializeLinesForPrompt(args.pageLines),
      ].join("\n"),
    },
    ...args.images.map((dataUrl) => ({ dataUrl })),
  ]);
  return normalizeImportResult(result, args.pageSize);
}

export async function runCloneScreenshot(image: string) {
  const generated = await generateStructured({
    system: cloneSystemPrompt(),
    parts: [{ text: cloneUserPrompt() }, { dataUrl: image }],
    schema: llmImportGenerationSchema,
    profile: "resume-import",
    maxOutputTokens: 20000,
  });
  let result = expandImportGenerationResult(generated);
  result = await validateVisualDesignIfNeeded(result, [
    { text: `Prior extraction JSON:\n${JSON.stringify(result)}` },
    { dataUrl: image },
  ]);
  return normalizeImportResult(result);
}

async function validateVisualDesignIfNeeded(
  result: LlmImportResult,
  parts: Parameters<typeof generateStructured>[0]["parts"],
): Promise<LlmImportResult> {
  const needsFocusedVisualPass =
    !result.layout ||
    result.layout.confidence < 0.8 ||
    result.layout.preset !== "single" ||
    result.layout.regions.length > 1;
  if (!needsFocusedVisualPass) return result;
  try {
    const design = await generateStructured({
      system: visualRetrySystemPrompt(),
      parts,
      schema: llmVisualDesignSchema,
      profile: "layout-retry",
      maxOutputTokens: 9000,
      maxAttempts: 1,
    });
    return {
      ...result,
      theme: {
        ...result.theme,
        ...design.theme,
        fonts: { ...result.theme.fonts, ...design.theme.fonts },
        colors: { ...result.theme.colors, ...design.theme.colors },
        sizes: { ...result.theme.sizes, ...design.theme.sizes },
        margins: { ...result.theme.margins, ...design.theme.margins },
        spacing: { ...result.theme.spacing, ...design.theme.spacing },
        sectionHeaderStyle: {
          ...result.theme.sectionHeaderStyle,
          ...design.theme.sectionHeaderStyle,
        },
        contactLabelStyle: {
          ...result.theme.contactLabelStyle,
          ...design.theme.contactLabelStyle,
        },
        identityStyle: {
          ...result.theme.identityStyle,
          ...design.theme.identityStyle,
        },
        entryStyle: {
          ...result.theme.entryStyle,
          ...design.theme.entryStyle,
        },
      },
      layout: design.layout,
    };
  } catch {
    // The first pass remains safe: normalization repairs incomplete layout or
    // falls back to the backward-compatible single flow.
    return result;
  }
}
