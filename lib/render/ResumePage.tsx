import type { CSSProperties } from "react";
import type { ResumeDoc, Section } from "@/lib/resume/schema";
import type { FitConfig } from "@/lib/fit/types";
import { entryStyleOf, nameColorOf } from "@/lib/resume/defaults";
import { resolvePage } from "./resolve";
import { RichText } from "./text";
import { Icon, iconForUrl, type IconName } from "./icons";
export { RegionResumePage as ResumePage } from "./RegionResumePage";

/**
 * Pure renderer: ResumeDoc + FitConfig → exact-size page (A4/Letter at 96dpi).
 * Structurally mirrored by lib/fit/layout.ts (computeLayout) — keep the block
 * order and spacing rules in sync when editing either side.
 */
export function LegacyResumePage({
  doc,
  config,
}: {
  doc: ResumeDoc;
  config: FitConfig;
}) {
  const theme = doc.theme;
  const page = resolvePage(doc, config);
  const { sizePx, spacingPx } = page;
  const lh = config.lineHeight;

  const headerCase: CSSProperties =
    theme.sectionHeaderStyle.case === "upper"
      ? { textTransform: "uppercase", letterSpacing: "0.07em" }
      : theme.sectionHeaderStyle.case === "smallcaps"
        ? { fontVariantCaps: "small-caps", letterSpacing: "0.03em" }
        : {};

  const headerAlign = theme.headerAlignment ?? "left";
  const plainContact = (theme.contactStyle ?? "icons") === "plain";

  const contactItems: { icon: IconName; text: string; href?: string }[] = [];
  if (doc.contact.phone.trim())
    contactItems.push({ icon: "phone", text: doc.contact.phone });
  if (doc.contact.email.trim())
    contactItems.push({
      icon: "mail",
      text: doc.contact.email,
      href: `mailto:${doc.contact.email}`,
    });
  if (doc.contact.location.trim())
    contactItems.push({ icon: "pin", text: doc.contact.location });
  for (const link of doc.contact.links) {
    if (!link.label.trim()) continue;
    contactItems.push({
      icon: iconForUrl(link.url, link.label),
      text: link.label,
      href: link.url,
    });
  }

  return (
    <div
      style={{
        width: page.pageW,
        // Never a fixed height + overflow:hidden — content must never be
        // silently cut. Grows past one page when needed (fit chip reports it).
        // No forced page breaks: print paginates at exact page boundaries so
        // the PDF matches the on-screen preview's "page N starts here" lines.
        minHeight: page.pageH,
        padding: `${page.padding.t}px ${page.padding.r}px ${page.padding.b}px ${page.padding.l}px`,
        background: "#ffffff",
        color: theme.colors.text,
        fontFamily: `"${theme.fonts.body}", "Helvetica Neue", Arial, sans-serif`,
        fontSize: sizePx.body,
        lineHeight: lh,
        boxSizing: "border-box",
      }}
    >
      {/* ---- Header ---- */}
      <div
        style={{
          fontFamily: `"${theme.fonts.heading}", sans-serif`,
          fontSize: sizePx.name,
          fontWeight: 700,
          lineHeight: Math.max(lh, 1.05),
          color: nameColorOf(theme),
          textAlign: headerAlign,
        }}
      >
        {doc.contact.name || "Your Name"}
      </div>
      {contactItems.length > 0 &&
        (plainContact ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              columnGap: 10,
              rowGap: 2,
              marginTop: 4 * config.spacingScale,
              justifyContent:
                headerAlign === "center" ? "center" : "flex-start",
              color: theme.colors.muted,
            }}
          >
            {contactItems.map((item, i) => {
              const isLink = item.href && !item.href.startsWith("mailto:");
              return (
                <span
                  key={i}
                  style={{ display: "inline-flex", whiteSpace: "nowrap" }}
                >
                  {i > 0 && <span aria-hidden>|</span>}
                  {item.href && !isLink ? (
                    <a
                      href={item.href}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {item.text}
                    </a>
                  ) : isLink ? (
                    <a
                      href={item.href}
                      style={{
                        color: theme.colors.primary,
                        textDecoration: "underline",
                      }}
                    >
                      {item.text}
                    </a>
                  ) : (
                    item.text
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 14,
              rowGap: 2,
              marginTop: 4 * config.spacingScale,
              justifyContent:
                headerAlign === "center" ? "center" : "flex-start",
              color: theme.colors.muted,
            }}
          >
            {contactItems.map((item, i) => {
              const inner = (
                <>
                  <Icon
                    name={item.icon}
                    size={sizePx.body * 0.95}
                    color={theme.colors.primary}
                  />
                  <span>{item.text}</span>
                </>
              );
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.href ? (
                    <a
                      href={item.href}
                      style={{
                        color: theme.colors.primary,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </span>
              );
            })}
          </div>
        ))}
      <div style={{ height: spacingPx.header }} />

      {/* ---- Summary ---- */}
      {doc.summary.trim() && (
        <>
          <div>
            <RichText text={doc.summary} />
          </div>
          <div style={{ height: spacingPx.header }} />
        </>
      )}

      {/* ---- Sections ---- */}
      {doc.sections.map((section, si) => (
        <SectionBlock
          key={section.id}
          section={section}
          doc={doc}
          config={config}
          isFirst={si === 0}
          headerCase={headerCase}
        />
      ))}
    </div>
  );
}

export function SectionBlock({
  section,
  doc,
  config,
  isFirst,
  headerCase,
  colors,
  entryAccent,
}: {
  section: Section;
  doc: ResumeDoc;
  config: FitConfig;
  isFirst: boolean;
  headerCase: CSSProperties;
  colors?: { text: string; muted: string; heading: string };
  entryAccent?: {
    side: "left" | "right";
    color: string;
    width: number;
    gap: number;
  };
}) {
  const theme = doc.theme;
  const page = resolvePage(doc, config);
  const { sizePx, spacingPx } = page;
  const lh = config.lineHeight;
  const glyph = theme.bulletGlyph === "none" ? "" : theme.bulletGlyph;
  const es = entryStyleOf(theme);
  const dateStyleCss = es.dateItalic
    ? { fontStyle: "italic" as const }
    : undefined;
  const palette = colors ?? {
    text: theme.colors.text,
    muted: theme.colors.muted,
    heading: theme.colors.text,
  };

  return (
    <section
      style={{
        marginTop: isFirst ? 0 : spacingPx.section,
      }}
    >
      <h2
        style={{
          fontFamily: `"${theme.fonts.heading}", sans-serif`,
          fontSize: sizePx.sectionHeader,
          fontWeight: 700,
          lineHeight: Math.max(lh, 1.05),
          margin: 0,
          color: palette.heading,
          borderBottom:
            theme.sectionHeaderStyle.rule === "bottom"
              ? `1px solid ${palette.heading}`
              : "none",
          paddingBottom: theme.sectionHeaderStyle.rule === "bottom" ? 2 : 0,
          ...headerCase,
        }}
      >
        {section.title}
      </h2>
      <div style={{ height: spacingPx.header * 0.6 }} />
      {section.entries.map((entry, ei) => {
        const bullets = entry.bullets.filter((b) => b.trim());
        return (
          <div
            key={entry.id}
            style={{
              marginTop: ei === 0 ? 0 : spacingPx.entry,
              borderLeft:
                entryAccent?.side === "left"
                  ? `${entryAccent.width}px solid ${entryAccent.color}`
                  : undefined,
              borderRight:
                entryAccent?.side === "right"
                  ? `${entryAccent.width}px solid ${entryAccent.color}`
                  : undefined,
              paddingLeft:
                entryAccent?.side === "left" ? entryAccent.gap : undefined,
              paddingRight:
                entryAccent?.side === "right" ? entryAccent.gap : undefined,
            }}
          >
            {(entry.heading.trim() || entry.dateRange.trim()) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: `"${theme.fonts.heading}", sans-serif`,
                    fontWeight: 700,
                    fontSize: sizePx.entryHeading,
                    lineHeight: Math.max(lh, 1.1),
                  }}
                >
                  {entry.heading}
                  {es.subheadingInline && entry.subheading.trim() && (
                    <span
                      style={{
                        fontFamily: `"${theme.fonts.body}", serif`,
                        fontWeight: es.subheadingItalic ? 400 : 700,
                        fontStyle: es.subheadingItalic ? "italic" : "normal",
                        fontSize: sizePx.body,
                      }}
                    >
                      {" — "}
                      {entry.subheading}
                    </span>
                  )}
                </span>
                {entry.dateRange.trim() &&
                  (theme.dateStyle === "right" ? (
                    <span
                      style={{
                        color: palette.muted,
                        whiteSpace: "nowrap",
                        ...dateStyleCss,
                      }}
                    >
                      {entry.dateRange}
                    </span>
                  ) : (
                    <span
                      style={{ color: palette.muted, ...dateStyleCss }}
                    >
                      · {entry.dateRange}
                    </span>
                  ))}
              </div>
            )}
            {entry.subheading.trim() && !es.subheadingInline && (
              <div
                style={{
                  fontWeight: es.subheadingItalic ? 400 : 700,
                  fontStyle: es.subheadingItalic ? "italic" : "normal",
                }}
              >
                {entry.subheading}
              </div>
            )}
            {bullets.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {bullets.map((bullet, bi) => (
                  <li
                    key={bi}
                    style={{
                      position: "relative",
                      paddingLeft: glyph ? "1.1em" : 0,
                      marginTop: bi === 0 ? 0 : spacingPx.bullet,
                    }}
                  >
                    {glyph && (
                      <span
                        style={{
                          position: "absolute",
                          left: "0.15em",
                          color: palette.text,
                        }}
                        aria-hidden
                      >
                        {glyph}
                      </span>
                    )}
                    {theme.boldLeadIns ? (
                      <RichText text={bullet} />
                    ) : (
                      bullet.replace(/\*\*(.+?)\*\*/g, "$1")
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
