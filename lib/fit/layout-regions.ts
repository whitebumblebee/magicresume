import type {
  ChildEngagement,
  Engagement,
  ResumeDoc,
  Section,
} from "@/lib/resume/schema";
import {
  applyTextCase,
  contactLabelStyleOf,
  entryStyleOf,
  identityStyleOf,
  PT_TO_PX,
} from "@/lib/resume/defaults";
import { resolveResumeLayout } from "@/lib/render/layout-geometry";
import {
  inlineMarkdownToPlainText,
  markdownToPlainText,
  parseInlineMarkdown,
  parseMarkdownBlocks,
  type MarkdownInline,
} from "@/lib/resume/markdown";
import {
  engagementOrganizationDisplay,
  entryOrganizationDisplay,
} from "@/lib/resume/engagements";
import { resolveContentGeometry } from "@/lib/render/content-geometry";
import { fontShorthand, type FitConfig, type TextMeasurer } from "./types";
import type { LayoutMetrics } from "./layout";

const SAFETY_PX = 16;

export function computeRegionLayout(
  doc: ResumeDoc,
  cfg: FitConfig,
  measurer: TextMeasurer,
): LayoutMetrics {
  const resolved = resolveResumeLayout(doc, cfg);
  const { page } = resolved;
  const theme = doc.theme;
  const { sizePx, spacingPx } = page;
  const contentGeometry = resolveContentGeometry(sizePx, spacingPx, cfg);
  const bodyFont = fontShorthand(400, sizePx.body, theme.fonts.body);
  const boldBodyFont = fontShorthand(700, sizePx.body, theme.fonts.body);
  const nameFont = fontShorthand(700, sizePx.name, theme.fonts.heading);
  const identityStyle = identityStyleOf(theme);
  const headlineFont = fontShorthand(
    700,
    identityStyle.headlineSize * PT_TO_PX * cfg.sizeScale,
    theme.fonts.heading,
  );
  const sectionFont = fontShorthand(
    700,
    sizePx.sectionHeader,
    theme.fonts.heading,
  );
  const headingFont = fontShorthand(
    700,
    sizePx.entryHeading,
    theme.fonts.heading,
  );
  const sections = new Map(
    doc.sections.map((section) => [section.id, section]),
  );

  const blockHeight = (
    text: string,
    font: string,
    widthPx: number,
    lineHeightPx: number,
  ) =>
    measurer.measure(
      text,
      font,
      Math.max(1, widthPx),
      Math.max(4, lineHeightPx),
    ).height;

  const inlineUsesEmphasis = (nodes: MarkdownInline[]): boolean =>
    nodes.some(
      (node) =>
        node.type !== "text" &&
        (node.type === "strong" ||
          node.type === "emphasis" ||
          inlineUsesEmphasis(node.children)),
    );

  const markdownHeight = (text: string, widthPx: number): number => {
    let height = 0;
    parseMarkdownBlocks(text).forEach((block, blockIndex) => {
      if (blockIndex > 0) height += contentGeometry.markdown.paragraphGap;
      if (block.type === "heading") {
        const fontSize =
          block.level === 1
            ? contentGeometry.markdown.headingFontSize
            : contentGeometry.markdown.subheadingFontSize;
        const font = fontShorthand(700, fontSize, theme.fonts.heading);
        height += blockHeight(
          inlineMarkdownToPlainText(block.children),
          font,
          widthPx,
          fontSize * Math.max(cfg.lineHeight, 1.1),
        );
        height += contentGeometry.markdown.headingGap;
        return;
      }
      if (block.type === "list") {
        block.items.forEach((item, itemIndex) => {
          if (itemIndex > 0) height += contentGeometry.markdown.listItemGap;
          height += blockHeight(
            inlineMarkdownToPlainText(item),
            inlineUsesEmphasis(item) ? boldBodyFont : bodyFont,
            widthPx - contentGeometry.markdown.listIndent,
            sizePx.body * cfg.lineHeight,
          );
        });
        return;
      }
      height += blockHeight(
        inlineMarkdownToPlainText(block.children),
        inlineUsesEmphasis(block.children) ? boldBodyFont : bodyFont,
        widthPx,
        sizePx.body * cfg.lineHeight,
      );
    });
    return height;
  };

  const contactHeight = (widthPx: number): number => {
    const parts = [
      { label: "Phone", value: doc.contact.phone },
      { label: "Email", value: doc.contact.email },
      { label: "Location", value: doc.contact.location },
      ...doc.contact.links.map((link) => ({
        label: link.label,
        value: link.label,
      })),
      ...(doc.contact.details ?? []).map((detail) => ({
        label: detail.label,
        value: detail.value,
      })),
    ].filter((part) => part.value.trim());
    if (parts.length === 0) return 0;
    const style = theme.contactStyle ?? "icons";
    const plain = style === "plain";
    const stacked =
      (cfg.contactLayoutOverride ?? theme.contactLayout) === "stacked";
    if (style === "labeled") {
      const labelStyle = contactLabelStyleOf(theme);
      const gapPx = labelStyle.divider ? 25 : 8;
      const labelWidthPx = labelStyle.labelWidth * PT_TO_PX;
      const valueWidthPx = Math.max(1, widthPx - labelWidthPx - gapPx);
      const rowHeight = parts.reduce((sum, part) => {
        const labelHeight = blockHeight(
          applyTextCase(part.label, labelStyle.case),
          boldBodyFont,
          labelWidthPx,
          sizePx.body * cfg.lineHeight,
        );
        const valueHeight = blockHeight(
          part.value,
          bodyFont,
          valueWidthPx,
          sizePx.body * cfg.lineHeight,
        );
        return sum + Math.max(labelHeight, valueHeight);
      }, 0);
      return (
        4 * cfg.spacingScale +
        rowHeight +
        Math.max(0, parts.length - 1) *
          labelStyle.rowGap *
          PT_TO_PX *
          cfg.spacingScale
      );
    }
    if (stacked) {
      return (
        4 * cfg.spacingScale +
        parts.length * sizePx.body * cfg.lineHeight +
        Math.max(0, parts.length - 1) * 2
      );
    }
    const iconSlot = plain ? 0 : sizePx.body * 0.95 + 4;
    const between = plain ? measurer.width("|", bodyFont) + 20 : 14;
    const totalWidth =
      parts.reduce(
        (sum, part) => sum + iconSlot + measurer.width(part.value, bodyFont),
        0,
      ) +
      between * Math.max(0, parts.length - 1);
    return (
      4 * cfg.spacingScale +
      Math.max(1, Math.ceil(totalWidth / Math.max(1, widthPx))) *
        sizePx.body *
        cfg.lineHeight
    );
  };

  const engagementHeight = (
    engagement: Engagement | ChildEngagement,
    parentWidthPx: number,
    depth: 0 | 1,
  ): number => {
    let height = contentGeometry.engagementGap;
    const widthPx = Math.max(
      1,
      parentWidthPx - contentGeometry.engagementIndent,
    );
    const organization = engagementOrganizationDisplay(engagement);
    const title = engagement.name.trim() || engagement.role.trim();
    const secondaryRole = engagement.name.trim() ? engagement.role.trim() : "";
    const dateReserve = engagement.dateRange.trim()
      ? measurer.width(engagement.dateRange, bodyFont) +
        contentGeometry.engagementIndent
      : 0;
    if (title || engagement.dateRange.trim()) {
      const titleFont = depth === 0 ? headingFont : boldBodyFont;
      const titleSize = depth === 0 ? sizePx.entryHeading : sizePx.body;
      const combined =
        measurer.width(title || " ", titleFont) +
        (secondaryRole ? measurer.width(` — ${secondaryRole}`, bodyFont) : 0);
      height +=
        Math.max(1, Math.ceil(combined / Math.max(1, widthPx - dateReserve))) *
        titleSize *
        Math.max(cfg.lineHeight, 1.1);
    }
    if (organization || engagement.location.trim()) {
      height += blockHeight(
        [organization, engagement.location.trim()].filter(Boolean).join(" · "),
        bodyFont,
        widthPx,
        sizePx.body * cfg.lineHeight,
      );
    }
    const hasHeader = Boolean(
      title ||
      secondaryRole ||
      engagement.dateRange.trim() ||
      organization ||
      engagement.location.trim(),
    );
    if (engagement.narrative.trim()) {
      if (hasHeader) height += contentGeometry.metadataGap;
      height += markdownHeight(engagement.narrative, widthPx);
    }
    const bullets = engagement.bullets.filter((bullet) => bullet.trim());
    if (bullets.length > 0 && engagement.narrative.trim()) {
      height += contentGeometry.metadataGap;
    }
    bullets.forEach((bullet, bulletIndex) => {
      if (bulletIndex > 0) height += spacingPx.bullet;
      height += blockHeight(
        markdownToPlainText(bullet),
        inlineUsesEmphasis(parseInlineMarkdown(bullet))
          ? boldBodyFont
          : bodyFont,
        widthPx - (theme.bulletGlyph === "none" ? 0 : 1.1 * sizePx.body),
        sizePx.body * cfg.lineHeight,
      );
    });
    if (depth === 0 && "engagements" in engagement) {
      for (const child of engagement.engagements ?? []) {
        height += engagementHeight(child, widthPx, 1);
      }
    }
    return height;
  };

  const sectionHeight = (
    section: Section,
    widthPx: number,
    firstSection: boolean,
    accentInsetPx: number,
  ): number => {
    let height = firstSection ? 0 : spacingPx.section;
    const title =
      theme.sectionHeaderStyle.case === "upper"
        ? section.title.toUpperCase()
        : section.title;
    const widthFactor =
      theme.sectionHeaderStyle.case === "upper"
        ? 1.07
        : theme.sectionHeaderStyle.case === "smallcaps"
          ? 1.03
          : 1;
    height += blockHeight(
      title || " ",
      sectionFont,
      widthPx / widthFactor,
      sizePx.sectionHeader * Math.max(cfg.lineHeight, 1.05),
    );
    height +=
      (theme.sectionHeaderStyle.rule === "bottom" ? 3 : 0) +
      spacingPx.header * 0.6;

    const es = entryStyleOf(theme);
    const glyph = theme.bulletGlyph === "none" ? "" : theme.bulletGlyph;
    const bulletIndent = glyph ? 1.1 * sizePx.body : 0;
    const entryWidth = Math.max(1, widthPx - accentInsetPx);
    const inlineGap = 16 * (cfg.inlineGapScale ?? 1);

    section.entries.forEach((entry, entryIndex) => {
      if (entryIndex > 0) height += spacingPx.entry;
      const organization = entryOrganizationDisplay(entry);
      const dateReserve = entry.dateRange.trim()
        ? measurer.width(entry.dateRange, bodyFont) + inlineGap
        : 0;

      if (entry.heading.trim()) {
        if (es.subheadingInline && organization) {
          const combined =
            measurer.width(entry.heading, headingFont) +
            measurer.width(
              ` — ${organization}`,
              es.subheadingItalic ? bodyFont : boldBodyFont,
            );
          const available = Math.max(1, entryWidth - dateReserve);
          height +=
            Math.max(1, Math.ceil(combined / available)) *
            sizePx.entryHeading *
            Math.max(cfg.lineHeight, 1.1);
        } else {
          height += blockHeight(
            entry.heading,
            headingFont,
            entryWidth - dateReserve,
            sizePx.entryHeading * Math.max(cfg.lineHeight, 1.1),
          );
        }
      } else if (entry.dateRange.trim()) {
        height += sizePx.body * cfg.lineHeight;
      }
      const metadataOrganization =
        es.subheadingInline && entry.heading.trim() ? "" : organization;
      const metadataLine = [metadataOrganization, entry.location.trim()]
        .filter(Boolean)
        .join(" · ");
      if (metadataLine) {
        height += blockHeight(
          metadataLine,
          metadataOrganization && !es.subheadingItalic
            ? boldBodyFont
            : bodyFont,
          entryWidth,
          sizePx.body * cfg.lineHeight,
        );
      }
      const hasHeader = Boolean(
        entry.heading.trim() ||
        entry.dateRange.trim() ||
        organization ||
        entry.location.trim(),
      );
      if (entry.narrative?.trim()) {
        if (hasHeader) height += contentGeometry.metadataGap;
        height += markdownHeight(entry.narrative, entryWidth);
      }
      const bullets = entry.bullets.filter((bullet) => bullet.trim());
      if (bullets.length > 0 && entry.narrative?.trim()) {
        height += contentGeometry.metadataGap;
      }
      bullets.forEach((bullet, bulletIndex) => {
        if (bulletIndex > 0) height += spacingPx.bullet;
        height += blockHeight(
          markdownToPlainText(bullet),
          inlineUsesEmphasis(parseInlineMarkdown(bullet))
            ? boldBodyFont
            : bodyFont,
          entryWidth - bulletIndent,
          sizePx.body * cfg.lineHeight,
        );
      });
      for (const engagement of entry.engagements ?? []) {
        height += engagementHeight(engagement, entryWidth, 0);
      }
    });
    return height;
  };

  const rowHeights = resolved.rows.map((row) => {
    const regionHeights = row.regions.map((region) => {
      let height = region.padding.t;
      let sectionCount = 0;
      const accentInsetPx = region.source.entryAccent
        ? (region.source.entryAccent.width + region.source.entryAccent.gap) *
          PT_TO_PX
        : 0;

      region.placements.forEach((placement, placementIndex) => {
        const following = region.placements[placementIndex + 1];
        if (placement.kind === "identity") {
          const name = doc.contact.name.trim() || " ";
          const nameParts = name.split(/\s+/);
          if (identityStyle.nameLayout === "stacked" && nameParts.length > 1) {
            height += blockHeight(
              nameParts[0],
              nameFont,
              region.contentWidthPx,
              sizePx.name * Math.max(cfg.lineHeight, 1.05),
            );
            height += blockHeight(
              nameParts.slice(1).join(" "),
              nameFont,
              region.contentWidthPx,
              sizePx.name * Math.max(cfg.lineHeight, 1.05),
            );
          } else {
            height += blockHeight(
              name,
              nameFont,
              region.contentWidthPx,
              sizePx.name * Math.max(cfg.lineHeight, 1.05),
            );
          }
          if (doc.headline?.trim()) {
            height += identityStyle.headlineGap * PT_TO_PX * cfg.spacingScale;
            height += blockHeight(
              applyTextCase(doc.headline, identityStyle.headlineCase),
              headlineFont,
              region.contentWidthPx,
              identityStyle.headlineSize *
                PT_TO_PX *
                cfg.sizeScale *
                Math.max(cfg.lineHeight, 1.05),
            );
          }
          return;
        }
        if (placement.kind === "contact") {
          const measured = contactHeight(region.contentWidthPx);
          height += measured;
          if (following?.kind === "summary" || following?.kind === "section") {
            height += spacingPx.header;
          }
          return;
        }
        if (placement.kind === "summary") {
          if (!doc.summary.trim()) return;
          if (doc.summaryTitle?.trim()) {
            const title =
              theme.sectionHeaderStyle.case === "upper"
                ? doc.summaryTitle.toUpperCase()
                : doc.summaryTitle;
            const widthFactor =
              theme.sectionHeaderStyle.case === "upper"
                ? 1.07
                : theme.sectionHeaderStyle.case === "smallcaps"
                  ? 1.03
                  : 1;
            height += blockHeight(
              title,
              sectionFont,
              region.contentWidthPx / widthFactor,
              sizePx.sectionHeader * Math.max(cfg.lineHeight, 1.05),
            );
            height +=
              (theme.sectionHeaderStyle.rule === "bottom" ? 3 : 0) +
              spacingPx.header * 0.6;
          }
          height += markdownHeight(doc.summary, region.contentWidthPx);
          if (following?.kind === "section") height += spacingPx.header;
          return;
        }
        if (placement.kind === "rule" && placement.rule) {
          height +=
            (placement.rule.marginBefore + placement.rule.marginAfter) *
            PT_TO_PX;
          height +=
            (placement.rule.orientation === "vertical"
              ? placement.rule.length
              : placement.rule.width) * PT_TO_PX;
          return;
        }
        const section = placement.sectionId
          ? sections.get(placement.sectionId)
          : undefined;
        if (!section) return;
        height += sectionHeight(
          section,
          region.contentWidthPx,
          sectionCount === 0,
          accentInsetPx,
        );
        sectionCount += 1;
      });

      height += region.padding.b;
      const minimum = region.source.fillPage
        ? Math.max(region.minHeightPx, page.contentH)
        : region.minHeightPx;
      return Math.max(height, minimum);
    });
    return Math.max(0, ...regionHeights);
  });

  const contentHeight =
    rowHeights.reduce((sum, height) => sum + height, 0) +
    resolved.rowGapPx * Math.max(0, rowHeights.length - 1);
  const totalHeightPx = page.padding.t + contentHeight + page.padding.b;
  const fits = totalHeightPx <= page.pageH - SAFETY_PX;

  return {
    pageWidthPx: page.pageW,
    pageHeightPx: page.pageH,
    contentWidthPx: page.contentW,
    contentHeightPx: page.contentH,
    totalHeightPx,
    fits,
    fillRatio: Math.max(0, Math.min(1, totalHeightPx / page.pageH)),
    overflowPx: Math.max(0, totalHeightPx - page.pageH),
  };
}
