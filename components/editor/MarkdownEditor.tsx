"use client";

import { useId, useRef } from "react";
import { MarkdownBlocks } from "@/lib/render/text";

const toolbarButton =
  "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:border-sky-400 hover:text-sky-700";

export function MarkdownEditor({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const replaceSelection = (
    transform: (selected: string) => { text: string; selectionStart?: number; selectionEnd?: number },
  ) => {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end);
    const result = transform(selected);
    const next = value.slice(0, start) + result.text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(
        start + (result.selectionStart ?? 0),
        start + (result.selectionEnd ?? result.text.length),
      );
    });
  };

  const wrap = (before: string, after = before, fallback = "text") =>
    replaceSelection((selected) => {
      const content = selected || fallback;
      return {
        text: `${before}${content}${after}`,
        selectionStart: before.length,
        selectionEnd: before.length + content.length,
      };
    });

  const prefixLines = (prefix: string | ((index: number) => string)) =>
    replaceSelection((selected) => {
      const source = selected || "text";
      return {
        text: source
          .split("\n")
          .map((line, index) => `${typeof prefix === "string" ? prefix : prefix(index)}${line}`)
          .join("\n"),
      };
    });

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-medium text-zinc-500">
        {label}
      </label>
      <div className="flex flex-wrap gap-1" aria-label={`${label} formatting`}>
        <button type="button" className={toolbarButton} onClick={() => wrap("**")} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" className={toolbarButton} onClick={() => wrap("*")} title="Italic">
          <em>I</em>
        </button>
        <button type="button" className={toolbarButton} onClick={() => prefixLines("# ")} title="Heading">
          H1
        </button>
        <button type="button" className={toolbarButton} onClick={() => prefixLines("## ")} title="Subheading">
          H2
        </button>
        <button type="button" className={toolbarButton} onClick={() => prefixLines("- ")} title="Unordered list">
          • List
        </button>
        <button type="button" className={toolbarButton} onClick={() => prefixLines((index) => `${index + 1}. `)} title="Ordered list">
          1. List
        </button>
        <button type="button" className={toolbarButton} onClick={() => wrap("[", "](https://example.com)", "link text")} title="Link">
          Link
        </button>
      </div>
      <textarea
        ref={textarea}
        id={id}
        className="w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs leading-relaxed focus:border-sky-500 focus:outline-none"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value.trim() ? (
        <div className="rounded border border-zinc-200 bg-white p-2 text-xs leading-relaxed text-zinc-700" aria-label={`${label} preview`}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Preview</div>
          <MarkdownBlocks
            text={value}
            linkColor="#0369a1"
            paragraphGap={4}
            listIndent={18}
            listItemGap={2}
            headingGap={2}
            headingFontSize={14}
            subheadingFontSize={12}
            headingFontFamily="inherit"
          />
        </div>
      ) : null}
    </div>
  );
}
