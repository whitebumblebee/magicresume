import type {
  ChildEngagement,
  Engagement,
  LayoutPlacement,
  LayoutRegion,
  ResumeDoc,
  ResumeLayout,
  Section,
  ThemeTokens,
} from "@/lib/resume/schema";
import {
  MAX_ENGAGEMENTS_PER_ENTRY,
  MAX_ENGAGEMENT_CHILDREN,
  MAX_ENGAGEMENTS_PER_LEVEL,
} from "@/lib/resume/schema";
import { cleanInlineMarkdown, cleanMarkdown } from "@/lib/resume/markdown";
import {
  DEFAULT_THEME,
  FONT_ALIASES,
  FONT_OPTIONS,
  defaultResumeLayout,
  newId,
} from "@/lib/resume/defaults";
import { llmImportResultSchema, type LlmImportResult } from "@/lib/llm/schemas";
import { stripBulletGlyph } from "@/lib/render/text-utils";
import { safeHref } from "@/lib/render/link-utils";

/**
 * Sanitizes an LLM import result into a guaranteed-valid ResumeDoc:
 * merge over defaults, clamp numbers into sane ranges, drop junk, assign ids.
 * Import flows must always pass through here before touching the store.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function safeHex(value: string | undefined, fallback: string): string {
  return value && HEX.test(value.trim()) ? value.trim() : fallback;
}

function cleanText(value: string | undefined, maxLen = 2000): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/** Keep bullets/summaries multi-line-capable but strip control chars and
 *  leftover list markers (the renderer draws its own glyph). */
function cleanBullet(value: string): string {
  return cleanInlineMarkdown(
    stripBulletGlyph(
      value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
        .replace(/\s+/g, " "),
    ),
    1_000,
  );
}

type LlmEntry =
  LlmImportResult["resume"]["sections"][number]["entries"][number];
type LlmEngagement = NonNullable<LlmEntry["engagements"]>[number];
type LlmChildEngagement = NonNullable<LlmEngagement["engagements"]>[number];

function normalizeOrganization(
  value: string | undefined,
  visibility: "named" | "confidential" | "omitted",
): string {
  return visibility === "named" ? cleanText(value, 240) : "";
}

function normalizeChildEngagement(raw: LlmChildEngagement): ChildEngagement {
  const visibility = raw.visibility ?? "named";
  return {
    id: newId(),
    kind: raw.kind ?? "project",
    name: cleanText(raw.name, 240),
    role: cleanText(raw.role, 240),
    organization: normalizeOrganization(raw.organization, visibility),
    visibility,
    confidentialLabel:
      visibility === "confidential"
        ? cleanText(raw.confidentialLabel, 120)
        : "",
    dateRange: cleanText(raw.dateRange, 120),
    location: cleanText(raw.location, 160),
    narrative: cleanMarkdown(raw.narrative),
    bullets: (raw.bullets ?? []).map(cleanBullet).filter(Boolean).slice(0, 40),
  };
}

function normalizeEngagement(
  raw: LlmEngagement,
  budget: { remaining: number },
): Engagement | null {
  if (budget.remaining <= 0) return null;
  budget.remaining -= 1;
  const children: ChildEngagement[] = [];
  for (const child of (raw.engagements ?? []).slice(
    0,
    MAX_ENGAGEMENT_CHILDREN,
  )) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    children.push(normalizeChildEngagement(child));
  }
  const visibility = raw.visibility ?? "named";
  return {
    id: newId(),
    kind: raw.kind ?? "project",
    name: cleanText(raw.name, 240),
    role: cleanText(raw.role, 240),
    organization: normalizeOrganization(raw.organization, visibility),
    visibility,
    confidentialLabel:
      visibility === "confidential"
        ? cleanText(raw.confidentialLabel, 120)
        : "",
    dateRange: cleanText(raw.dateRange, 120),
    location: cleanText(raw.location, 160),
    narrative: cleanMarkdown(raw.narrative),
    bullets: (raw.bullets ?? []).map(cleanBullet).filter(Boolean).slice(0, 40),
    engagements: children.length > 0 ? children : undefined,
  };
}

function normalizeEntry(raw: LlmEntry) {
  const visibility = raw.organizationVisibility ?? "named";
  const budget = { remaining: MAX_ENGAGEMENTS_PER_ENTRY };
  const engagements = (raw.engagements ?? [])
    .slice(0, MAX_ENGAGEMENTS_PER_LEVEL)
    .map((engagement) => normalizeEngagement(engagement, budget))
    .filter((engagement): engagement is Engagement => engagement !== null);
  const narrative = cleanMarkdown(raw.narrative);
  return {
    id: newId(),
    heading: cleanText(raw.heading, 200),
    subheading: normalizeOrganization(raw.subheading, visibility),
    dateRange: cleanText(raw.dateRange, 60),
    location: cleanText(raw.location, 80),
    bullets: raw.bullets.map(cleanBullet).filter(Boolean).slice(0, 40),
    kind: raw.kind,
    organizationVisibility: raw.organizationVisibility,
    confidentialLabel:
      visibility === "confidential"
        ? cleanText(raw.confidentialLabel, 120)
        : undefined,
    narrative: narrative || undefined,
    engagements: engagements.length > 0 ? engagements : undefined,
  };
}

function pickFont(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const raw = value
    .replace(/^[A-Z]{6}\+/, "") // subset prefix (ABCDEF+Calibri-Bold)
    .replace(
      /[-_,](bold|italic|oblique|regular|light|medium|semibold|black)+/gi,
      "",
    )
    .trim();
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, "");

  // 1. exact allowlist match
  const exact = (FONT_OPTIONS as readonly string[]).find(
    (f) => f.toLowerCase().replace(/[^a-z]/g, "") === normalized,
  );
  if (exact) return exact;

  // 2. alias table (times → PT Serif, calibri → Carlito, …)
  for (const [key, target] of Object.entries(FONT_ALIASES)) {
    if (normalized.includes(key)) {
      const targetExists = (FONT_OPTIONS as readonly string[]).includes(target);
      if (targetExists) return target;
    }
  }

  // 3. token overlap with allowlist names
  const partial = (FONT_OPTIONS as readonly string[]).find((f) => {
    const fNorm = f.toLowerCase().replace(/[^a-z]/g, "");
    return (
      fNorm.length > 3 &&
      (normalized.includes(fNorm) || fNorm.includes(normalized))
    );
  });
  return partial ?? fallback;
}

export function normalizeImportResult(
  raw: unknown,
  pageSizeHint?: "A4" | "LETTER",
): ResumeDoc {
  const parsed: LlmImportResult = llmImportResultSchema.parse(raw);

  const t = parsed.theme ?? {};
  const primary = safeHex(t.colors?.primary, DEFAULT_THEME.colors.primary);
  const theme: ThemeTokens = {
    fonts: {
      heading: pickFont(t.fonts?.heading, DEFAULT_THEME.fonts.heading),
      body: pickFont(t.fonts?.body, DEFAULT_THEME.fonts.body),
    },
    colors: {
      primary,
      text: safeHex(t.colors?.text, DEFAULT_THEME.colors.text),
      muted: safeHex(t.colors?.muted, DEFAULT_THEME.colors.muted),
      name: safeHex(t.colors?.name, primary),
    },
    sizes: {
      name: clamp(t.sizes?.name ?? DEFAULT_THEME.sizes.name, 14, 32, 21),
      sectionHeader: clamp(
        t.sizes?.sectionHeader ?? DEFAULT_THEME.sizes.sectionHeader,
        9,
        16,
        11,
      ),
      entryHeading: clamp(
        t.sizes?.entryHeading ?? DEFAULT_THEME.sizes.entryHeading,
        9,
        14,
        10.5,
      ),
      body: clamp(t.sizes?.body ?? DEFAULT_THEME.sizes.body, 8.5, 12.5, 10),
    },
    lineHeight: clamp(t.lineHeight ?? DEFAULT_THEME.lineHeight, 1.1, 1.6, 1.25),
    margins: {
      top: clamp(t.margins?.top ?? DEFAULT_THEME.margins.top, 18, 60, 28),
      right: clamp(t.margins?.right ?? DEFAULT_THEME.margins.right, 18, 60, 40),
      bottom: clamp(
        t.margins?.bottom ?? DEFAULT_THEME.margins.bottom,
        18,
        60,
        28,
      ),
      left: clamp(t.margins?.left ?? DEFAULT_THEME.margins.left, 18, 60, 40),
    },
    spacing: {
      section: clamp(
        t.spacing?.section ?? DEFAULT_THEME.spacing.section,
        2,
        24,
        10,
      ),
      entry: clamp(t.spacing?.entry ?? DEFAULT_THEME.spacing.entry, 1, 16, 6),
      bullet: clamp(t.spacing?.bullet ?? DEFAULT_THEME.spacing.bullet, 0, 8, 2),
      header: clamp(
        t.spacing?.header ?? DEFAULT_THEME.spacing.header,
        0,
        16,
        5,
      ),
    },
    sectionHeaderStyle: {
      case: t.sectionHeaderStyle?.case ?? DEFAULT_THEME.sectionHeaderStyle.case,
      rule: t.sectionHeaderStyle?.rule ?? DEFAULT_THEME.sectionHeaderStyle.rule,
    },
    dateStyle: t.dateStyle ?? DEFAULT_THEME.dateStyle,
    bulletGlyph: t.bulletGlyph ?? DEFAULT_THEME.bulletGlyph,
    boldLeadIns: t.boldLeadIns ?? DEFAULT_THEME.boldLeadIns,
    headerAlignment: t.headerAlignment ?? DEFAULT_THEME.headerAlignment,
    contactStyle: t.contactStyle ?? DEFAULT_THEME.contactStyle,
    contactLayout: t.contactLayout ?? DEFAULT_THEME.contactLayout,
    contactLabelStyle: {
      case:
        t.contactLabelStyle?.case ??
        DEFAULT_THEME.contactLabelStyle?.case ??
        "upper",
      divider:
        t.contactLabelStyle?.divider ??
        DEFAULT_THEME.contactLabelStyle?.divider ??
        true,
      labelWidth: clamp(
        t.contactLabelStyle?.labelWidth ??
          DEFAULT_THEME.contactLabelStyle?.labelWidth ??
          62,
        32,
        140,
        62,
      ),
      rowGap: clamp(
        t.contactLabelStyle?.rowGap ??
          DEFAULT_THEME.contactLabelStyle?.rowGap ??
          6,
        0,
        24,
        6,
      ),
    },
    identityStyle: {
      nameLayout:
        t.identityStyle?.nameLayout ??
        DEFAULT_THEME.identityStyle?.nameLayout ??
        "inline",
      accent:
        t.identityStyle?.accent ??
        DEFAULT_THEME.identityStyle?.accent ??
        "none",
      headlineCase:
        t.identityStyle?.headlineCase ??
        DEFAULT_THEME.identityStyle?.headlineCase ??
        "as-is",
      headlineSize: clamp(
        t.identityStyle?.headlineSize ??
          DEFAULT_THEME.identityStyle?.headlineSize ??
          12,
        8.5,
        24,
        12,
      ),
      headlineGap: clamp(
        t.identityStyle?.headlineGap ??
          DEFAULT_THEME.identityStyle?.headlineGap ??
          10,
        0,
        36,
        10,
      ),
    },
    entryStyle: {
      subheadingInline:
        t.entryStyle?.subheadingInline ??
        DEFAULT_THEME.entryStyle?.subheadingInline ??
        false,
      subheadingItalic:
        t.entryStyle?.subheadingItalic ??
        DEFAULT_THEME.entryStyle?.subheadingItalic ??
        false,
      dateItalic:
        t.entryStyle?.dateItalic ??
        DEFAULT_THEME.entryStyle?.dateItalic ??
        false,
    },
  };

  const r = parsed.resume;
  const email =
    r.contact.email && /.+@.+\..+/.test(r.contact.email)
      ? r.contact.email.trim()
      : "";
  const links = r.contact.links
    .filter((l) => l.url?.trim())
    .slice(0, 8)
    .map((l) => ({
      id: newId(),
      label: cleanText(l.label, 60) || inferLinkLabel(l.url),
      url: safeHref(l.url.trim().slice(0, 300)) ?? "",
    }))
    .filter((link) => link.url);

  const sections = r.sections
    .filter((s) => s.title.trim() || s.entries.length > 0)
    .slice(0, 12)
    .map((s) => ({
      id: newId(),
      type: s.type,
      title: cleanText(s.title, 80) || s.type,
      entries: s.entries
        .map(normalizeEntry)
        .filter(
          (entry) =>
            entry.heading ||
            entry.subheading ||
            entry.bullets.length > 0 ||
            entry.narrative ||
            (entry.engagements?.length ?? 0) > 0,
        )
        .slice(0, 40),
    }))
    .filter((s) => s.entries.length > 0);

  const pageSize =
    pageSizeHint === "LETTER" || pageSizeHint === "A4" ? pageSizeHint : "A4";

  return {
    page: { size: pageSize },
    theme,
    contact: {
      name: cleanText(r.contact.name, 120),
      email,
      phone: cleanText(r.contact.phone, 40),
      location: cleanText(r.contact.location, 80),
      links,
      details: (r.contact.details ?? [])
        .map((detail) => ({
          id: newId(),
          label: cleanText(detail.label, 60),
          value: cleanText(detail.value, 160),
        }))
        .filter((detail) => detail.label && detail.value)
        .slice(0, 8),
    },
    headline: cleanText(r.headline, 160),
    summary: cleanMarkdown(r.summary, 1500),
    summaryTitle: cleanText(r.summaryTitle, 80),
    sections,
    layout: normalizeLayout(parsed.layout, sections),
  };
}

function normalizeLayout(
  raw: LlmImportResult["layout"],
  sections: Section[],
): ResumeLayout {
  if (!raw || raw.regions.length === 0) {
    return defaultResumeLayout({ sections });
  }

  const requestedRepeatedRegions = raw.regions.some(
    (region) => region.repeatOnPage,
  );
  const seenIds = new Set<string>();
  const regions: LayoutRegion[] = raw.regions
    .slice(0, 12)
    .map((region, index) => {
      const requested = cleanText(region.id, 60) || `region-${index + 1}`;
      let id = requested;
      let suffix = 2;
      while (seenIds.has(id)) id = `${requested}-${suffix++}`;
      seenIds.add(id);
      return {
        id,
        row: Math.round(clamp(region.row, 0, 7, 0)),
        column: Math.round(clamp(region.column, 0, 2, index)),
        width: clamp(region.width, 0.12, 1, 1),
        background: safeOptionalHex(region.background),
        textColor: safeOptionalHex(region.textColor),
        mutedColor: safeOptionalHex(region.mutedColor),
        headingColor: safeOptionalHex(region.headingColor),
        padding: {
          top: clamp(region.padding?.top ?? 0, 0, 72, 0),
          right: clamp(region.padding?.right ?? 0, 0, 72, 0),
          bottom: clamp(region.padding?.bottom ?? 0, 0, 72, 0),
          left: clamp(region.padding?.left ?? 0, 0, 72, 0),
        },
        minHeight: clamp(region.minHeight ?? 0, 0, 800, 0),
        fillPage: region.fillPage ?? false,
        divider:
          region.divider && safeOptionalHex(region.divider.color)
            ? {
                side: region.divider.side,
                color: safeOptionalHex(region.divider.color)!,
                width: clamp(region.divider.width, 0.25, 8, 1),
              }
            : undefined,
        entryAccent:
          region.entryAccent && safeOptionalHex(region.entryAccent.color)
            ? {
                side: region.entryAccent.side,
                color: safeOptionalHex(region.entryAccent.color)!,
                width: clamp(region.entryAccent.width, 0.5, 8, 2),
                gap: clamp(region.entryAccent.gap, 0, 24, 5),
              }
            : undefined,
        // The current renderer is intentionally one-page. Preserve honesty by
        // reporting a multi-page repeat request instead of implying that print
        // pagination can reproduce it.
        repeatOnPage: false,
      };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column);

  const regionIds = new Set(regions.map((region) => region.id));
  const fallbackRegionId = regions[0].id;
  const usedKinds = new Set<string>();
  const usedSections = new Set<string>();
  const placements: LayoutPlacement[] = [];

  for (const placement of raw.placements.slice(0, 40)) {
    const regionId = regionIds.has(placement.regionId)
      ? placement.regionId
      : fallbackRegionId;
    if (placement.kind === "section") {
      const sectionIndex = Math.round(placement.sectionIndex ?? -1);
      const section = sections[sectionIndex];
      if (!section || usedSections.has(section.id)) continue;
      usedSections.add(section.id);
      placements.push({
        kind: "section",
        sectionId: section.id,
        regionId,
        order: Math.round(clamp(placement.order, 0, 99, placements.length)),
      });
      continue;
    }
    if (placement.kind === "rule") {
      const color = safeOptionalHex(placement.rule?.color);
      if (!placement.rule || !color) continue;
      placements.push({
        kind: "rule",
        regionId,
        order: Math.round(clamp(placement.order, 0, 99, placements.length)),
        rule: {
          orientation: placement.rule.orientation ?? "horizontal",
          color,
          width: clamp(placement.rule.width ?? 1, 0.25, 8, 1),
          length: clamp(placement.rule.length ?? 40, 4, 400, 40),
          align: placement.rule.align ?? "start",
          marginBefore: clamp(placement.rule.marginBefore ?? 0, 0, 72, 0),
          marginAfter: clamp(placement.rule.marginAfter ?? 0, 0, 72, 0),
        },
      });
      continue;
    }
    if (usedKinds.has(placement.kind)) continue;
    usedKinds.add(placement.kind);
    placements.push({
      kind: placement.kind,
      regionId,
      order: Math.round(clamp(placement.order, 0, 99, placements.length)),
    });
  }

  for (const kind of ["identity", "contact", "summary"] as const) {
    if (!usedKinds.has(kind)) {
      placements.push({
        kind,
        regionId: fallbackRegionId,
        order: placements.length,
      });
    }
  }
  for (const section of sections) {
    if (!usedSections.has(section.id)) {
      placements.push({
        kind: "section",
        sectionId: section.id,
        regionId: fallbackRegionId,
        order: placements.length,
      });
    }
  }

  return {
    version: 1,
    preset: raw.preset,
    regions,
    placements,
    columnGap: clamp(raw.columnGap, 0, 72, 12),
    rowGap: clamp(raw.rowGap, 0, 72, 0),
    confidence: clamp(raw.confidence, 0, 1, 0.5),
    unsupportedFeatures: [
      ...(requestedRepeatedRegions
        ? ["Repeated regions on later pages require manual approximation."]
        : []),
      ...raw.unsupportedFeatures
        .map((feature) => cleanText(feature, 120))
        .filter(Boolean),
    ]
      .filter((feature, index, features) => features.indexOf(feature) === index)
      .slice(0, 12),
  };
}

function safeOptionalHex(value: string | undefined): string | undefined {
  return value && HEX.test(value.trim()) ? value.trim() : undefined;
}

function inferLinkLabel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("github")) return "GitHub";
  if (u.includes("linkedin")) return "LinkedIn";
  if (u.includes("mailto:")) return "Email";
  try {
    return new URL(
      url.startsWith("http") ? url : `https://${url}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

// Re-export so routes can validate the raw Gemini JSON before normalizing.
export { llmImportResultSchema };
export type { LlmImportResult };
