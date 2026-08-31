import { linkifyText, safeHref } from "@/lib/render/link-utils";

export const MAX_MARKDOWN_LENGTH = 8_000;
export const MAX_MARKDOWN_LIST_ITEMS = 80;

export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "emphasis"; children: MarkdownInline[] }
  | { type: "link"; href: string | null; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownInline[][] };

const HTML_LIKE = /<\/?[A-Za-z][^>]*>/;
const CONTROL_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const IMAGE_SYNTAX = /!\[[^\]]*\]\([^)]*\)/;
const EXPLICIT_LINK = /\[([^\]]+)\]\(([^)]*)\)/g;
const UNSUPPORTED_HEADING = /^\s*#{3,}(?:\s|$)/m;
const UNSUPPORTED_HEADINGS = /^(\s*)#{3,}(?=\s|$)/gm;
const BACKTICKS = /`/g;

export function containsHtmlLikeInput(value: string): boolean {
  return HTML_LIKE.test(value);
}

function sanitizeMarkdownDraft(
  value: string | null | undefined,
  maxLength: number,
): string {
  if (!value) return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(BACKTICKS, "")
    .replace(UNSUPPORTED_HEADINGS, "$1##")
    .replace(SCRIPT_OR_STYLE, "")
    .replace(HTML_TAG, "")
    .replace(IMAGE, "$1")
    .replace(EXPLICIT_LINK, (_match, label: string, destination: string) => {
      const href = safeHref(destination);
      return href ? `[${label}](${href})` : label;
    })
    .slice(0, maxLength);
}

/** Sanitize an in-progress block draft without trimming authoring whitespace. */
export function draftCleanMarkdown(
  value: string | null | undefined,
  maxLength = MAX_MARKDOWN_LENGTH,
): string {
  return sanitizeMarkdownDraft(value, maxLength);
}

/** Sanitize an in-progress bullet draft while preserving its exact whitespace. */
export function draftCleanInlineMarkdown(
  value: string | null | undefined,
  maxLength = 1_000,
): string {
  return sanitizeMarkdownDraft(value, maxLength);
}

/**
 * Canonicalize untrusted Markdown for imports and normalization. Unlike the
 * draft helpers, this intentionally trims and collapses authoring whitespace.
 */
export function cleanMarkdown(
  value: string | null | undefined,
  maxLength = MAX_MARKDOWN_LENGTH,
): string {
  return sanitizeMarkdownDraft(value, maxLength)
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function isSafeMarkdown(value: string): boolean {
  if (
    value.length > MAX_MARKDOWN_LENGTH ||
    containsHtmlLikeInput(value) ||
    CONTROL_CHAR.test(value) ||
    IMAGE_SYNTAX.test(value) ||
    value.includes("`") ||
    UNSUPPORTED_HEADING.test(value)
  ) {
    return false;
  }
  for (const match of value.matchAll(new RegExp(EXPLICIT_LINK.source, "g"))) {
    if (!safeHref(match[2])) return false;
  }
  return true;
}

export function cleanInlineMarkdown(
  value: string | null | undefined,
  maxLength = 1_000,
): string {
  return cleanMarkdown(value, maxLength)
    .replace(/\s*\n+\s*/g, " ")
    .trim()
    .slice(0, maxLength);
}

function appendText(nodes: MarkdownInline[], text: string): void {
  if (!text) return;
  for (const linked of linkifyText(text)) {
    if (linked.href) {
      nodes.push({
        type: "link",
        href: linked.href,
        children: [{ type: "text", text: linked.text }],
      });
    } else if (linked.text) {
      const last = nodes.at(-1);
      if (last?.type === "text") last.text += linked.text;
      else nodes.push({ type: "text", text: linked.text });
    }
  }
}

/** Parse only the inline subset. Unsupported syntax remains escaped text. */
export function parseInlineMarkdown(
  input: string,
  depth = 0,
): MarkdownInline[] {
  const text = input.slice(0, MAX_MARKDOWN_LENGTH);
  if (depth > 4) return [{ type: "text", text }];
  const nodes: MarkdownInline[] = [];
  let cursor = 0;
  let plainStart = 0;

  const flush = (end: number) => {
    appendText(nodes, text.slice(plainStart, end));
  };

  while (cursor < text.length) {
    if (text.startsWith("**", cursor)) {
      const close = text.indexOf("**", cursor + 2);
      if (close > cursor + 2) {
        flush(cursor);
        nodes.push({
          type: "strong",
          children: parseInlineMarkdown(
            text.slice(cursor + 2, close),
            depth + 1,
          ),
        });
        cursor = close + 2;
        plainStart = cursor;
        continue;
      }
    }

    const marker = text[cursor];
    if ((marker === "*" || marker === "_") && text[cursor + 1] !== marker) {
      const close = text.indexOf(marker, cursor + 1);
      if (close > cursor + 1) {
        flush(cursor);
        nodes.push({
          type: "emphasis",
          children: parseInlineMarkdown(
            text.slice(cursor + 1, close),
            depth + 1,
          ),
        });
        cursor = close + 1;
        plainStart = cursor;
        continue;
      }
    }

    if (marker === "[" && text[cursor - 1] !== "!") {
      const labelEnd = text.indexOf("](", cursor + 1);
      const destinationEnd =
        labelEnd >= 0 ? text.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd > cursor + 1 && destinationEnd > labelEnd + 2) {
        flush(cursor);
        const label = text.slice(cursor + 1, labelEnd);
        const destination = text.slice(labelEnd + 2, destinationEnd);
        nodes.push({
          type: "link",
          href: safeHref(destination),
          children: parseInlineMarkdown(label, depth + 1),
        });
        cursor = destinationEnd + 1;
        plainStart = cursor;
        continue;
      }
    }
    cursor += 1;
  }
  flush(text.length);
  return nodes;
}

export function parseMarkdownBlocks(input: string): MarkdownBlock[] {
  const source = input.replace(/\r\n?/g, "\n").slice(0, MAX_MARKDOWN_LENGTH);
  const lines = source.split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2,
        children: parseInlineMarkdown(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const list = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(line);
    if (list) {
      const ordered = Boolean(list[1]);
      const items: MarkdownInline[][] = [];
      while (index < lines.length && items.length < MAX_MARKDOWN_LIST_ITEMS) {
        const item = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(lines[index]);
        if (!item || Boolean(item[1]) !== ordered) break;
        items.push(parseInlineMarkdown(item[2].trim()));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,2})\s+/.test(lines[index]) &&
      !/^\s*(?:(\d+)[.)]|[-+*])\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      children: parseInlineMarkdown(paragraph.join(" ")),
    });
  }
  return blocks;
}

export function inlineMarkdownToPlainText(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) =>
      node.type === "text"
        ? node.text
        : inlineMarkdownToPlainText(node.children),
    )
    .join("");
}

export function markdownToPlainText(value: string): string {
  return parseMarkdownBlocks(value)
    .flatMap((block) =>
      block.type === "list"
        ? block.items.map(inlineMarkdownToPlainText)
        : [inlineMarkdownToPlainText(block.children)],
    )
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
