const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const COMMON_BARE_TLDS =
  "com|org|net|io|ai|dev|app|co|in|me|tech|cloud|jobs|site|info|edu|gov|test|uk|de|fr|ca|au|us";
const LINK_CANDIDATE =
  new RegExp(
    `https?:\\/\\/[^\\s<>"']+|www\\.[^\\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|(?:[A-Z0-9-]+\\.)+(?:${COMMON_BARE_TLDS})(?:\\/[^\\s<>"']*)?`,
    "gi",
  );

export interface LinkedTextSegment {
  text: string;
  href?: string;
}

/** Accept only browser/PDF-safe link protocols. Bare domains are promoted to
 * HTTPS so imported values like `linkedin.com/in/example` never become
 * relative links to the MR host. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^mailto:/i.test(value)) return safeEmailHref(value.slice(7));
  if (/^tel:/i.test(value)) return safePhoneHref(value.slice(4));
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value)) {
    return null;
  }
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    const webProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
    const domainLike = parsed.hostname.includes(".") || parsed.hostname === "localhost";
    return webProtocol && domainLike ? parsed.href : null;
  } catch {
    return null;
  }
}

export function safeEmailHref(raw: string): string | null {
  const email = raw.trim();
  return EMAIL.test(email) ? `mailto:${email}` : null;
}

export function safePhoneHref(raw: string): string | null {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 5 ? `tel:${plus}${digits}` : null;
}

/** Resolve a complete visible value such as a custom contact detail. */
export function safeTextHref(raw: string): string | null {
  const value = raw.trim();
  if (EMAIL.test(value) || /^mailto:/i.test(value)) {
    return safeEmailHref(value.replace(/^mailto:/i, ""));
  }
  if (/^\+?[\d\s().-]+$/.test(value)) return safePhoneHref(value);
  return safeHref(value);
}

function trimCandidate(candidate: string): {
  link: string;
  trailing: string;
} {
  let link = candidate;
  let trailing = "";
  while (/[.,;:!?]$/.test(link)) {
    trailing = link.slice(-1) + trailing;
    link = link.slice(0, -1);
  }
  while (link.endsWith(")")) {
    const closingCount = (link.match(/\)/g) ?? []).length;
    const openingCount = (link.match(/\(/g) ?? []).length;
    if (closingCount <= openingCount) break;
    trailing = ")" + trailing;
    link = link.slice(0, -1);
  }
  return { link, trailing };
}

/** Split visible text into safe anchor and non-anchor segments without
 * changing any characters. This is used by both normal and bold rich text. */
export function linkifyText(input: string): LinkedTextSegment[] {
  const segments: LinkedTextSegment[] = [];
  let cursor = 0;
  LINK_CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_CANDIDATE.exec(input)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: input.slice(cursor, match.index) });
    }
    const { link, trailing } = trimCandidate(match[0]);
    const explicitLink = /^(?:https?:\/\/|www\.)/i.test(link);
    const bareDomainLooksIntentional = explicitLink || link === link.toLowerCase();
    const href = EMAIL.test(link)
      ? safeEmailHref(link)
      : bareDomainLooksIntentional
        ? safeHref(link)
        : null;
    segments.push(href ? { text: link, href } : { text: link });
    if (trailing) segments.push({ text: trailing });
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) segments.push({ text: input.slice(cursor) });
  return segments.length > 0 ? segments : [{ text: input }];
}

export function isWebHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
