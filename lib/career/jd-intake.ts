/**
 * Job-description intake beyond pasting.
 *
 * Two extra routes: attach a file (Markdown, plain text, or PDF) or point at a
 * publicly reachable URL. Anything we cannot read honestly says so and asks the
 * user to paste the text instead — it never guesses at a job description.
 *
 * Everything fetched or uploaded is untrusted data. It is never treated as
 * instructions, and it is length-bounded before it reaches a model.
 */

export const MAX_JD_CHARS = 100_000;

export interface JdExtraction {
  ok: boolean;
  text: string;
  source: string;
  /** Present when extraction failed; safe to show the user verbatim. */
  message?: string;
}

const PASTE_FALLBACK =
  "Paste the job description text instead and it will work normally.";

/** Block private, loopback, and cloud-metadata destinations (SSRF guard). */
function isPubliclyRoutable(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return false;
  }
  // Bare IPv6 loopback / link-local.
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc")) {
    return false;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

export function assertSafeJdUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  if (!isPubliclyRoutable(url.hostname)) return null;
  return url;
}

/** Strip tags, scripts, and styles from fetched HTML down to readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fetch a job description from a public URL.
 *
 * Many job boards block automated fetches or require sign-in. That is an
 * expected outcome, not an error to hide: the user is told plainly and asked to
 * paste instead.
 */
export async function fetchJdFromUrl(raw: string): Promise<JdExtraction> {
  const url = assertSafeJdUrl(raw);
  if (!url) {
    return {
      ok: false,
      text: "",
      source: raw,
      message: `That does not look like a public http(s) link. ${PASTE_FALLBACK}`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "text/html,text/plain,application/xhtml+xml" },
    });
    if (!response.ok) {
      return {
        ok: false,
        text: "",
        source: url.toString(),
        message: `That page could not be read (HTTP ${response.status}). Many job boards block automated access or need a sign-in. ${PASTE_FALLBACK}`,
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|xhtml/i.test(contentType)) {
      return {
        ok: false,
        text: "",
        source: url.toString(),
        message: `That link is not a readable web page. ${PASTE_FALLBACK}`,
      };
    }
    const body = (await response.text()).slice(0, 400_000);
    const text = /text\/plain/i.test(contentType)
      ? body.trim()
      : htmlToText(body);
    if (text.length < 200) {
      return {
        ok: false,
        text: "",
        source: url.toString(),
        message: `That page did not contain enough readable text — it is probably rendered after sign-in. ${PASTE_FALLBACK}`,
      };
    }
    return {
      ok: true,
      text: text.slice(0, MAX_JD_CHARS),
      source: url.toString(),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      text: "",
      source: url.toString(),
      message: aborted
        ? `That page took too long to respond. ${PASTE_FALLBACK}`
        : `That page could not be reached. ${PASTE_FALLBACK}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accept an uploaded job description. Markdown and plain text are read directly;
 * PDF text is extracted in the browser before it gets here. Anything else —
 * including DOCX, which is deliberately unsupported — asks for a paste.
 */
export function jdFromUploadedText(args: {
  filename: string;
  text: string;
}): JdExtraction {
  const name = args.filename.toLowerCase();
  const supported = /\.(md|markdown|txt|text|pdf)$/.test(name);
  if (!supported) {
    return {
      ok: false,
      text: "",
      source: args.filename,
      message: `MagicResume cannot read ${args.filename}. Markdown, plain text, and PDF work. ${PASTE_FALLBACK}`,
    };
  }
  const text = args.text.replace(/\r\n?/g, "\n").trim();
  if (text.length < 200) {
    return {
      ok: false,
      text: "",
      source: args.filename,
      message: `That file did not contain enough readable text. ${PASTE_FALLBACK}`,
    };
  }
  return { ok: true, text: text.slice(0, MAX_JD_CHARS), source: args.filename };
}
