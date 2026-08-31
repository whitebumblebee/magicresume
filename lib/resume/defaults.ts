import type {
  PageSize,
  ResumeDoc,
  ResumeLayout,
  ThemeTokens,
} from "./schema";

export const PT_TO_PX = 96 / 72;

export const PAGE_DIMS: Record<PageSize, { widthPt: number; heightPt: number }> = {
  A4: { widthPt: 595.28, heightPt: 841.89 },
  LETTER: { widthPt: 612, heightPt: 792 },
};

/** Fonts offered in the theme panel / LLM allowlist. Google ones are loaded
 *  in app/layout.tsx; Georgia + Arial are system fonts. */
export const FONT_OPTIONS = [
  "Carlito",
  "Inter",
  "Lato",
  "Open Sans",
  "Montserrat",
  "Nunito",
  "Raleway",
  "Roboto",
  "Source Serif 4",
  "PT Serif",
  "EB Garamond",
  "Roboto Slab",
  "Georgia",
  "Arial",
] as const;

/** Common PDF font names → closest allowlist family. Used by the importer's
 *  font mapping so exotic embedded fonts land on a visually similar option. */
export const FONT_ALIASES: Record<string, string> = {
  times: "PT Serif",
  timesnewroman: "PT Serif",
  garamond: "EB Garamond",
  cambria: "PT Serif",
  book: "PT Serif",
  palatino: "EB Garamond",
  georgia: "Georgia",
  arial: "Inter",
  helvetica: "Inter",
  verdana: "Open Sans",
  tahoma: "Open Sans",
  segoe: "Inter",
  calibri: "Carlito",
  carlito: "Carlito",
  notosans: "Inter",
  liberationsans: "Inter",
  roboto: "Roboto",
  lato: "Lato",
  opensans: "Open Sans",
  montserrat: "Montserrat",
  nunito: "Nunito",
  raleway: "Raleway",
  sourceserif: "Source Serif 4",
  robotoslab: "Roboto Slab",
  rockwell: "Roboto Slab",
  gill: "Nunito",
  myriad: "Nunito",
  futura: "Montserrat",
  century: "PT Serif",
  charter: "Source Serif 4",
  liberationserif: "PT Serif",
  nimbusroman: "PT Serif",
  nimbussans: "Inter",
  freeserif: "PT Serif",
  freesans: "Inter",
  dejavuserif: "PT Serif",
  dejavusans: "Open Sans",
  sfpro: "Inter",
  sf: "Inter",
  system: "Inter",
  sans: "Inter",
  serif: "PT Serif",
};

/**
 * Default theme — derived from the seed resume (blue bold name, uppercase
 * section headers with a bottom rule, right-aligned dates, bold lead-ins).
 */
export const DEFAULT_THEME: ThemeTokens = {
  fonts: { heading: "Carlito", body: "Carlito" },
  colors: {
    primary: "#1a6aa0",
    text: "#1f2937",
    muted: "#4b5563",
  },
  sizes: {
    name: 21,
    sectionHeader: 11,
    entryHeading: 10.5,
    body: 10,
  },
  lineHeight: 1.25,
  margins: { top: 28, right: 40, bottom: 28, left: 40 },
  spacing: { section: 10, entry: 6, bullet: 2, header: 5 },
  sectionHeaderStyle: { case: "upper", rule: "bottom" },
  dateStyle: "right",
  bulletGlyph: "•",
  boldLeadIns: true,
  headerAlignment: "left",
  contactStyle: "icons",
  contactLayout: "inline",
  contactLabelStyle: {
    case: "upper",
    divider: true,
    labelWidth: 62,
    rowGap: 6,
  },
  identityStyle: {
    nameLayout: "inline",
    accent: "none",
    headlineCase: "as-is",
    headlineSize: 12,
    headlineGap: 10,
  },
  entryStyle: {
    subheadingInline: false,
    subheadingItalic: false,
    dateItalic: false,
  },
};

/** Resolved entry-line styling (optional theme fields → concrete booleans).
 *  Shared by the renderer and the virtual layout so the two stay mirrored. */
export interface EntryStyle {
  subheadingInline: boolean;
  subheadingItalic: boolean;
  dateItalic: boolean;
}

export function entryStyleOf(theme: {
  entryStyle?: Partial<EntryStyle> | undefined;
}): EntryStyle {
  return {
    subheadingInline: theme.entryStyle?.subheadingInline ?? false,
    subheadingItalic: theme.entryStyle?.subheadingItalic ?? false,
    dateItalic: theme.entryStyle?.dateItalic ?? false,
  };
}

/** Name color with the legacy fallback to the accent color. */
export function nameColorOf(theme: {
  colors: { primary: string; name?: string | undefined };
}): string {
  return theme.colors.name ?? theme.colors.primary;
}

export interface IdentityStyle {
  nameLayout: "inline" | "stacked";
  accent: "none" | "first-word";
  headlineCase: "as-is" | "upper" | "title";
  headlineSize: number;
  headlineGap: number;
}

export function identityStyleOf(theme: {
  identityStyle?: Partial<IdentityStyle> | undefined;
}): IdentityStyle {
  return {
    nameLayout: theme.identityStyle?.nameLayout ?? "inline",
    accent: theme.identityStyle?.accent ?? "none",
    headlineCase: theme.identityStyle?.headlineCase ?? "as-is",
    headlineSize: theme.identityStyle?.headlineSize ?? 12,
    headlineGap: theme.identityStyle?.headlineGap ?? 10,
  };
}

export interface ContactLabelStyle {
  case: "as-is" | "upper" | "title";
  divider: boolean;
  labelWidth: number;
  rowGap: number;
}

export function contactLabelStyleOf(theme: {
  contactLabelStyle?: Partial<ContactLabelStyle> | undefined;
}): ContactLabelStyle {
  return {
    case: theme.contactLabelStyle?.case ?? "upper",
    divider: theme.contactLabelStyle?.divider ?? true,
    labelWidth: theme.contactLabelStyle?.labelWidth ?? 62,
    rowGap: theme.contactLabelStyle?.rowGap ?? 6,
  };
}

export function applyTextCase(
  text: string,
  value: "as-is" | "upper" | "title",
): string {
  if (value === "upper") return text.toUpperCase();
  if (value === "title") {
    return text.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
  }
  return text;
}

export const SECTION_TYPE_TITLES: Record<string, string> = {
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  awards: "Awards",
  custom: "Section",
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}


export function defaultResumeLayout(doc: Pick<ResumeDoc, "sections">): ResumeLayout {
  const regionId = "region-main";
  return {
    version: 1,
    preset: "single",
    regions: [
      {
        id: regionId,
        row: 0,
        column: 0,
        width: 1,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        minHeight: 0,
        fillPage: false,
        repeatOnPage: false,
      },
    ],
    placements: [
      { kind: "identity", regionId, order: 0 },
      { kind: "contact", regionId, order: 1 },
      { kind: "summary", regionId, order: 2 },
      ...doc.sections.map((section, index) => ({
        kind: "section" as const,
        sectionId: section.id,
        regionId,
        order: index + 3,
      })),
    ],
    columnGap: 0,
    rowGap: 0,
    confidence: 1,
    unsupportedFeatures: [],
  };
}

export function layoutOf(doc: ResumeDoc): ResumeLayout {
  return doc.layout ?? defaultResumeLayout(doc);
}
export function emptyResumeDoc(): ResumeDoc {
  return {
    page: { size: "A4" },
    theme: structuredClone(DEFAULT_THEME),
    contact: {
      name: "",
      email: "",
      phone: "",
      location: "",
      links: [],
      details: [],
    },
    headline: "",
    summary: "",
    summaryTitle: "",
    sections: [],
  };
}
