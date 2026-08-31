/**
 * Bullets/summary support `**bold**` markers (used for lead-ins like
 * "**Polaris Monitoring & Alerting (Voltron):** Designed ...").
 */

export interface TextSegment {
  text: string;
  bold: boolean;
}

export function parseMarkers(input: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match.index > last) {
      segments.push({ text: input.slice(last, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    last = re.lastIndex;
  }
  if (last < input.length) {
    segments.push({ text: input.slice(last), bold: false });
  }
  return segments;
}

export function stripMarkers(input: string): string {
  return input.replace(/\*\*(.+?)\*\*/g, "$1");
}

/**
 * Strips leading list markers (•, ●, ▪, ◦, ·, -, –, …) that PDF/OCR
 * extraction leaves in bullet text — the renderer draws its own glyph, so
 * leftover markers would double up ("• • Built…").
 */
export function stripBulletGlyph(input: string): string {
  let out = input.trim();
  for (;;) {
    // Allow the marker to sit behind a leading ** bold opener
    // ("**• Lead:** text") — extraction artifacts land there too.
    const next = out.replace(
      /^(\*\*)?(?:[•●▪◦∙‣·]|\d{1,2}[.)]|[-–—](?=\s))\s*/u,
      "$1",
    );
    if (next === out) return out;
    out = next;
  }
}
