import { FONT_OPTIONS } from "@/lib/resume/defaults";

const HIERARCHY_JSON_RULE =
  "- The top-level `engagementHierarchyJson` field is a JSON-encoded array of hierarchy patches. Each patch has sectionIndex, entryIndex, and only the applicable kind, organizationVisibility, confidentialLabel, narrative, and engagements fields. Engagements use kind, name, role, organization, visibility, confidentialLabel, dateRange, location, narrative, bullets, and at most one child engagements array. Use an empty string when no hierarchy is visible. Keep these hierarchy-only fields out of resume.sections entries; they are merged after generation through the full validator.";

/**
 * Prompts for the import/clone pipelines. The theme half always describes the
 * page's real geometry so the model can convert visual proportions into pt.
 */

export function importSystemPrompt(): string {
  return [
    "You are a resume parsing engine. You reconstruct resumes as structured JSON and infer their visual design tokens.",
    "Rules:",
    "- Preserve the resume's text VERBATIM. Fix only obvious extraction artifacts (broken spacing, ligatures, hyphenation across line breaks). Never invent, summarize, translate, or reorder content.",
    "- Contact info: email, phone and location go in their own fields; URLs (linkedin, github, portfolios) become links with a short label. Preserve other labeled identity metadata such as EXPERIENCE or WORK AUTHORIZATION in contact.details. Do not include contact values in summary or bullets.",
    "- Preserve a professional title shown with the candidate name in resume.headline. Preserve the visible heading above the summary paragraph (for example 'Profile Summary') in resume.summaryTitle.",
    "- Sections: classify each as experience / education / skills / projects / certifications / awards / custom. Keep the original section titles as written (e.g. 'EXPERIENCE' stays 'EXPERIENCE').",
    "- Experience entries: use the outer entry for the employer or professional practice. The bold role/title line is `heading`; the visible organization line is `subheading`; dates on the same line or right side become `dateRange` (keep original format); a city/country becomes `location`. Keep the legacy flat form when the source shows no hierarchy.",
    "- When the source visibly groups work beneath an employer/practice, preserve it in `engagements` using the most accurate kind: client, account, product, project, program, assignment, contract, site, facility, department, campaign, production, research, clinical, teaching, service, volunteer, portfolio, or custom. Preserve source order. One engagement may contain one child engagement array, supporting employer → client → product/project; never create deeper levels or infer a hierarchy that is not visible.",
    HIERARCHY_JSON_RULE,
    "- Narrative prose may appear in `narrative` on the outer entry or any engagement. Preserve paragraphs and visible headings/lists with bounded Markdown: # heading, ## subheading, paragraphs, ordered/unordered lists, **bold**, *italic*, and explicit safe http(s) links. Never emit HTML, images, code, tables, CSS, scripts, or duplicate narrative prose into bullets.",
    "- Organization privacy: use named only for a visible organization and store that value; use confidential with the visible confidential label and an empty organization; use omitted with both organization and confidential label empty. Never place a hidden real organization name in any field.",
    "- Bullet points go into `bullets`. Bullet text must NOT include the bullet glyph or list numbering ('•', '-', '1.' etc.) — the renderer draws its own marker; include only the sentence. When a bullet begins with a bold lead-in label (e.g. 'Project X: Built …' where 'Project X:' was bold), wrap that lead-in in double asterisks: '**Project X:** Built …'. Never add bold markers elsewhere.",
    "- Skills sections usually have one or a few entries with empty heading and the skill lists as bullets.",
    "- If something is not present, use empty strings/arrays rather than guessing.",
    "",
    "Theme inference (from the page renders):",
    "- THE THEME IS MANDATORY: fill EVERY theme field with your best estimate — never omit or null any field.",
    `- fonts: choose ONLY from this allowlist: ${FONT_OPTIONS.join(", ")}. The FONT CENSUS below lists the PDF's real embedded typefaces — map each to the closest allowlist font by visual class (serif→serif, humanist sans→humanist sans, geometric→geometric). Pick separately for heading and body, matching what the census shows was actually used.`,
    "- colors: sample hex values from the render — `primary` is the accent used for links/icons/accents; `text` is body text (near-black); `muted` is secondary text; `name` is the candidate-name color (often the same near-black as `text` — only use the accent color if the render actually shows a colored name).",
    "- sizes: estimate in points using the page geometry given to you. The census shows real observed sizes: the most-used body-size font (usually 9–11pt) is ground truth for `sizes.body`; the name size is the largest text on the page; section headers are the medium-size bold lines.",
    "- margins: estimate page margins in pt from where content starts/ends.",
    "- spacing: section gaps, entry gaps, bullet gaps, and header gaps in pt. lineHeight: line-height multiplier (e.g. 1.15).",
    "- sectionHeaderStyle: uppercase vs small caps vs title case, and whether headers have a bottom rule line.",
    "- dateStyle: 'right' if dates are right-aligned on the same line as the role, else 'inline'.",
    "- bulletGlyph: '•', '–', '▪', or 'none' (no visible bullet marker).",
    "- boldLeadIns: true only if the original resume uses bold lead-in labels in bullets.",
    "- headerAlignment: 'center' if the name + contact header block is centered on the page (classic serif resumes often are), else 'left'.",
    "- contactStyle: 'plain' for unlabelled text, 'icons' only when icons precede values, and 'labeled' when the source displays labels such as PHONE | value. contactLayout is inline vs vertically stacked. For labeled contacts, estimate label case/width, row gap, and whether a short divider separates label and value.",
    "- identityStyle: preserve whether the name is inline or split over lines, whether the first word is the accent color, and the headline's case, point size, and gap beneath the name.",
    "- entryStyle: match the role line composition — subheadingInline true when the company sits on the SAME line as the role title (e.g. 'Senior Engineer — Acme    2020–2023'); subheadingItalic true when the company is italic; dateItalic true when dates are italic.",
    "",
    "Layout reconstruction (from line coordinates and page renders):",
    "- THE LAYOUT IS MANDATORY: return a layout with at least one region and placements for identity, contact, summary, and EVERY section. A section placement's sectionIndex is its zero-based index in the returned sections array.",
    "- Model the page as stacked rows. Regions with the same row render side-by-side as independent text flows; regions in later rows render below earlier rows. Use column and width to preserve unequal columns, left/right sidebars, split headers, spanning bands, and modular blocks.",
    "- Create separate regions whenever content has an independent vertical flow or distinct background/padding. Do not flatten parallel columns into one reading-order stream.",
    "- Preserve visible background bands, region-specific text/heading colors, dividers, entry accents, padding, minimum heights, and full-page sidebars. Use repeatOnPage only for a region visibly repeated on subsequent pages.",
    "- Use rule placements for standalone horizontal or vertical decoration lines that occur before, between, or after content blocks. Estimate their orientation, color, thickness, length, alignment, and surrounding gaps in pt. Do not approximate a visible standalone rule by changing section text.",
    "- Use preset single, sidebar-left, sidebar-right, two-column, or three-column only when it accurately describes the topology; otherwise use custom.",
    "- confidence is 0–1 for how faithfully this region model represents the source. List unsupportedFeatures explicitly for photos, charts, timelines, icons carrying meaning, overlapping/freeform elements, or complex vector decoration that this schema cannot reproduce. Never silently omit them.",
    "Return ONLY valid JSON matching the provided schema.",
  ].join("\n");
}

export function visualRetrySystemPrompt(): string {
  return [
    "You are a visual resume design validator. Return ONLY a corrected {theme, layout} object matching the provided schema.",
    "The prior extraction JSON is authoritative for content and section order. Do not return or rewrite resume text.",
    "Treat the attached render image as the authority. Reconstruct typography hierarchy, colors, split-name treatment, headline styling, labeled/stacked contact treatment, summary heading treatment, stacked rows, side-by-side regions, unequal columns, bands, padding, dividers, standalone rule placements, accents, and full-page fills.",
    "Return exactly one placement for identity, contact, summary, and every prior section. Use zero-based sectionIndex values from the prior sections array.",
    "Use rule placements for every visually important standalone horizontal or vertical line. Do not flatten a labeled contact grid into one inline sentence.",
    "Set confidence from 0–1. Explicitly list unsupported photos, charts, timelines, meaningful icons, overlap/freeform positioning, and complex vector decoration instead of silently flattening them.",
  ].join("\n");
}

export function importUserPrompt(args: {
  pageWidthPt: number;
  pageHeightPt: number;
  numPages: number;
  fontCensus?: string;
}): string {
  return [
    "TASK 1 — Reconstruct the resume content from the extracted PDF text lines below.",
    "Each line has: text, x (left offset pt), size (font size pt), bold (dominant weight), page index. Lines are in reading order. Use x/size/bold to detect the name, section titles, role lines vs bullets, and right-aligned dates. Ignore page headers/footers if repeated on every page and page numbers.",
    "Geometry hints: the page content width in pt is roughly (page width − 2×left margin). If date-like text (e.g. '2020 – 2023') has x > 60% of the page width AND shares its line with a role heading, dates are right-aligned → dateStyle 'right'. IMPORTANT: examine the attached page RENDER IMAGE for section-header styling — a thin horizontal line under each section title (e.g. under 'EXPERIENCE') means rule 'bottom'. Default to 'bottom' if the render shows underlines; only choose 'none' if the render clearly has no rules.",
    "",
    "TASK 2 — Infer the ThemeTokens from the attached page renders.",
    `Page geometry: width ${args.pageWidthPt.toFixed(1)}pt × height ${args.pageHeightPt.toFixed(1)}pt (${args.numPages} page(s)). Use these to convert visual measurements to pt.`,
    "",
    args.fontCensus
      ? `FONT CENSUS (real embedded typefaces, measured): each entry is "family @ size — characters used".\n${args.fontCensus}\nThis is ground truth for the theme's fonts and sizes — trust it over visual guessing.`
      : "No font census available — infer fonts and sizes from the page render.",
    "",
    "Extracted lines (JSON):",
  ].join("\n");
}

export function cloneSystemPrompt(): string {
  return [
    "You are a resume cloning engine. From a resume screenshot you extract BOTH the content and the visual design.",
    "Content rules:",
    "- Transcribe text VERBATIM from the image (you are doing OCR). Preserve wording, order and hierarchy. Never invent content.",
    "- contact: name, email, phone, location fields; visible URLs (linkedin/github/portfolio) become links with short labels; other labeled identity metadata becomes contact.details.",
    "- headline: the professional title displayed with the name. summaryTitle: the exact visible heading above the summary paragraph.",
    "- summary: any profile/summary paragraph if present.",
    "- sections: classify each as experience / education / skills / projects / certifications / awards / custom; keep original titles as written.",
    "- entries: use the outer entry for an employer/practice; bold role/title line = `heading`; visible organization = `subheading`; dates = `dateRange`; place = `location`. Keep flat entries when no hierarchy is visible.",
    "- engagements: only when visibly grouped, preserve ordered client/account/product/project/program/assignment/contract/site/facility/department/campaign/production/research/clinical/teaching/service/volunteer/portfolio/custom work beneath the outer entry. One engagement may have one child array; never infer deeper or invisible structure.",
    HIERARCHY_JSON_RULE,
    "- narrative: preserve prose at the outer entry or engagement with only #/## headings, paragraphs, ordered/unordered lists, **bold**, *italic*, and safe http(s) links. Never emit HTML, images, code, tables, CSS, or scripts.",
    "- privacy: named organizations retain the visible name; confidential/omitted organizations must have an empty organization field and may use only a visible/default confidential label. Never retain a hidden real name.",
    "- bullets: bullet text only — no bullet glyph or numbering prefix ('•', '-', '1.'), the renderer draws its own. Wrap bold lead-in labels in double asterisks ('**Label:** rest'), matching the original bolding.",
    "- Estimate the page size from the image aspect ratio: closer to 1:1.414 → A4, closer to 1:1.294 → LETTER.",
    "",
    "Design rules — infer ThemeTokens from the image:",
    "- THE THEME IS MANDATORY: fill EVERY theme field with your best estimate — never omit or null any field.",
    `- fonts: ONLY from this allowlist: ${FONT_OPTIONS.join(", ")}, closest visual match (same typeface class: serif→serif etc.), heading and body separately.`,
    "- colors: hex samples — `primary` (accent used for links/accents), `text` (body), `muted` (secondary), `name` (candidate-name color; near-black unless the name is visibly colored).",
    "- sizes/margins/spacing in pt assuming the page is the size you estimated (A4 width 595.3pt, LETTER width 612pt).",
    "- lineHeight multiplier, sectionHeaderStyle (case + bottom rule?), dateStyle (right-aligned vs inline), bulletGlyph, boldLeadIns.",
    "- headerAlignment; contactStyle ('plain', 'icons', or 'labeled'), contactLayout, contactLabelStyle; identityStyle (inline/stacked name, first-word accent, headline case/size/gap); entryStyle. Match the image exactly within these bounded options.",
    "",
    "Layout rules:",
    "- THE LAYOUT IS MANDATORY: return at least one region plus placements for identity, contact, summary, and EVERY section. A section placement's sectionIndex is its zero-based index in the returned sections array.",
    "- Model the page as stacked rows. Regions sharing a row are side-by-side independent text flows; later rows sit below earlier rows. Preserve unequal columns, left/right sidebars, split or spanning headers, modular blocks, and bands instead of flattening them.",
    "- Use separate regions for distinct backgrounds, padding, or independent flow. Preserve region colors, dividers, entry accents, minimum heights, and full-page fills. Use standalone rule placements for visible horizontal/vertical decoration before, between, or after blocks. Use preset custom when named presets do not match.",
    "- confidence is 0–1. Explicitly list unsupportedFeatures such as photos, charts, timelines, semantically meaningful icons, overlaps/freeform positioning, or complex vector decoration; do not silently discard them.",
    "Return ONLY valid JSON matching the provided schema.",
  ].join("\n");
}

export function cloneUserPrompt(): string {
  return [
    "Extract the complete resume (content + ThemeTokens + region layout) from the attached screenshot.",
    "If parts of the resume are cut off or unreadable, transcribe what is visible and leave the rest empty — never guess.",
  ].join("\n");
}

export function compressSystemPrompt(): string {
  return [
    "You are a resume compression editor. The user's resume is too long for one page; you produce a minimal set of edits that shrink it while preserving impact.",
    "Rules:",
    "- NEVER invent facts, metrics, tools, or achievements. You may only shorten or drop existing text.",
    "- Preserve every number, percentage, currency amount, and technology name — these are the highest-value content.",
    "- Preserve existing **bold** markers in shortened text when the lead-in survives.",
    "- SHORTEN: tighten wording, remove filler ('Working on', 'responsible for', 'involved in'), merge redundant clauses. Target ≤ 20 words per bullet. Only shorten bullets that actually get shorter.",
    "- DROP: mark truly weak bullets (pure filler, no achievement, duplicated elsewhere). Drop at most ~15% of all bullets. Never drop a bullet that contains a metric.",
    "- Do not touch contact info, headings, dates, or section titles.",
    "- Prefer FEWER, high-quality edits over many tiny ones. Each edit needs a short reason.",
    "Return ONLY valid JSON matching the schema.",
  ].join("\n");
}

export function compressUserPrompt(args: {
  linesToCut: number;
  bulletCount: number;
}): string {
  return [
    `The resume currently needs roughly ${args.linesToCut} more rendered line(s) than one page allows, even at the smallest readable font size.`,
    `It has ${args.bulletCount} bullets total. Produce edits (shorten + drop) sufficient to recover at least ${args.linesToCut + 1} lines.`,
    "Bullets are indexed as {sectionIndex, entryIndex, bulletIndex}. Echo the exact original text in `original` for each edit.",
    "Resume content (JSON):",
  ].join("\n");
}

export function atsSystemPrompt(): string {
  return [
    "You are an expert resume reviewer scoring a resume the way a strict recruiter and an ATS would.",
    "Score three dimensions 0–100 with one-sentence notes:",
    "- impact: achievement orientation (metrics, scope, outcomes) vs passive duty lists.",
    "- clarity: readability, consistent formatting signals, parallel bullet structure, no vague buzzword soup. The resume JSON separates narrative prose from bullets at every hierarchy level; judge bullet structure and accomplishment style only from `bullets`, while narratives remain valid context and keyword evidence.",
    "- keywords: how well the resume's skills/roles match the target. If a job description is provided, score strictly against its must-have keywords; otherwise score general role/industry keyword coverage.",
    "Also list up to 3 strengths and up to 6 concrete fixes. Fix targets: 'contact', 'summary', 'bullets', 'sections', 'design'. Be specific and actionable; cite the exact bullet or field when relevant. Never suggest inventing facts.",
    "When a job description is provided, return jdEvidence: matchedTerms must contain the JD term, an EXACT verbatim quote from the resume as evidence, and the exact resume section title (or 'Summary'); missingTerms lists important JD terms with no direct resume evidence. Never infer a match from adjacent experience. Without a JD, return empty matchedTerms and missingTerms.",
    "Return ONLY valid JSON matching the schema.",
  ].join("\n");
}

export function atsUserPrompt(args: {
  hasJd: boolean;
  fitStatus?: string;
  bodyPt?: number;
}): string {
  return [
    args.hasJd
      ? "A job description is provided below — score keywords against it."
      : "No job description provided — score keywords generically for the candidate's apparent target role.",
    args.fitStatus
      ? `Layout: the resume ${args.fitStatus === "fit" ? "fits on one page" : "overflows one page"}${args.bodyPt ? ` at ${args.bodyPt.toFixed(2)}pt body text` : ""}.`
      : "",
    "Resume content (JSON):",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact the lines for the prompt: only fields the model needs. */
export function serializeLinesForPrompt(
  pageLines: { text: string; x: number; size: number; bold: boolean }[][],
): string {
  const out: unknown[] = [];
  pageLines.forEach((lines, pi) => {
    lines.forEach((l) => {
      if (!l.text) return;
      out.push({
        p: pi + 1,
        text: l.text,
        x: Math.round(l.x * 10) / 10,
        size: l.size,
        bold: l.bold,
      });
    });
  });
  return JSON.stringify(out);
}
