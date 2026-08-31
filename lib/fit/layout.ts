import type { ResumeDoc } from "@/lib/resume/schema";
import { entryStyleOf } from "@/lib/resume/defaults";
import { stripMarkers } from "@/lib/render/text-utils";
import { resolvePage } from "@/lib/render/resolve";
import { fontShorthand, type FitConfig, type TextMeasurer } from "./types";
export { computeRegionLayout as computeLayout } from "./layout-regions";

/** Cushion for measurement/render drift (letter-spacing, sub-pixel rounding,
 *  icon gaps). Underestimating silently clips content; a few px of
 *  conservatism just costs a hair of font size. */
const SAFETY_PX = 16;

export interface LayoutMetrics {
  pageWidthPx: number;
  pageHeightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  /** Total height the content would occupy, including top+bottom margins. */
  totalHeightPx: number;
  fits: boolean;
  /** totalHeight / pageHeight, clamped to [0, 1] when fitting. */
  fillRatio: number;
  overflowPx: number;
}

/**
 * Virtual layout: computes the exact rendered height of the resume for a
 * candidate config, without touching the DOM. Must stay structurally in sync
 * with ResumePage.tsx — same block order, same spacing rules.
 */
export function computeLegacyLayout(
  doc: ResumeDoc,
  cfg: FitConfig,
  measurer: TextMeasurer,
): LayoutMetrics {
  const theme = doc.theme;
  const page = resolvePage(doc, cfg);
  const { sizePx, spacingPx, contentW } = page;
  const lh = cfg.lineHeight;

  const bodyFont = fontShorthand(400, sizePx.body, theme.fonts.body);
  const boldBodyFont = fontShorthand(700, sizePx.body, theme.fonts.body);
  const nameFont = fontShorthand(700, sizePx.name, theme.fonts.heading);
  const sectionFont = fontShorthand(700, sizePx.sectionHeader, theme.fonts.heading);
  const headFont = fontShorthand(700, sizePx.entryHeading, theme.fonts.heading);

  const blockHeight = (
    text: string,
    font: string,
    widthPx: number,
    linePx: number,
  ): number => measurer.measure(text, font, widthPx, linePx).height;

  let y = page.padding.t;

  // ---- Header: name + contact row ----
  y += blockHeight(
    doc.contact.name || " ",
    nameFont,
    contentW,
    sizePx.name * Math.max(lh, 1.05),
  );

  const contactParts = [
    doc.contact.phone,
    doc.contact.email,
    doc.contact.location,
    ...doc.contact.links.map((l) => l.label),
  ].filter((p) => p.trim());
  if (contactParts.length > 0) {
    y += 4 * cfg.spacingScale;
    // Model the rendered flex row. Icons mode: icon (~1.15em) + 4px gap per
    // item, 14px between items. Plain mode: no icons, "|" separator with the
    // row's column gaps. Wrapped over lines in both cases.
    const plainContact = (theme.contactStyle ?? "icons") === "plain";
    // Renderer draws each icon at 0.95em with a 4px gap before its label.
    const iconSlot = plainContact ? 0 : sizePx.body * 0.95 + 4;
    const between = plainContact
      ? measurer.width("|", bodyFont) + 20
      : 14;
    const totalWidth =
      contactParts.reduce(
        (acc, part) => acc + iconSlot + measurer.width(part, bodyFont),
        0,
      ) +
      between * (contactParts.length - 1);
    const contactLines = Math.max(1, Math.ceil(totalWidth / contentW));
    y += contactLines * sizePx.body * lh;
  }
  y += spacingPx.header;

  // ---- Summary ----
  if (doc.summary.trim()) {
    y += blockHeight(
      stripMarkers(doc.summary),
      doc.summary.includes("**") ? boldBodyFont : bodyFont,
      contentW,
      sizePx.body * lh,
    );
    y += spacingPx.header;
  }

  // ---- Sections ----
  const glyph = theme.bulletGlyph === "none" ? "" : theme.bulletGlyph;
  // Renderer indents bullet text by `paddingLeft: 1.1em` (em = body font size).
  // Mirror that exact indent so measured wrap widths match the real DOM.
  const bulletIndent = glyph ? 1.1 * sizePx.body : 0;
  const es = entryStyleOf(theme);

  doc.sections.forEach((section, si) => {
    if (si > 0) y += spacingPx.section;

    const title =
      theme.sectionHeaderStyle.case === "upper"
        ? section.title.toUpperCase()
        : section.title;
    // Renderer letter-spacing (0.07em upper / 0.03em small-caps) widens real
    // lines; approximate by measuring against a proportionally narrower box.
    const headerWidthFactor =
      theme.sectionHeaderStyle.case === "upper"
        ? 1.07
        : theme.sectionHeaderStyle.case === "smallcaps"
          ? 1.03
          : 1;
    y += blockHeight(
      title || " ",
      sectionFont,
      contentW / headerWidthFactor,
      sizePx.sectionHeader * Math.max(lh, 1.05),
    );
    y += (theme.sectionHeaderStyle.rule === "bottom" ? 3 : 1) + spacingPx.header * 0.6;

    section.entries.forEach((entry, ei) => {
      if (ei > 0) y += spacingPx.entry;

      const dateReserve = entry.dateRange.trim()
        ? measurer.width(entry.dateRange, bodyFont) + 16
        : 0;

      if (entry.heading.trim()) {
        if (es.subheadingInline && entry.subheading.trim()) {
          // Inline company: bold heading + " — company" share the heading
          // line (right side reserved for the date). Mixed fonts — sum the
          // natural widths and wrap against the available width.
          const combined =
            measurer.width(entry.heading, headFont) +
            measurer.width(` — ${entry.subheading}`, bodyFont);
          const avail = Math.max(1, contentW - dateReserve);
          const lines = Math.max(1, Math.ceil(combined / avail));
          y += lines * sizePx.entryHeading * Math.max(lh, 1.1);
        } else {
          y += blockHeight(
            entry.heading,
            headFont,
            contentW - dateReserve,
            sizePx.entryHeading * Math.max(lh, 1.1),
          );
        }
      }
      if (entry.subheading.trim() && !es.subheadingInline) {
        y += blockHeight(
          entry.subheading,
          boldBodyFont,
          contentW,
          sizePx.body * lh,
        );
      }

      const bullets = entry.bullets.filter((b) => b.trim());
      bullets.forEach((bullet, bi) => {
        if (bi > 0) y += spacingPx.bullet;
        // Bold text is wider — measure **-marked bullets with the bold font
        // (slight overestimate beats clipping).
        y += blockHeight(
          stripMarkers(bullet),
          bullet.includes("**") ? boldBodyFont : bodyFont,
          contentW - bulletIndent,
          sizePx.body * lh,
        );
      });
    });
  });

  y += page.padding.b;

  const fits = y <= page.pageH - SAFETY_PX;
  return {
    pageWidthPx: page.pageW,
    pageHeightPx: page.pageH,
    contentWidthPx: contentW,
    contentHeightPx: page.contentH,
    totalHeightPx: y,
    fits,
    fillRatio: Math.max(0, Math.min(1, y / page.pageH)),
    overflowPx: Math.max(0, y - page.pageH),
  };
}
