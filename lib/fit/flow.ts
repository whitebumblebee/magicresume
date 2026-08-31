import type { ResumeDoc } from "@/lib/resume/schema";
import { layoutOf } from "@/lib/resume/defaults";
import { computeRegionLayout } from "./layout-regions";
import type { FitConfig, TextMeasurer } from "./types";

const MAX_EXACT_ASSIGNMENTS = 512;
const IMPROVEMENT_EPSILON_PX = 0.25;

interface SectionFlow {
  sectionId: string;
  sourceRegionId: string;
  candidateRegionIds: string[];
}

/**
 * Use the real width-aware text measurer to minimize the tallest parallel
 * region. The authored ResumeDoc is never mutated; fit-only overrides travel
 * with the same config used by preview, print, save, and share.
 */
export function optimizeMultiColumnFlow(
  doc: ResumeDoc,
  baseConfig: FitConfig,
  measurer: TextMeasurer,
): FitConfig {
  const layout = layoutOf(doc);
  let config: FitConfig = { ...baseConfig };

  if (
    layout.preset !== "custom" &&
    doc.theme.contactLayout === "stacked" &&
    contactItemCount(doc) > 1
  ) {
    config.contactLayoutOverride = "inline";
  }

  if (
    layout.preset === "single" ||
    layout.preset === "custom" ||
    layout.regions.length < 2
  ) {
    return config;
  }

  const regionById = new Map(layout.regions.map((region) => [region.id, region]));
  const regionsByRow = new Map<number, string[]>();
  for (const region of layout.regions) {
    const row = regionsByRow.get(region.row) ?? [];
    row.push(region.id);
    regionsByRow.set(region.row, row);
  }

  const sectionById = new Map(doc.sections.map((section) => [section.id, section]));
  const flowsByRow = new Map<number, SectionFlow[]>();
  for (const placement of layout.placements) {
    if (placement.kind !== "section" || !placement.sectionId) continue;
    const sourceRegion = regionById.get(placement.regionId);
    const section = sectionById.get(placement.sectionId);
    if (!sourceRegion || !section) continue;
    const candidates = regionsByRow.get(sourceRegion.row) ?? [];
    if (candidates.length < 2) continue;
    // Sidebars are intentionally supporting flows: keep the primary work
    // history in the main column, but allow projects and compact sections to
    // consume the sidebar's otherwise wasted vertical capacity.
    if (
      (layout.preset === "sidebar-left" ||
        layout.preset === "sidebar-right") &&
      (section.type === "experience" ||
        placement.regionId === sidebarRegionId(layout.regions, sourceRegion.row))
    ) {
      continue;
    }
    const rowFlows = flowsByRow.get(sourceRegion.row) ?? [];
    rowFlows.push({
      sectionId: placement.sectionId,
      sourceRegionId: placement.regionId,
      candidateRegionIds: candidates,
    });
    flowsByRow.set(sourceRegion.row, rowFlows);
  }

  let overrides = { ...(config.placementOverrides ?? {}) };
  for (const flows of flowsByRow.values()) {
    overrides = optimizeRow(doc, config, measurer, flows, overrides);
    config = compactOverrides(config, overrides, flows);
  }
  return compactOverrides(config, overrides, [
    ...flowsByRow.values(),
  ].flat());
}

function optimizeRow(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
  flows: SectionFlow[],
  startingOverrides: Record<string, string>,
): Record<string, string> {
  const assignmentCount = flows.reduce(
    (count, flow) => count * flow.candidateRegionIds.length,
    1,
  );
  return assignmentCount <= MAX_EXACT_ASSIGNMENTS
    ? exactSearch(doc, config, measurer, flows, startingOverrides)
    : greedySearch(doc, config, measurer, flows, startingOverrides);
}

function exactSearch(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
  flows: SectionFlow[],
  startingOverrides: Record<string, string>,
): Record<string, string> {
  let best = { ...startingOverrides };
  let bestScore = score(doc, config, measurer, best);
  let bestMoves = movedCount(flows, best);
  const current = { ...startingOverrides };

  const visit = (index: number) => {
    if (index === flows.length) {
      const candidateScore = score(doc, config, measurer, current);
      const candidateMoves = movedCount(flows, current);
      if (
        candidateScore < bestScore - IMPROVEMENT_EPSILON_PX ||
        (Math.abs(candidateScore - bestScore) <= IMPROVEMENT_EPSILON_PX &&
          candidateMoves < bestMoves)
      ) {
        best = { ...current };
        bestScore = candidateScore;
        bestMoves = candidateMoves;
      }
      return;
    }
    const flow = flows[index];
    for (const regionId of flow.candidateRegionIds) {
      if (regionId === flow.sourceRegionId) delete current[flow.sectionId];
      else current[flow.sectionId] = regionId;
      visit(index + 1);
    }
  };
  visit(0);
  return best;
}

function greedySearch(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
  flows: SectionFlow[],
  startingOverrides: Record<string, string>,
): Record<string, string> {
  const current = { ...startingOverrides };
  let currentScore = score(doc, config, measurer, current);
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (const flow of flows) {
      let bestRegion = current[flow.sectionId] ?? flow.sourceRegionId;
      let bestScore = currentScore;
      for (const regionId of flow.candidateRegionIds) {
        const candidate = { ...current };
        if (regionId === flow.sourceRegionId) delete candidate[flow.sectionId];
        else candidate[flow.sectionId] = regionId;
        const candidateScore = score(doc, config, measurer, candidate);
        if (candidateScore < bestScore - IMPROVEMENT_EPSILON_PX) {
          bestRegion = regionId;
          bestScore = candidateScore;
        }
      }
      if (bestRegion === flow.sourceRegionId) delete current[flow.sectionId];
      else current[flow.sectionId] = bestRegion;
      if (bestScore < currentScore - IMPROVEMENT_EPSILON_PX) improved = true;
      currentScore = bestScore;
    }
    if (!improved) break;
  }
  return current;
}

function score(
  doc: ResumeDoc,
  config: FitConfig,
  measurer: TextMeasurer,
  placementOverrides: Record<string, string>,
): number {
  return computeRegionLayout(
    doc,
    { ...config, placementOverrides },
    measurer,
  ).totalHeightPx;
}

function movedCount(
  flows: SectionFlow[],
  overrides: Record<string, string>,
): number {
  return flows.filter(
    (flow) =>
      overrides[flow.sectionId] &&
      overrides[flow.sectionId] !== flow.sourceRegionId,
  ).length;
}

function compactOverrides(
  config: FitConfig,
  overrides: Record<string, string>,
  flows: SectionFlow[],
): FitConfig {
  const sourceBySection = new Map(
    flows.map((flow) => [flow.sectionId, flow.sourceRegionId]),
  );
  const compact = Object.fromEntries(
    Object.entries(overrides).filter(
      ([sectionId, regionId]) => sourceBySection.get(sectionId) !== regionId,
    ),
  );
  return {
    ...config,
    placementOverrides:
      Object.keys(compact).length > 0 ? compact : undefined,
  };
}

function contactItemCount(doc: ResumeDoc): number {
  return [
    doc.contact.phone,
    doc.contact.email,
    doc.contact.location,
    ...doc.contact.links.map((link) => link.label),
    ...(doc.contact.details ?? []).map((detail) => detail.value),
  ].filter((value) => value.trim()).length;
}

function sidebarRegionId(
  regions: ReturnType<typeof layoutOf>["regions"],
  row: number,
): string | undefined {
  return regions
    .filter((region) => region.row === row)
    .sort((left, right) => left.width - right.width)[0]?.id;
}
