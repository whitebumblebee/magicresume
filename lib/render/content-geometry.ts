import type { FitConfig } from "@/lib/fit/types";

export interface ContentGeometry {
  markdown: {
    paragraphGap: number;
    listIndent: number;
    listItemGap: number;
    headingGap: number;
    headingFontSize: number;
    subheadingFontSize: number;
  };
  engagementIndent: number;
  engagementGap: number;
  metadataGap: number;
}

/** Shared renderer/fit geometry for narrative and engagement content. */
export function resolveContentGeometry(
  sizePx: { body: number; entryHeading: number },
  spacingPx: { entry: number; bullet: number; header: number },
  config: FitConfig,
): ContentGeometry {
  return {
    markdown: {
      paragraphGap: Math.max(spacingPx.bullet, sizePx.body * 0.35),
      listIndent: sizePx.body * 1.45,
      listItemGap: spacingPx.bullet,
      headingGap: spacingPx.header * 0.3,
      headingFontSize: sizePx.entryHeading,
      subheadingFontSize: Math.max(sizePx.body, sizePx.entryHeading * 0.92),
    },
    engagementIndent: sizePx.body * 1.25,
    engagementGap: spacingPx.entry * 0.75,
    metadataGap: spacingPx.bullet * Math.max(config.spacingScale, 0.5),
  };
}
