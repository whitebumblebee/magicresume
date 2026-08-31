import type { CSSProperties } from "react";
import type {
  Engagement,
  ChildEngagement,
  LayoutPlacement,
  LayoutRegion,
  ResumeDoc,
  Section,
} from "@/lib/resume/schema";
import type { FitConfig } from "@/lib/fit/types";
import {
  applyTextCase,
  contactLabelStyleOf,
  entryStyleOf,
  identityStyleOf,
  nameColorOf,
  PT_TO_PX,
} from "@/lib/resume/defaults";
import { resolveResumeLayout } from "./layout-geometry";
import { MarkdownBlocks, RichText } from "./text";
import {
  engagementOrganizationDisplay,
  entryOrganizationDisplay,
} from "@/lib/resume/engagements";
import { resolveContentGeometry } from "./content-geometry";
import { Icon, iconForUrl, type IconName } from "./icons";
import {
  isWebHref,
  safeEmailHref,
  safeHref,
  safePhoneHref,
  safeTextHref,
} from "./link-utils";

export function RegionResumePage({
  doc,
  config,
}: {
  doc: ResumeDoc;
  config: FitConfig;
}) {
  const resolved = resolveResumeLayout(doc, config);
  const { page } = resolved;
  const theme = doc.theme;
  const headerCase: CSSProperties =
    theme.sectionHeaderStyle.case === "upper"
      ? { textTransform: "uppercase", letterSpacing: "0.07em" }
      : theme.sectionHeaderStyle.case === "smallcaps"
        ? { fontVariantCaps: "small-caps", letterSpacing: "0.03em" }
        : {};
  const sections = new Map(
    doc.sections.map((section) => [section.id, section]),
  );

  return (
    <div
      style={{
        width: page.pageW,
        minHeight: page.pageH,
        padding: `${page.padding.t}px ${page.padding.r}px ${page.padding.b}px ${page.padding.l}px`,
        background: "#ffffff",
        color: theme.colors.text,
        fontFamily: `"${theme.fonts.body}", "Helvetica Neue", Arial, sans-serif`,
        fontSize: page.sizePx.body,
        lineHeight: config.lineHeight,
        boxSizing: "border-box",
      }}
    >
      {resolved.rows.map((row, rowIndex) => (
        <div
          key={row.index}
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: row.gapPx,
            marginTop: rowIndex === 0 ? 0 : resolved.rowGapPx,
          }}
        >
          {row.regions.map((region) => {
            const source = region.source;
            const divider = source.divider;
            const border = divider
              ? `${divider.width * PT_TO_PX}px solid ${divider.color}`
              : undefined;
            const minHeight = source.fillPage
              ? Math.max(region.minHeightPx, page.contentH)
              : region.minHeightPx;
            return (
              <div
                key={source.id}
                style={{
                  width: region.widthPx,
                  minWidth: 0,
                  minHeight,
                  padding: `${region.padding.t}px ${region.padding.r}px ${region.padding.b}px ${region.padding.l}px`,
                  boxSizing: "border-box",
                  background: source.background,
                  color: source.textColor ?? theme.colors.text,
                  borderLeft: divider?.side === "left" ? border : undefined,
                  borderRight: divider?.side === "right" ? border : undefined,
                  borderTop: divider?.side === "top" ? border : undefined,
                  borderBottom: divider?.side === "bottom" ? border : undefined,
                }}
              >
                {region.placements.map((placement, placementIndex) => {
                  const following = region.placements[placementIndex + 1];
                  if (placement.kind === "identity") {
                    return (
                      <IdentityBlock
                        key={`identity-${placement.order}`}
                        doc={doc}
                        config={config}
                        region={source}
                      />
                    );
                  }
                  if (placement.kind === "contact") {
                    return (
                      <ContactBlock
                        key={`contact-${placement.order}`}
                        doc={doc}
                        config={config}
                        region={source}
                        bottomGap={
                          following?.kind === "summary" ||
                          following?.kind === "section"
                        }
                      />
                    );
                  }
                  if (placement.kind === "summary") {
                    if (!doc.summary.trim()) return null;
                    return (
                      <SummaryBlock
                        key={`summary-${placement.order}`}
                        doc={doc}
                        config={config}
                        region={source}
                        bottomGap={following?.kind === "section"}
                        headerCase={headerCase}
                      />
                    );
                  }
                  if (placement.kind === "rule" && placement.rule) {
                    return (
                      <RuleBlock
                        key={`rule-${placement.order}-${placementIndex}`}
                        rule={placement.rule}
                      />
                    );
                  }
                  const section = placement.sectionId
                    ? sections.get(placement.sectionId)
                    : undefined;
                  return section ? (
                    <RegionSection
                      key={section.id}
                      section={section}
                      doc={doc}
                      config={config}
                      region={source}
                      isFirst={
                        !region.placements
                          .slice(0, placementIndex)
                          .some((candidate) => candidate.kind === "section")
                      }
                      headerCase={headerCase}
                    />
                  ) : null;
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function IdentityBlock({
  doc,
  config,
  region,
}: {
  doc: ResumeDoc;
  config: FitConfig;
  region: LayoutRegion;
}) {
  const { sizePx } = resolveResumeLayout(doc, config).page;
  const style = identityStyleOf(doc.theme);
  const name = doc.contact.name.trim() || "Your Name";
  const [firstWord, ...remainingWords] = name.split(/\s+/);
  const remainder = remainingWords.join(" ");
  const nameColor =
    region.headingColor ?? region.textColor ?? nameColorOf(doc.theme);
  const renderWord = (text: string, accent: boolean) => (
    <span style={{ color: accent ? doc.theme.colors.primary : nameColor }}>
      {text}
    </span>
  );
  return (
    <div style={{ textAlign: doc.theme.headerAlignment ?? "left" }}>
      <div
        style={{
          fontFamily: `"${doc.theme.fonts.heading}", sans-serif`,
          fontSize: sizePx.name,
          fontWeight: 700,
          lineHeight: Math.max(config.lineHeight, 1.05),
          color: nameColor,
        }}
      >
        {style.nameLayout === "stacked" && remainder ? (
          <>
            <div>{renderWord(firstWord, style.accent === "first-word")}</div>
            <div>{renderWord(remainder, false)}</div>
          </>
        ) : (
          <>
            {renderWord(firstWord, style.accent === "first-word")}
            {remainder ? <> {renderWord(remainder, false)}</> : null}
          </>
        )}
      </div>
      {doc.headline?.trim() ? (
        <div
          style={{
            marginTop: style.headlineGap * PT_TO_PX * config.spacingScale,
            fontFamily: `"${doc.theme.fonts.heading}", sans-serif`,
            fontSize: style.headlineSize * PT_TO_PX * config.sizeScale,
            fontWeight: 700,
            lineHeight: Math.max(config.lineHeight, 1.05),
            color: region.textColor ?? doc.theme.colors.text,
          }}
        >
          <RichText
            text={applyTextCase(doc.headline, style.headlineCase)}
            linkColor={doc.theme.colors.primary}
          />
        </div>
      ) : null}
    </div>
  );
}

function ContactBlock({
  doc,
  config,
  region,
  bottomGap,
}: {
  doc: ResumeDoc;
  config: FitConfig;
  region: LayoutRegion;
  bottomGap: boolean;
}) {
  const page = resolveResumeLayout(doc, config).page;
  const contactStyle = doc.theme.contactStyle ?? "icons";
  const plain = contactStyle === "plain";
  const labeled = contactStyle === "labeled";
  const stacked =
    (config.contactLayoutOverride ?? doc.theme.contactLayout) === "stacked";
  const labelStyle = contactLabelStyleOf(doc.theme);
  const align = doc.theme.headerAlignment ?? "left";
  const items: {
    icon: IconName;
    label: string;
    text: string;
    href?: string;
  }[] = [];
  if (doc.contact.phone.trim())
    items.push({
      icon: "phone",
      label: "Phone",
      text: doc.contact.phone,
      href: safePhoneHref(doc.contact.phone) ?? undefined,
    });
  if (doc.contact.email.trim())
    items.push({
      icon: "mail",
      label: "Email",
      text: doc.contact.email,
      href: safeEmailHref(doc.contact.email) ?? undefined,
    });
  if (doc.contact.location.trim())
    items.push({ icon: "pin", label: "Location", text: doc.contact.location });
  for (const link of doc.contact.links) {
    if (link.label.trim()) {
      items.push({
        icon: iconForUrl(link.url, link.label),
        label: link.label,
        text: link.label,
        href: safeHref(link.url) ?? undefined,
      });
    }
  }
  for (const detail of doc.contact.details ?? []) {
    if (!detail.label.trim() || !detail.value.trim()) continue;
    items.push({
      icon: "pin",
      label: detail.label,
      text: detail.value,
      href: safeTextHref(detail.value) ?? undefined,
    });
  }
  if (items.length === 0) {
    return bottomGap ? <div style={{ height: page.spacingPx.header }} /> : null;
  }

  if (labeled) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${labelStyle.labelWidth * PT_TO_PX}px ${labelStyle.divider ? "1px" : "0px"} minmax(0, 1fr)`,
          columnGap: labelStyle.divider ? 12 : 8,
          rowGap: labelStyle.rowGap * PT_TO_PX * config.spacingScale,
          alignItems: "baseline",
          marginTop: 4 * config.spacingScale,
          marginBottom: bottomGap ? page.spacingPx.header : 0,
          color: region.textColor ?? doc.theme.colors.text,
        }}
      >
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} style={{ display: "contents" }}>
            <span
              style={{
                fontFamily: `"${doc.theme.fonts.heading}", sans-serif`,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {applyTextCase(item.label, labelStyle.case)}
            </span>
            <span
              aria-hidden
              style={{
                alignSelf: "stretch",
                background: labelStyle.divider
                  ? (region.headingColor ?? doc.theme.colors.text)
                  : "transparent",
              }}
            />
            <span style={{ minWidth: 0 }}>
              {item.href ? (
                <a
                  href={item.href}
                  target={isWebHref(item.href) ? "_blank" : undefined}
                  rel={isWebHref(item.href) ? "noreferrer" : undefined}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {item.text}
                </a>
              ) : (
                item.text
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: stacked ? "grid" : "flex",
        flexWrap: "wrap",
        alignItems: plain ? "baseline" : "center",
        columnGap: plain ? 10 : 14,
        rowGap: 2,
        marginTop: 4 * config.spacingScale,
        marginBottom: bottomGap ? page.spacingPx.header : 0,
        justifyContent:
          !stacked && align === "center" ? "center" : "flex-start",
        color: region.mutedColor ?? region.textColor ?? doc.theme.colors.muted,
      }}
    >
      {items.map((item, index) => {
        const isWebLink = item.href ? isWebHref(item.href) : false;
        const text = item.href ? (
          <a
            href={item.href}
            target={isWebLink ? "_blank" : undefined}
            rel={isWebLink ? "noreferrer" : undefined}
            style={{
              color: isWebLink ? doc.theme.colors.primary : "inherit",
              textDecoration: isWebLink && plain ? "underline" : "none",
            }}
          >
            {item.text}
          </a>
        ) : (
          item.text
        );
        return (
          <span
            key={`${item.text}-${index}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: plain ? 0 : 4,
              whiteSpace: "nowrap",
            }}
          >
            {plain ? (
              <>
                {index > 0 && <span aria-hidden>|</span>}
                {text}
              </>
            ) : (
              <>
                <Icon
                  name={item.icon}
                  size={page.sizePx.body * 0.95}
                  color={doc.theme.colors.primary}
                />
                {text}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

function RuleBlock({ rule }: { rule: NonNullable<LayoutPlacement["rule"]> }) {
  const horizontal = rule.orientation === "horizontal";
  const alignSelf =
    rule.align === "center"
      ? "center"
      : rule.align === "end"
        ? "flex-end"
        : "flex-start";
  return (
    <div
      aria-hidden
      style={{
        width: horizontal ? rule.length * PT_TO_PX : rule.width * PT_TO_PX,
        height: horizontal ? rule.width * PT_TO_PX : rule.length * PT_TO_PX,
        background: rule.color,
        marginTop: rule.marginBefore * PT_TO_PX,
        marginBottom: rule.marginAfter * PT_TO_PX,
        marginLeft: alignSelf === "center" ? "auto" : undefined,
        marginRight:
          alignSelf === "center" || alignSelf === "flex-start"
            ? "auto"
            : undefined,
      }}
    />
  );
}

function SummaryBlock({
  doc,
  config,
  region,
  bottomGap,
  headerCase,
}: {
  doc: ResumeDoc;
  config: FitConfig;
  region: LayoutRegion;
  bottomGap: boolean;
  headerCase: CSSProperties;
}) {
  const { sizePx, spacingPx } = resolveResumeLayout(doc, config).page;
  const contentGeometry = resolveContentGeometry(sizePx, spacingPx, config);
  const headingColor =
    region.headingColor ?? region.textColor ?? doc.theme.colors.text;
  return (
    <div style={{ marginBottom: bottomGap ? spacingPx.header : 0 }}>
      {doc.summaryTitle?.trim() ? (
        <>
          <h2
            style={{
              margin: 0,
              fontFamily: `"${doc.theme.fonts.heading}", sans-serif`,
              fontSize: sizePx.sectionHeader,
              fontWeight: 700,
              lineHeight: Math.max(config.lineHeight, 1.05),
              color: headingColor,
              borderBottom:
                doc.theme.sectionHeaderStyle.rule === "bottom"
                  ? `1px solid ${headingColor}`
                  : "none",
              paddingBottom:
                doc.theme.sectionHeaderStyle.rule === "bottom" ? 2 : 0,
              ...headerCase,
            }}
          >
            <RichText
              text={doc.summaryTitle}
              linkColor={doc.theme.colors.primary}
            />
          </h2>
          <div style={{ height: spacingPx.header * 0.6 }} />
        </>
      ) : null}
      <MarkdownBlocks
        text={doc.summary}
        linkColor={doc.theme.colors.primary}
        paragraphGap={contentGeometry.markdown.paragraphGap}
        listIndent={contentGeometry.markdown.listIndent}
        listItemGap={contentGeometry.markdown.listItemGap}
        headingGap={contentGeometry.markdown.headingGap}
        headingFontSize={contentGeometry.markdown.headingFontSize}
        subheadingFontSize={contentGeometry.markdown.subheadingFontSize}
        headingFontFamily={`"${doc.theme.fonts.heading}", sans-serif`}
        headingColor={headingColor}
      />
    </div>
  );
}

function RegionSection({
  section,
  doc,
  config,
  region,
  isFirst,
  headerCase,
}: {
  section: Section;
  doc: ResumeDoc;
  config: FitConfig;
  region: LayoutRegion;
  isFirst: boolean;
  headerCase: CSSProperties;
}) {
  const theme = doc.theme;
  const { sizePx, spacingPx } = resolveResumeLayout(doc, config).page;
  const contentGeometry = resolveContentGeometry(sizePx, spacingPx, config);
  const glyph = theme.bulletGlyph === "none" ? "" : theme.bulletGlyph;
  const es = entryStyleOf(theme);
  const textColor = region.textColor ?? theme.colors.text;
  const mutedColor = region.mutedColor ?? theme.colors.muted;
  const headingColor = region.headingColor ?? textColor;
  const inlineGap = 16 * (config.inlineGapScale ?? 1);
  const accent = region.entryAccent;

  return (
    <section
      style={{
        color: textColor,
        marginTop: isFirst ? 0 : spacingPx.section,
      }}
    >
      <h2
        style={{
          fontFamily: `"${theme.fonts.heading}", sans-serif`,
          fontSize: sizePx.sectionHeader,
          fontWeight: 700,
          lineHeight: Math.max(config.lineHeight, 1.05),
          margin: 0,
          color: headingColor,
          borderBottom:
            theme.sectionHeaderStyle.rule === "bottom"
              ? `1px solid ${headingColor}`
              : "none",
          paddingBottom: theme.sectionHeaderStyle.rule === "bottom" ? 2 : 0,
          ...headerCase,
        }}
      >
        <RichText text={section.title} linkColor={theme.colors.primary} />
      </h2>
      <div style={{ height: spacingPx.header * 0.6 }} />
      {section.entries.map((entry, entryIndex) => {
        const bullets = entry.bullets.filter((bullet) => bullet.trim());
        const organization = entryOrganizationDisplay(entry);
        const organizationInline =
          es.subheadingInline && Boolean(entry.heading.trim());
        const metadataOrganization = organizationInline ? "" : organization;
        const location = entry.location.trim();
        const hasMetadata = Boolean(metadataOrganization || location);
        const accentWidth = accent ? accent.width * PT_TO_PX : 0;
        const accentGap = accent ? accent.gap * PT_TO_PX : 0;
        return (
          <div
            key={entry.id}
            style={{
              marginTop: entryIndex === 0 ? 0 : spacingPx.entry,
              borderLeft:
                accent?.side === "left"
                  ? `${accentWidth}px solid ${accent.color}`
                  : undefined,
              borderRight:
                accent?.side === "right"
                  ? `${accentWidth}px solid ${accent.color}`
                  : undefined,
              paddingLeft: accent?.side === "left" ? accentGap : undefined,
              paddingRight: accent?.side === "right" ? accentGap : undefined,
            }}
          >
            {(entry.heading.trim() || entry.dateRange.trim()) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: inlineGap,
                }}
              >
                <span
                  style={{
                    fontFamily: `"${theme.fonts.heading}", sans-serif`,
                    fontWeight: 700,
                    fontSize: sizePx.entryHeading,
                    lineHeight: Math.max(config.lineHeight, 1.1),
                  }}
                >
                  <RichText
                    text={entry.heading}
                    linkColor={theme.colors.primary}
                  />
                  {organizationInline && (
                    <span
                      style={{
                        fontFamily: `"${theme.fonts.body}", serif`,
                        fontWeight: es.subheadingItalic ? 400 : 700,
                        fontStyle: es.subheadingItalic ? "italic" : "normal",
                        fontSize: sizePx.body,
                      }}
                    >
                      {" — "}
                      <RichText
                        text={organization}
                        linkColor={theme.colors.primary}
                      />
                    </span>
                  )}
                </span>
                {entry.dateRange.trim() && (
                  <span
                    style={{
                      color: mutedColor,
                      whiteSpace:
                        theme.dateStyle === "right" ? "nowrap" : undefined,
                      fontStyle: es.dateItalic ? "italic" : undefined,
                    }}
                  >
                    {theme.dateStyle === "inline" ? "· " : ""}
                    <RichText
                      text={entry.dateRange}
                      linkColor={theme.colors.primary}
                    />
                  </span>
                )}
              </div>
            )}
            {hasMetadata && (
              <div
                style={{
                  fontWeight:
                    metadataOrganization && !es.subheadingItalic ? 700 : 400,
                  fontStyle:
                    metadataOrganization && es.subheadingItalic
                      ? "italic"
                      : "normal",
                }}
              >
                {metadataOrganization ? (
                  <RichText
                    text={metadataOrganization}
                    linkColor={theme.colors.primary}
                  />
                ) : null}
                {metadataOrganization && location ? " · " : null}
                {location ? (
                  <RichText text={location} linkColor={theme.colors.primary} />
                ) : null}
              </div>
            )}
            {entry.narrative?.trim() ? (
              <MarkdownBlocks
                text={entry.narrative}
                linkColor={theme.colors.primary}
                paragraphGap={contentGeometry.markdown.paragraphGap}
                listIndent={contentGeometry.markdown.listIndent}
                listItemGap={contentGeometry.markdown.listItemGap}
                headingGap={contentGeometry.markdown.headingGap}
                headingFontSize={contentGeometry.markdown.headingFontSize}
                subheadingFontSize={contentGeometry.markdown.subheadingFontSize}
                headingFontFamily={`"${theme.fonts.heading}", sans-serif`}
                headingColor={headingColor}
                style={{
                  marginTop:
                    entry.heading.trim() ||
                    entry.dateRange.trim() ||
                    organization ||
                    location
                      ? contentGeometry.metadataGap
                      : 0,
                }}
              />
            ) : null}
            {bullets.length > 0 && (
              <ul
                style={{
                  margin: 0,
                  paddingTop: entry.narrative?.trim()
                    ? contentGeometry.metadataGap
                    : 0,
                  paddingRight: 0,
                  paddingBottom: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                }}
              >
                {bullets.map((bullet, bulletIndex) => (
                  <li
                    key={bulletIndex}
                    style={{
                      position: "relative",
                      paddingLeft: glyph ? "1.1em" : 0,
                      marginTop: bulletIndex === 0 ? 0 : spacingPx.bullet,
                    }}
                  >
                    {glyph && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: "0.15em",
                          color: textColor,
                        }}
                      >
                        {glyph}
                      </span>
                    )}
                    <RichText
                      text={
                        theme.boldLeadIns
                          ? bullet
                          : bullet.replace(/\*\*(.+?)\*\*/g, "$1")
                      }
                      linkColor={theme.colors.primary}
                    />
                  </li>
                ))}
              </ul>
            )}
            {(entry.engagements ?? []).map((engagement) => (
              <EngagementBlock
                key={engagement.id}
                engagement={engagement}
                depth={0}
                doc={doc}
                config={config}
                textColor={textColor}
                mutedColor={mutedColor}
                headingColor={headingColor}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function EngagementBlock({
  engagement,
  depth,
  doc,
  config,
  textColor,
  mutedColor,
  headingColor,
}: {
  engagement: Engagement | ChildEngagement;
  depth: 0 | 1;
  doc: ResumeDoc;
  config: FitConfig;
  textColor: string;
  mutedColor: string;
  headingColor: string;
}) {
  const { sizePx, spacingPx } = resolveResumeLayout(doc, config).page;
  const geometry = resolveContentGeometry(sizePx, spacingPx, config);
  const organization = engagementOrganizationDisplay(engagement);
  const title = engagement.name.trim() || engagement.role.trim();
  const secondaryRole = engagement.name.trim() ? engagement.role.trim() : "";
  const glyph = doc.theme.bulletGlyph === "none" ? "" : doc.theme.bulletGlyph;
  const children =
    depth === 0 && "engagements" in engagement
      ? (engagement.engagements ?? [])
      : [];
  const hasHeader = Boolean(
    title ||
    secondaryRole ||
    engagement.dateRange.trim() ||
    organization ||
    engagement.location.trim(),
  );
  const Heading = depth === 0 ? "h3" : "h4";

  return (
    <article
      style={{
        paddingTop: geometry.engagementGap,
        paddingLeft: geometry.engagementIndent,
        color: textColor,
      }}
    >
      {(title || engagement.dateRange.trim()) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: geometry.engagementIndent,
          }}
        >
          <Heading
            style={{
              margin: 0,
              color: headingColor,
              fontFamily: `"${doc.theme.fonts.heading}", sans-serif`,
              fontSize: depth === 0 ? sizePx.entryHeading : sizePx.body,
              fontWeight: 700,
              lineHeight: Math.max(config.lineHeight, 1.1),
            }}
          >
            <RichText text={title} linkColor={doc.theme.colors.primary} />
            {secondaryRole ? (
              <span
                style={{
                  fontFamily: `"${doc.theme.fonts.body}", sans-serif`,
                  fontSize: sizePx.body,
                  fontWeight: 400,
                }}
              >
                {" — "}
                <RichText
                  text={secondaryRole}
                  linkColor={doc.theme.colors.primary}
                />
              </span>
            ) : null}
          </Heading>
          {engagement.dateRange.trim() ? (
            <span style={{ color: mutedColor, whiteSpace: "nowrap" }}>
              <RichText
                text={engagement.dateRange}
                linkColor={doc.theme.colors.primary}
              />
            </span>
          ) : null}
        </div>
      )}
      {organization || engagement.location.trim() ? (
        <div style={{ color: mutedColor }}>
          {organization ? (
            <RichText
              text={organization}
              linkColor={doc.theme.colors.primary}
            />
          ) : null}
          {organization && engagement.location.trim() ? " · " : null}
          {engagement.location.trim() ? (
            <RichText
              text={engagement.location}
              linkColor={doc.theme.colors.primary}
            />
          ) : null}
        </div>
      ) : null}
      {engagement.narrative.trim() ? (
        <MarkdownBlocks
          text={engagement.narrative}
          linkColor={doc.theme.colors.primary}
          paragraphGap={geometry.markdown.paragraphGap}
          listIndent={geometry.markdown.listIndent}
          listItemGap={geometry.markdown.listItemGap}
          headingGap={geometry.markdown.headingGap}
          headingFontSize={geometry.markdown.headingFontSize}
          subheadingFontSize={geometry.markdown.subheadingFontSize}
          headingFontFamily={`"${doc.theme.fonts.heading}", sans-serif`}
          headingColor={headingColor}
          style={{ marginTop: hasHeader ? geometry.metadataGap : 0 }}
        />
      ) : null}
      {engagement.bullets.some((bullet) => bullet.trim()) ? (
        <ul
          style={{
            margin: 0,
            paddingTop: engagement.narrative.trim() ? geometry.metadataGap : 0,
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            listStyle: "none",
          }}
        >
          {engagement.bullets
            .filter((bullet) => bullet.trim())
            .map((bullet, bulletIndex) => (
              <li
                key={bulletIndex}
                style={{
                  position: "relative",
                  paddingLeft: glyph ? "1.1em" : 0,
                  marginTop: bulletIndex === 0 ? 0 : spacingPx.bullet,
                }}
              >
                {glyph ? (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: "0.15em",
                      color: textColor,
                    }}
                  >
                    {glyph}
                  </span>
                ) : null}
                <RichText
                  text={
                    doc.theme.boldLeadIns
                      ? bullet
                      : bullet.replace(/\*\*(.+?)\*\*/g, "$1")
                  }
                  linkColor={doc.theme.colors.primary}
                />
              </li>
            ))}
        </ul>
      ) : null}
      {children.map((child) => (
        <EngagementBlock
          key={child.id}
          engagement={child}
          depth={1}
          doc={doc}
          config={config}
          textColor={textColor}
          mutedColor={mutedColor}
          headingColor={headingColor}
        />
      ))}
    </article>
  );
}
