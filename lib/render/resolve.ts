import { PAGE_DIMS, PT_TO_PX } from "@/lib/resume/defaults";
import type { ResumeDoc } from "@/lib/resume/schema";
import type { FitConfig } from "@/lib/fit/types";

/** Concrete pixel geometry for a (doc, config) pair. Single source of truth
 *  shared by the fit engine's virtual layout and the on-screen renderer. */
export interface ResolvedPage {
  pageW: number;
  pageH: number;
  contentW: number;
  contentH: number;
  padding: { t: number; r: number; b: number; l: number };
  sizePx: { name: number; sectionHeader: number; entryHeading: number; body: number };
  lineHeight: number;
  spacingPx: { section: number; entry: number; bullet: number; header: number };
}

export function resolvePage(doc: ResumeDoc, cfg: FitConfig): ResolvedPage {
  const theme = doc.theme;
  const dims = PAGE_DIMS[doc.page.size];
  const pageW = dims.widthPt * PT_TO_PX;
  const pageH = dims.heightPt * PT_TO_PX;

  const marginXScale = cfg.marginXScale ?? cfg.marginScale;
  const marginYScale = cfg.marginYScale ?? cfg.marginScale;
  const padding = {
    t: theme.margins.top * marginYScale * PT_TO_PX,
    r: theme.margins.right * marginXScale * PT_TO_PX,
    b: theme.margins.bottom * marginYScale * PT_TO_PX,
    l: theme.margins.left * marginXScale * PT_TO_PX,
  };

  const px = (pt: number) => pt * cfg.sizeScale * PT_TO_PX;

  return {
    pageW,
    pageH,
    contentW: pageW - padding.l - padding.r,
    contentH: pageH - padding.t - padding.b,
    padding,
    sizePx: {
      name: px(theme.sizes.name),
      sectionHeader: px(theme.sizes.sectionHeader),
      entryHeading: px(theme.sizes.entryHeading),
      body: px(theme.sizes.body),
    },
    lineHeight: cfg.lineHeight,
    spacingPx: {
      section: theme.spacing.section * cfg.spacingScale * PT_TO_PX,
      entry: theme.spacing.entry * cfg.spacingScale * PT_TO_PX,
      bullet: theme.spacing.bullet * cfg.spacingScale * PT_TO_PX,
      header: theme.spacing.header * cfg.spacingScale * PT_TO_PX,
    },
  };
}
