import { layoutOf } from "@/lib/resume/defaults";
import type {
  LayoutPlacement,
  ResumeDoc,
  Section,
  SectionType,
} from "@/lib/resume/schema";
import {
  resumeTemplateDesignSchema,
  type ResumeTemplateDesign,
  type TemplatePlacement,
} from "./schema";

function typeIndexOf(sections: Section[], target: Section): number {
  return sections
    .slice(0, sections.findIndex((section) => section.id === target.id))
    .filter((section) => section.type === target.type).length;
}

export function extractResumeDesign(doc: ResumeDoc): ResumeTemplateDesign {
  const layout = layoutOf(doc);
  const placements = layout.placements.flatMap<TemplatePlacement>(
    (placement) => {
      if (placement.kind !== "section") {
        return [
          {
            kind: placement.kind,
            regionId: placement.regionId,
            order: placement.order,
            rule:
              placement.kind === "rule"
                ? structuredClone(placement.rule)
                : undefined,
          },
        ];
      }
      const section = doc.sections.find(
        (candidate) => candidate.id === placement.sectionId,
      );
      if (!section) return [];
      return [
        {
          kind: "section",
          regionId: placement.regionId,
          order: placement.order,
          sectionType: section.type,
          typeIndex: typeIndexOf(doc.sections, section),
        },
      ];
    },
  );

  return resumeTemplateDesignSchema.parse({
    version: 1,
    page: structuredClone(doc.page),
    theme: structuredClone(doc.theme),
    layout: {
      version: 1,
      preset: layout.preset,
      regions: structuredClone(layout.regions),
      placements,
      columnGap: layout.columnGap,
      rowGap: layout.rowGap,
    },
  });
}

function sectionForSlot(
  sections: Section[],
  type: SectionType,
  typeIndex: number,
): Section | undefined {
  return sections.filter((section) => section.type === type)[typeIndex];
}

export function applyResumeDesign(
  doc: ResumeDoc,
  input: ResumeTemplateDesign,
): ResumeDoc {
  const design = resumeTemplateDesignSchema.parse(input);
  const usedSections = new Set<string>();
  const placements: LayoutPlacement[] = [];

  for (const slot of design.layout.placements) {
    if (slot.kind !== "section") {
      placements.push({
        kind: slot.kind,
        regionId: slot.regionId,
        order: slot.order,
        rule:
          slot.kind === "rule" ? structuredClone(slot.rule) : undefined,
      });
      continue;
    }
    const section = sectionForSlot(
      doc.sections,
      slot.sectionType!,
      slot.typeIndex!,
    );
    if (!section || usedSections.has(section.id)) continue;
    usedSections.add(section.id);
    placements.push({
      kind: "section",
      sectionId: section.id,
      regionId: slot.regionId,
      order: slot.order,
    });
  }

  const regionIds = new Set(
    design.layout.regions.map((region) => region.id),
  );
  const sectionRegionCounts = new Map<string, number>();
  for (const placement of placements) {
    if (placement.kind !== "section") continue;
    sectionRegionCounts.set(
      placement.regionId,
      (sectionRegionCounts.get(placement.regionId) ?? 0) + 1,
    );
  }
  const fallbackRegion =
    [...sectionRegionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    design.layout.regions.at(-1)!.id;

  for (const section of doc.sections) {
    if (usedSections.has(section.id)) continue;
    const nextOrder = placements.filter(
      (placement) => placement.regionId === fallbackRegion,
    ).length;
    placements.push({
      kind: "section",
      sectionId: section.id,
      regionId: fallbackRegion,
      order: Math.min(99, nextOrder),
    });
  }

  return {
    ...structuredClone(doc),
    page: structuredClone(design.page),
    theme: structuredClone(design.theme),
    layout: {
      version: 1,
      preset: design.layout.preset,
      regions: structuredClone(design.layout.regions),
      placements: placements.filter((placement) =>
        regionIds.has(placement.regionId),
      ),
      columnGap: design.layout.columnGap,
      rowGap: design.layout.rowGap,
      confidence: 1,
      unsupportedFeatures: [],
    },
  };
}
