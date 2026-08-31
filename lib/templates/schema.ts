import { z } from "zod";
import { FONT_OPTIONS } from "@/lib/resume/defaults";
import {
  layoutPresetSchema,
  layoutRegionSchema,
  pageSizeSchema,
  sectionTypeSchema,
  themeTokensSchema,
} from "@/lib/resume/schema";

export const templatePlacementSchema = z
  .object({
    kind: z.enum(["identity", "contact", "summary", "section", "rule"]),
    regionId: z.string(),
    order: z.number().int().min(0).max(99),
    sectionType: sectionTypeSchema.optional(),
    typeIndex: z.number().int().min(0).max(39).optional(),
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
    if (
      placement.kind === "section" &&
      (placement.sectionType === undefined ||
        placement.typeIndex === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template section slots require sectionType and typeIndex.",
      });
    }
    if (placement.kind === "rule" && !placement.rule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template rule slots require a rule definition.",
      });
    }
  });

const HEX = /^#[0-9a-fA-F]{6}$/;

export const resumeTemplateDesignSchema = z
  .object({
    version: z.literal(1),
    page: z.object({ size: pageSizeSchema }),
    theme: themeTokensSchema,
    layout: z.object({
      version: z.literal(1),
      preset: layoutPresetSchema,
      regions: z.array(layoutRegionSchema).min(1).max(12),
      placements: z.array(templatePlacementSchema).min(1).max(40),
      columnGap: z.number().min(0).max(72),
      rowGap: z.number().min(0).max(72),
    }),
  })
  .superRefine((design, ctx) => {
    if (
      !FONT_OPTIONS.includes(
        design.theme.fonts.heading as (typeof FONT_OPTIONS)[number],
      ) ||
      !FONT_OPTIONS.includes(
        design.theme.fonts.body as (typeof FONT_OPTIONS)[number],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template fonts must use the approved font list.",
        path: ["theme", "fonts"],
      });
    }
    const colors = [
      design.theme.colors.primary,
      design.theme.colors.text,
      design.theme.colors.muted,
      design.theme.colors.name,
      ...design.layout.regions.flatMap((region) => [
        region.background,
        region.textColor,
        region.mutedColor,
        region.headingColor,
        region.divider?.color,
        region.entryAccent?.color,
      ]),
      ...design.layout.placements.map((placement) => placement.rule?.color),
    ].filter((color): color is string => color !== undefined);
    if (colors.some((color) => !HEX.test(color))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template colors must be six-digit hex values.",
        path: ["theme", "colors"],
      });
    }
    const regionIds = design.layout.regions.map((region) => region.id);
    if (new Set(regionIds).size !== regionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template region IDs must be unique.",
        path: ["layout", "regions"],
      });
    }
    const regionSet = new Set(regionIds);
    if (
      design.layout.placements.some(
        (placement) => !regionSet.has(placement.regionId),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every template placement must reference a region.",
        path: ["layout", "placements"],
      });
    }
    for (const kind of ["identity", "contact", "summary"] as const) {
      if (
        design.layout.placements.filter(
          (placement) => placement.kind === kind,
        ).length !== 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Template requires exactly one ${kind} placement.`,
          path: ["layout", "placements"],
        });
      }
    }
  });

export type TemplatePlacement = z.infer<typeof templatePlacementSchema>;
export type ResumeTemplateDesign = z.infer<
  typeof resumeTemplateDesignSchema
>;

export const templateVisibilitySchema = z.enum(["private", "public"]);
export type TemplateVisibility = z.infer<typeof templateVisibilitySchema>;
