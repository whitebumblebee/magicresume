import type {
  LayoutPlacement,
  LayoutPreset,
  LayoutRegion,
  ResumeDoc,
  ResumeLayout,
} from "./schema";
import { defaultResumeLayout } from "./defaults";

const emptyRegion = (
  id: string,
  row: number,
  column: number,
  width: number,
): LayoutRegion => ({
  id,
  row,
  column,
  width,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  minHeight: 0,
  fillPage: false,
  repeatOnPage: false,
});

function corePlacements(regionId: string): LayoutPlacement[] {
  return [
    { kind: "identity", regionId, order: 0 },
    { kind: "contact", regionId, order: 1 },
    { kind: "summary", regionId, order: 2 },
  ];
}

function sectionPlacement(
  doc: ResumeDoc,
  sectionIndex: number,
  regionId: string,
  order: number,
): LayoutPlacement {
  return {
    kind: "section",
    sectionId: doc.sections[sectionIndex].id,
    regionId,
    order,
  };
}

export function createLayoutPreset(
  doc: ResumeDoc,
  preset: Exclude<LayoutPreset, "custom">,
): ResumeLayout {
  if (preset === "single") return defaultResumeLayout(doc);

  if (preset === "sidebar-left" || preset === "sidebar-right") {
    const sidebarLeft = preset === "sidebar-left";
    const sidebarId = "region-sidebar";
    const mainId = "region-main";
    const regions = [
      emptyRegion(sidebarId, 0, sidebarLeft ? 0 : 1, 0.32),
      emptyRegion(mainId, 0, sidebarLeft ? 1 : 0, 0.68),
    ];
    regions[0].padding = { top: 14, right: 12, bottom: 14, left: 12 };
    regions[0].background = "#f1f5f9";

    const sidebarTypes = new Set([
      "skills",
      "education",
      "certifications",
      "awards",
    ]);
    const placements = corePlacements(mainId);
    let sidebarOrder = 0;
    let mainOrder = placements.length;
    doc.sections.forEach((section, index) => {
      const inSidebar = sidebarTypes.has(section.type);
      placements.push(
        sectionPlacement(
          doc,
          index,
          inSidebar ? sidebarId : mainId,
          inSidebar ? sidebarOrder++ : mainOrder++,
        ),
      );
    });
    return {
      version: 1,
      preset,
      regions,
      placements,
      columnGap: 16,
      rowGap: 0,
      confidence: 1,
      unsupportedFeatures: [],
    };
  }

  const columns = preset === "three-column" ? 3 : 2;
  const headerId = "region-header";
  const regions: LayoutRegion[] = [emptyRegion(headerId, 0, 0, 1)];
  for (let column = 0; column < columns; column++) {
    regions.push(
      emptyRegion(`region-column-${column + 1}`, 1, column, 1 / columns),
    );
  }
  const placements = corePlacements(headerId);
  const columnOrders = Array.from({ length: columns }, () => 0);
  doc.sections.forEach((_section, index) => {
    const column = index % columns;
    placements.push(
      sectionPlacement(
        doc,
        index,
        `region-column-${column + 1}`,
        columnOrders[column]++,
      ),
    );
  });
  return {
    version: 1,
    preset,
    regions,
    placements,
    columnGap: columns === 3 ? 12 : 16,
    rowGap: 10,
    confidence: 1,
    unsupportedFeatures: [],
  };
}
