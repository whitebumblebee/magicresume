import { z } from "zod";
import { cleanInlineMarkdown, cleanMarkdown, isSafeMarkdown } from "./markdown";

export const pageSizeSchema = z.enum(["A4", "LETTER"]);

export const contactLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
});

export const contactDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

export const contactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(contactLinkSchema),
  // Source resumes sometimes present labeled identity metadata (for example
  // EXPERIENCE or WORK AUTHORIZATION) alongside phone/email/location.
  details: z.array(contactDetailSchema).optional(),
});

export const engagementKindSchema = z.enum([
  "employer",
  "practice",
  "client",
  "account",
  "product",
  "project",
  "program",
  "assignment",
  "contract",
  "site",
  "facility",
  "department",
  "campaign",
  "production",
  "research",
  "clinical",
  "teaching",
  "service",
  "volunteer",
  "portfolio",
  "custom",
]);

export const organizationVisibilitySchema = z.enum([
  "named",
  "confidential",
  "omitted",
]);

export const MAX_ENGAGEMENTS_PER_ENTRY = 40;
export const MAX_ENGAGEMENTS_PER_LEVEL = 16;
export const MAX_ENGAGEMENT_CHILDREN = 12;
export const MAX_ENGAGEMENT_BULLETS = 40;
export const MAX_INLINE_MARKDOWN_LENGTH = 1_000;

const boundedMarkdownSchema = z
  .string()
  .transform((value) => cleanMarkdown(value))
  .refine(isSafeMarkdown, "Markdown contains unsupported or unsafe syntax.");

const boundedInlineMarkdownSchema = z
  .string()
  .transform((value) => cleanInlineMarkdown(value, MAX_INLINE_MARKDOWN_LENGTH))
  .refine(isSafeMarkdown, "Markdown contains unsupported or unsafe syntax.");

const engagementFields = {
  id: z.string().min(1).max(128),
  kind: engagementKindSchema,
  name: z.string().max(240),
  role: z.string().max(240),
  organization: z.string().max(240),
  visibility: organizationVisibilitySchema,
  confidentialLabel: z.string().max(120),
  dateRange: z.string().max(120),
  location: z.string().max(160),
  narrative: boundedMarkdownSchema,
  bullets: z.array(boundedInlineMarkdownSchema).max(MAX_ENGAGEMENT_BULLETS),
};

export const childEngagementSchema = z
  .object(engagementFields)
  .strict()
  .superRefine((engagement, ctx) => {
    if (engagement.visibility !== "named" && engagement.organization.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organization"],
        message: "Hidden organizations must not retain the real name.",
      });
    }
    if (
      engagement.visibility !== "confidential" &&
      engagement.confidentialLabel.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidentialLabel"],
        message: "Only confidential organizations may retain a private label.",
      });
    }
  });

export const engagementSchema = z
  .object({
    ...engagementFields,
    engagements: z
      .array(childEngagementSchema)
      .max(MAX_ENGAGEMENT_CHILDREN)
      .optional(),
  })
  .strict()
  .superRefine((engagement, ctx) => {
    if (engagement.visibility !== "named" && engagement.organization.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organization"],
        message: "Hidden organizations must not retain the real name.",
      });
    }
    if (
      engagement.visibility !== "confidential" &&
      engagement.confidentialLabel.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidentialLabel"],
        message: "Only confidential organizations may retain a private label.",
      });
    }
  });

export const entrySchema = z
  .object({
    id: z.string(),
    heading: z.string(),
    subheading: z.string(),
    dateRange: z.string(),
    location: z.string(),
    bullets: z
      .array(boundedInlineMarkdownSchema)
      .transform((bullets) => bullets.slice(0, MAX_ENGAGEMENT_BULLETS)),
    kind: engagementKindSchema.optional(),
    organizationVisibility: organizationVisibilitySchema.optional(),
    confidentialLabel: z.string().max(120).optional(),
    narrative: boundedMarkdownSchema.optional(),
    engagements: z
      .array(engagementSchema)
      .max(MAX_ENGAGEMENTS_PER_LEVEL)
      .optional(),
  })
  .superRefine((entry, ctx) => {
    if (
      entry.organizationVisibility &&
      entry.organizationVisibility !== "named" &&
      entry.subheading.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subheading"],
        message: "Hidden organizations must not retain the real name.",
      });
    }
    if (
      (entry.organizationVisibility ?? "named") !== "confidential" &&
      entry.confidentialLabel?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidentialLabel"],
        message: "Only confidential organizations may retain a private label.",
      });
    }
    const engagementCount = (entry.engagements ?? []).reduce(
      (count, engagement) => count + 1 + (engagement.engagements?.length ?? 0),
      0,
    );
    if (engagementCount > MAX_ENGAGEMENTS_PER_ENTRY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["engagements"],
        message: `An entry supports at most ${MAX_ENGAGEMENTS_PER_ENTRY} engagements.`,
      });
    }
  });

export const sectionTypeSchema = z.enum([
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "awards",
  "custom",
]);

export const sectionSchema = z.object({
  id: z.string(),
  type: sectionTypeSchema,
  title: z.string(),
  entries: z.array(entrySchema),
});

export const layoutPresetSchema = z.enum([
  "single",
  "sidebar-left",
  "sidebar-right",
  "two-column",
  "three-column",
  "custom",
]);

export const layoutRegionSchema = z.object({
  id: z.string(),
  row: z.number().int().min(0).max(7),
  column: z.number().int().min(0).max(2),
  width: z.number().min(0.12).max(1),
  background: z.string().optional(),
  textColor: z.string().optional(),
  mutedColor: z.string().optional(),
  headingColor: z.string().optional(),
  padding: z.object({
    top: z.number().min(0).max(72),
    right: z.number().min(0).max(72),
    bottom: z.number().min(0).max(72),
    left: z.number().min(0).max(72),
  }),
  minHeight: z.number().min(0).max(800).default(0),
  fillPage: z.boolean().default(false),
  divider: z
    .object({
      side: z.enum(["left", "right", "top", "bottom"]),
      color: z.string(),
      width: z.number().min(0.25).max(8),
    })
    .optional(),
  entryAccent: z
    .object({
      side: z.enum(["left", "right"]),
      color: z.string(),
      width: z.number().min(0.5).max(8),
      gap: z.number().min(0).max(24),
    })
    .optional(),
  repeatOnPage: z.boolean().default(false),
});

export const layoutPlacementSchema = z
  .object({
    kind: z.enum(["identity", "contact", "summary", "section", "rule"]),
    regionId: z.string(),
    order: z.number().int().min(0).max(99),
    sectionId: z.string().optional(),
    rule: z
      .object({
        orientation: z.enum(["horizontal", "vertical"]),
        color: z.string(),
        width: z.number().min(0.25).max(8),
        length: z.number().min(4).max(400),
        align: z.enum(["start", "center", "end"]),
        marginBefore: z.number().min(0).max(72),
        marginAfter: z.number().min(0).max(72),
      })
      .optional(),
  })
  .superRefine((placement, ctx) => {
    if (placement.kind === "section" && !placement.sectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section placements require sectionId.",
        path: ["sectionId"],
      });
    }
    if (placement.kind === "rule" && !placement.rule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rule placements require a bounded rule definition.",
        path: ["rule"],
      });
    }
  });

export const resumeLayoutSchema = z.object({
  version: z.literal(1),
  preset: layoutPresetSchema,
  regions: z.array(layoutRegionSchema).min(1).max(12),
  placements: z.array(layoutPlacementSchema).min(1).max(40),
  columnGap: z.number().min(0).max(72),
  rowGap: z.number().min(0).max(72),
  confidence: z.number().min(0).max(1).default(1),
  unsupportedFeatures: z.array(z.string().max(120)).max(12).default([]),
});

export const themeTokensSchema = z.object({
  fonts: z.object({ heading: z.string(), body: z.string() }),
  colors: z.object({
    primary: z.string(),
    text: z.string(),
    muted: z.string(),
    // Candidate-name color. Optional for backwards compatibility with stored
    // docs — falls back to `primary` (see nameColorOf in defaults.ts).
    name: z.string().optional(),
  }),
  // pt sizes at scale 1.0; the fit engine scales them together
  sizes: z.object({
    name: z.number(),
    sectionHeader: z.number(),
    entryHeading: z.number(),
    body: z.number(),
  }),
  lineHeight: z.number(),
  margins: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }),
  spacing: z.object({
    section: z.number(),
    entry: z.number(),
    bullet: z.number(),
    header: z.number(),
  }),
  sectionHeaderStyle: z.object({
    case: z.enum(["smallcaps", "upper", "title"]),
    rule: z.enum(["bottom", "none"]),
  }),
  dateStyle: z.enum(["right", "inline"]),
  bulletGlyph: z.enum(["•", "–", "▪", "none"]),
  boldLeadIns: z.boolean(),
  // Header block alignment (name + contact). Optional — older docs default to
  // "left" via DEFAULT_THEME.
  headerAlignment: z.enum(["left", "center"]).optional(),
  // "icons" = drawn icon per contact item; "plain" = text-only line with
  // "|" separators; "labeled" = a label/value grid.
  contactStyle: z.enum(["icons", "plain", "labeled"]).optional(),
  contactLayout: z.enum(["inline", "stacked"]).optional(),
  contactLabelStyle: z
    .object({
      case: z.enum(["as-is", "upper", "title"]),
      divider: z.boolean(),
      labelWidth: z.number().min(32).max(140),
      rowGap: z.number().min(0).max(24),
    })
    .optional(),
  identityStyle: z
    .object({
      nameLayout: z.enum(["inline", "stacked"]),
      accent: z.enum(["none", "first-word"]),
      headlineCase: z.enum(["as-is", "upper", "title"]),
      headlineSize: z.number().min(8.5).max(24),
      headlineGap: z.number().min(0).max(36),
    })
    .optional(),
  // How the company/subheading and dates relate to the role heading line.
  // All optional; missing = the legacy look (bold subheading on its own line).
  entryStyle: z
    .object({
      subheadingInline: z.boolean().optional(),
      subheadingItalic: z.boolean().optional(),
      dateItalic: z.boolean().optional(),
    })
    .optional(),
});

export const resumeDocSchema = z.object({
  page: z.object({ size: pageSizeSchema }),
  theme: themeTokensSchema,
  contact: contactSchema,
  // Optional for documents persisted before identity/header fidelity support.
  headline: z.string().optional(),
  summary: boundedMarkdownSchema,
  summaryTitle: z.string().optional(),
  sections: z.array(sectionSchema),
  // Optional so every document persisted before layout v1 remains valid.
  layout: resumeLayoutSchema.optional(),
});

export type PageSize = z.infer<typeof pageSizeSchema>;
export type ContactLink = z.infer<typeof contactLinkSchema>;
export type ContactDetail = z.infer<typeof contactDetailSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type EngagementKind = z.infer<typeof engagementKindSchema>;
export type OrganizationVisibility = z.infer<
  typeof organizationVisibilitySchema
>;
export type ChildEngagement = z.infer<typeof childEngagementSchema>;
export type Engagement = z.infer<typeof engagementSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type SectionType = z.infer<typeof sectionTypeSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type ThemeTokens = z.infer<typeof themeTokensSchema>;
export type LayoutPreset = z.infer<typeof layoutPresetSchema>;
export type LayoutRegion = z.infer<typeof layoutRegionSchema>;
export type LayoutPlacement = z.infer<typeof layoutPlacementSchema>;
export type ResumeLayout = z.infer<typeof resumeLayoutSchema>;
export type ResumeDoc = z.infer<typeof resumeDocSchema>;
