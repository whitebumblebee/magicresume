import type { FitConfig } from "@/lib/fit/types";
import { layoutOf, PT_TO_PX } from "@/lib/resume/defaults";
import type {
  LayoutPlacement,
  LayoutRegion,
  ResumeDoc,
} from "@/lib/resume/schema";
import { resolvePage, type ResolvedPage } from "./resolve";

export interface ResolvedRegion {
  source: LayoutRegion;
  widthPx: number;
  contentWidthPx: number;
  padding: { t: number; r: number; b: number; l: number };
  minHeightPx: number;
  placements: LayoutPlacement[];
}

export interface ResolvedLayoutRow {
  index: number;
  gapPx: number;
  regions: ResolvedRegion[];
}

export interface ResolvedResumeLayout {
  page: ResolvedPage;
  rows: ResolvedLayoutRow[];
  rowGapPx: number;
}

export function resolveResumeLayout(
  doc: ResumeDoc,
  config: FitConfig,
): ResolvedResumeLayout {
  const page = resolvePage(doc, config);
  const layout = layoutOf(doc);
  const columnGapPx =
    layout.columnGap * (config.columnGapScale ?? 1) * PT_TO_PX;
  const rowGapPx = layout.rowGap * config.spacingScale * PT_TO_PX;
  const paddingXScale = config.regionPaddingXScale ?? 1;
  const paddingYScale = config.regionPaddingYScale ?? 1;
  const rowsByIndex = new Map<number, LayoutRegion[]>();
  const regionById = new Map(layout.regions.map((region) => [region.id, region]));
  const sectionOrder = new Map(
    doc.sections.map((section, index) => [section.id, index]),
  );

  for (const region of layout.regions) {
    const row = rowsByIndex.get(region.row) ?? [];
    row.push(region);
    rowsByIndex.set(region.row, row);
  }

  const placementsByRegion = new Map<string, LayoutPlacement[]>();
  for (const placement of layout.placements) {
    let effectivePlacement = placement;
    if (placement.kind === "section" && placement.sectionId) {
      const requestedRegionId = config.placementOverrides?.[placement.sectionId];
      const sourceRegion = regionById.get(placement.regionId);
      const targetRegion = requestedRegionId
        ? regionById.get(requestedRegionId)
        : undefined;
      // Fit may rebalance only across genuinely parallel regions. This keeps a
      // persisted or tampered config from moving body content into a header row.
      if (
        targetRegion &&
        sourceRegion &&
        targetRegion.id !== sourceRegion.id &&
        targetRegion.row === sourceRegion.row
      ) {
        effectivePlacement = {
          ...placement,
          regionId: targetRegion.id,
          // Moved sections append after the target's authored content while
          // retaining document order relative to other moved sections.
          order: 1_000 + (sectionOrder.get(placement.sectionId) ?? 0),
        };
      }
    }
    const placements =
      placementsByRegion.get(effectivePlacement.regionId) ?? [];
    placements.push(effectivePlacement);
    placementsByRegion.set(effectivePlacement.regionId, placements);
  }

  const rows = [...rowsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, sourceRegions]) => {
      const ordered = [...sourceRegions].sort(
        (left, right) => left.column - right.column,
      );
      const availableWidth = Math.max(
        1,
        page.contentW - columnGapPx * Math.max(0, ordered.length - 1),
      );
      const ratioScale = config.columnRatioScale ?? 1;
      const weightOf = (region: LayoutRegion) =>
        Math.pow(region.width, ratioScale);
      const totalWeight =
        ordered.reduce((sum, region) => sum + weightOf(region), 0) || 1;
      const regions = ordered.map((source) => {
        const widthPx = availableWidth * (weightOf(source) / totalWeight);
        const dividerWidthPx = source.divider
          ? source.divider.width * PT_TO_PX
          : 0;
        const padding = {
          t: source.padding.top * paddingYScale * PT_TO_PX,
          r: source.padding.right * paddingXScale * PT_TO_PX,
          b: source.padding.bottom * paddingYScale * PT_TO_PX,
          l: source.padding.left * paddingXScale * PT_TO_PX,
        };
        return {
          source,
          widthPx,
          contentWidthPx: Math.max(
            1,
            widthPx - padding.l - padding.r - dividerWidthPx,
          ),
          padding,
          minHeightPx: source.minHeight * PT_TO_PX,
          placements: [...(placementsByRegion.get(source.id) ?? [])].sort(
            (left, right) => left.order - right.order,
          ),
        };
      });
      return { index, gapPx: columnGapPx, regions };
    });

  return { page, rows, rowGapPx };
}
