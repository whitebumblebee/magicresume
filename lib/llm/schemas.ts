import { z } from "zod";
import { FONT_OPTIONS } from "@/lib/resume/defaults";
import {
  engagementKindSchema,
  MAX_ENGAGEMENT_BULLETS,
  MAX_ENGAGEMENT_CHILDREN,
  MAX_ENGAGEMENTS_PER_LEVEL,
  organizationVisibilitySchema,
} from "@/lib/resume/schema";
import { MAX_MARKDOWN_LENGTH } from "@/lib/resume/markdown";

/**
 * LLM output contracts for import/clone. Everything is optional at the LLM
 * boundary — `normalize.ts` merges over DEFAULT_THEME and clamps, so a bad or
 * partial LLM answer can never produce an invalid ResumeDoc.
 */

export const allowedFonts = FONT_OPTIONS;

export const llmLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const llmEngagementFields = {
  kind: engagementKindSchema,
  name: z.string().max(240),
  role: z.string().max(240),
  organization: z.string().max(240),
  visibility: organizationVisibilitySchema,
  confidentialLabel: z.string().max(120),
  dateRange: z.string().max(120),
  location: z.string().max(160),
  narrative: z.string().max(MAX_MARKDOWN_LENGTH),
  bullets: z.array(z.string().max(1_000)).max(MAX_ENGAGEMENT_BULLETS),
};

export const llmChildEngagementSchema = z
  .object(llmEngagementFields)
  .partial()
  .strict();

export const llmEngagementSchema = z
  .object({
    ...llmEngagementFields,
    engagements: z.array(llmChildEngagementSchema).max(MAX_ENGAGEMENT_CHILDREN),
  })
  .partial()
  .strict();

export const llmEntrySchema = z.object({
  heading: z.string(),
  subheading: z.string(),
  dateRange: z.string(),
  location: z.string(),
  bullets: z.array(z.string()),
  kind: engagementKindSchema.optional(),
  organizationVisibility: organizationVisibilitySchema.optional(),
  confidentialLabel: z.string().max(120).optional(),
  narrative: z.string().max(MAX_MARKDOWN_LENGTH).optional(),
  engagements: z
    .array(llmEngagementSchema)
    .max(MAX_ENGAGEMENTS_PER_LEVEL)
    .optional(),
});

export const llmSectionSchema = z.object({
  type: z.enum([
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "awards",
    "custom",
  ]),
  title: z.string(),
  entries: z.array(llmEntrySchema),
});

export const llmResumeSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(llmLinkSchema),
    details: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .optional(),
  }),
  headline: z.string().optional(),
  summary: z.string(),
  summaryTitle: z.string().optional(),
  sections: z.array(llmSectionSchema),
});

export const llmThemeSchema = z.object({
  // Free-form at the LLM boundary — normalize.ts maps fonts onto the
  // allowlist and validates hex colors, so the model can't produce an
  // invalid theme by naming a non-allowlist font.
  fonts: z
    .object({
      heading: z.string(),
      body: z.string(),
    })
    .partial()
    .optional(),
  colors: z
    .object({
      primary: z.string(),
      text: z.string(),
      muted: z.string(),
      name: z.string(),
    })
    .partial()
    .optional(),
  sizes: z
    .object({
      name: z.number(),
      sectionHeader: z.number(),
      entryHeading: z.number(),
      body: z.number(),
    })
    .partial()
    .optional(),
  lineHeight: z.number().optional(),
  margins: z
    .object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    })
    .partial()
    .optional(),
  spacing: z
    .object({
      section: z.number(),
      entry: z.number(),
      bullet: z.number(),
      header: z.number(),
    })
    .partial()
    .optional(),
  sectionHeaderStyle: z
    .object({
      case: z.enum(["smallcaps", "upper", "title"]),
      rule: z.enum(["bottom", "none"]),
    })
    .partial()
    .optional(),
  dateStyle: z.enum(["right", "inline"]).optional(),
  bulletGlyph: z.enum(["•", "–", "▪", "none"]).optional(),
  boldLeadIns: z.boolean().optional(),
  headerAlignment: z.enum(["left", "center"]).optional(),
  contactStyle: z.enum(["icons", "plain", "labeled"]).optional(),
  contactLayout: z.enum(["inline", "stacked"]).optional(),
  contactLabelStyle: z
    .object({
      case: z.enum(["as-is", "upper", "title"]),
      divider: z.boolean(),
      labelWidth: z.number(),
      rowGap: z.number(),
    })
    .partial()
    .optional(),
  identityStyle: z
    .object({
      nameLayout: z.enum(["inline", "stacked"]),
      accent: z.enum(["none", "first-word"]),
      headlineCase: z.enum(["as-is", "upper", "title"]),
      headlineSize: z.number(),
      headlineGap: z.number(),
    })
    .partial()
    .optional(),
  entryStyle: z
    .object({
      subheadingInline: z.boolean().optional(),
      subheadingItalic: z.boolean().optional(),
      dateItalic: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const llmLayoutRegionSchema = z.object({
  id: z.string(),
  row: z.number(),
  column: z.number(),
  width: z.number(),
  background: z.string().optional(),
  textColor: z.string().optional(),
  mutedColor: z.string().optional(),
  headingColor: z.string().optional(),
  padding: z
    .object({
      top: z.number(),
      right: z.number(),
      bottom: z.number(),
      left: z.number(),
    })
    .partial()
    .optional(),
  minHeight: z.number().optional(),
  fillPage: z.boolean().optional(),
  divider: z
    .object({
      side: z.enum(["left", "right", "top", "bottom"]),
      color: z.string(),
      width: z.number(),
    })
    .optional(),
  entryAccent: z
    .object({
      side: z.enum(["left", "right"]),
      color: z.string(),
      width: z.number(),
      gap: z.number(),
    })
    .optional(),
  repeatOnPage: z.boolean().optional(),
});

export const llmLayoutPlacementSchema = z.object({
  kind: z.enum(["identity", "contact", "summary", "section", "rule"]),
  regionId: z.string(),
  order: z.number(),
  sectionIndex: z.number().optional(),
  rule: z
    .object({
      orientation: z.enum(["horizontal", "vertical"]),
      color: z.string(),
      width: z.number(),
      length: z.number(),
      align: z.enum(["start", "center", "end"]),
      marginBefore: z.number(),
      marginAfter: z.number(),
    })
    .partial()
    .optional(),
});

export const llmLayoutSchema = z.object({
  preset: z.enum([
    "single",
    "sidebar-left",
    "sidebar-right",
    "two-column",
    "three-column",
    "custom",
  ]),
  regions: z.array(llmLayoutRegionSchema),
  placements: z.array(llmLayoutPlacementSchema),
  columnGap: z.number(),
  rowGap: z.number(),
  confidence: z.number(),
  unsupportedFeatures: z.array(z.string()),
});

export const llmImportResultSchema = z.object({
  resume: llmResumeSchema,
  theme: llmThemeSchema,
  layout: llmLayoutSchema.optional(),
});

/**
 * Vertex structured output has a bounded schema-complexity budget. Keep its
 * import grammar flat and carry optional work hierarchy as a JSON string that
 * is parsed through the full local Zod contracts before normalization.
 */
const llmGenerationEntrySchema = llmEntrySchema.omit({
  kind: true,
  organizationVisibility: true,
  confidentialLabel: true,
  narrative: true,
  engagements: true,
});

const llmGenerationSectionSchema = llmSectionSchema.extend({
  entries: z.array(llmGenerationEntrySchema),
});

const llmGenerationResumeSchema = llmResumeSchema.extend({
  sections: z.array(llmGenerationSectionSchema),
});

export const llmImportGenerationSchema = z.object({
  resume: llmGenerationResumeSchema,
  theme: llmThemeSchema,
  layout: llmLayoutSchema.optional(),
  // Optional like every other LLM-boundary field: a model that omits the
  // hierarchy patch must degrade to a valid flat resume, never fail the import.
  engagementHierarchyJson: z.string().optional(),
});

const llmHierarchyEntryPatchSchema = llmEntrySchema
  .pick({
    kind: true,
    organizationVisibility: true,
    confidentialLabel: true,
    narrative: true,
    engagements: true,
  })
  .extend({
    sectionIndex: z.number().int().min(0),
    entryIndex: z.number().int().min(0),
  })
  .strict();

const llmHierarchyPatchSchema = z.array(llmHierarchyEntryPatchSchema).max(80);

export type LlmImportGeneration = z.infer<typeof llmImportGenerationSchema>;

/** Expand the compact Vertex response into the full trusted import contract. */
export function expandImportGenerationResult(
  generated: LlmImportGeneration,
): LlmImportResult {
  const result = llmImportResultSchema.parse({
    resume: generated.resume,
    theme: generated.theme,
    layout: generated.layout,
  });
  const encoded = generated.engagementHierarchyJson?.trim() ?? "";
  if (!encoded || encoded.length > 100_000) return result;

  let decoded: unknown;
  try {
    decoded = JSON.parse(encoded);
  } catch {
    return result;
  }
  const patches = llmHierarchyPatchSchema.safeParse(decoded);
  if (!patches.success) return result;

  for (const patch of patches.data) {
    const { sectionIndex, entryIndex } = patch;
    const entry = result.resume.sections[sectionIndex]?.entries[entryIndex];
    if (!entry) continue;
    if (patch.kind !== undefined) entry.kind = patch.kind;
    if (patch.organizationVisibility !== undefined) {
      entry.organizationVisibility = patch.organizationVisibility;
    }
    if (patch.confidentialLabel !== undefined) {
      entry.confidentialLabel = patch.confidentialLabel;
    }
    if (patch.narrative !== undefined) entry.narrative = patch.narrative;
    if (patch.engagements !== undefined) entry.engagements = patch.engagements;
  }
  return llmImportResultSchema.parse(result);
}

/** Focused second-pass result for screenshot-authoritative design validation.
 * Content remains owned by the first pass and cannot be rewritten here. */
export const llmVisualDesignSchema = z.object({
  theme: llmThemeSchema,
  layout: llmLayoutSchema,
});

export type LlmImportResult = z.infer<typeof llmImportResultSchema>;

/**
 * "Make it fit" compression — LLM returns edits referencing bullets by
 * (sectionIndex, entryIndex, bulletIndex) with the original text echoed back
 * for verification. Never applied blindly: the service verifies every edit
 * against the doc before the client sees it.
 */
export const llmCompressionEditSchema = z.object({
  sectionIndex: z.number().int().min(0),
  entryIndex: z.number().int().min(0),
  bulletIndex: z.number().int().min(0),
  original: z.string().min(1),
  compressed: z.string(),
  action: z.enum(["shorten", "drop"]),
  reason: z.string(),
});

export const llmCompressionSchema = z.object({
  edits: z.array(llmCompressionEditSchema),
});

export type LlmCompressionEdit = z.infer<typeof llmCompressionEditSchema>;

/** ATS rubric — LLM-side qualitative scoring. */
export const llmAtsSchema = z.object({
  score: z.number().min(0).max(100),
  impact: z.object({ score: z.number().min(0).max(100), note: z.string() }),
  clarity: z.object({ score: z.number().min(0).max(100), note: z.string() }),
  keywords: z.object({ score: z.number().min(0).max(100), note: z.string() }),
  strengths: z.array(z.string()),
  fixes: z.array(
    z.object({
      // Free-form at the LLM boundary; the UI maps unknown targets to a
      // sensible default instead of failing the whole report.
      target: z.string(),
      issue: z.string(),
      suggestion: z.string(),
    }),
  ),
  jdEvidence: z
    .object({
      matchedTerms: z.array(
        z.object({
          term: z.string(),
          evidence: z.string(),
          sectionTitle: z.string(),
        }),
      ),
      missingTerms: z.array(z.string()),
    })
    .optional(),
});

export type LlmAts = z.infer<typeof llmAtsSchema>;
