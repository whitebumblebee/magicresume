"use client";

import { useBuilderStore } from "@/lib/store";
import type { SectionType } from "@/lib/resume/schema";
import { SECTION_TYPE_TITLES } from "@/lib/resume/defaults";
import { ContactEditor } from "./ContactEditor";
import { SectionEditor } from "./SectionEditor";
import { ThemePanel } from "./ThemePanel";
import { LayoutPanel } from "./LayoutPanel";
import { MarkdownEditor } from "./MarkdownEditor";

const detailsCls =
  "rounded-lg border border-zinc-200 bg-white open:pb-3 shadow-sm";
const summaryCls =
  "cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:text-zinc-900";
const bodyCls = "px-3 pt-1";

export function EditorPanel() {
  const sections = useBuilderStore((s) => s.doc.sections);
  const summary = useBuilderStore((s) => s.doc.summary);
  const summaryTitle = useBuilderStore((s) => s.doc.summaryTitle ?? "");
  const setSummary = useBuilderStore((s) => s.setSummary);
  const setSummaryTitle = useBuilderStore((s) => s.setSummaryTitle);
  const addSection = useBuilderStore((s) => s.addSection);

  return (
    <aside className="w-[400px] shrink-0 space-y-2.5 overflow-y-auto border-r border-zinc-200 bg-zinc-50 p-3">
      <details id="ed-contact" className={detailsCls} open>
        <summary className={summaryCls}>Contact</summary>
        <div className={bodyCls}>
          <ContactEditor />
        </div>
      </details>

      <details id="ed-summary" className={detailsCls}>
        <summary className={summaryCls}>Summary</summary>
        <div className={`${bodyCls} space-y-2`}>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
            value={summaryTitle}
            onChange={(e) => setSummaryTitle(e.target.value)}
            placeholder="Optional heading, e.g. Profile Summary"
          />
          <MarkdownEditor
            label="Summary narrative"
            value={summary}
            onChange={setSummary}
            placeholder="Optional professional summary…"
            rows={5}
          />
        </div>
      </details>

      <div id="ed-sections" className="space-y-2.5">
        {sections.map((section) => (
          <details
            key={section.id}
            id={`ed-sec-${section.id}`}
            className={detailsCls}
          >
            <summary className={summaryCls}>
              {section.title || "Untitled section"}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                {section.entries.length}{" "}
                {section.entries.length === 1 ? "entry" : "entries"}
              </span>
            </summary>
            <div className={bodyCls}>
              <SectionEditor section={section} />
            </div>
          </details>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-white/60 p-2.5">
        <div className="mb-1.5 text-[11px] font-medium text-zinc-500">
          Add section
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SECTION_TYPE_TITLES) as SectionType[]).map((type) => (
            <button
              key={type}
              onClick={() => addSection(type)}
              className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:border-sky-400 hover:text-sky-700"
            >
              + {SECTION_TYPE_TITLES[type]}
            </button>
          ))}
        </div>
      </div>

      <details id="ed-design" className={detailsCls}>
        <summary className={summaryCls}>Design & fit</summary>
        <div className={bodyCls}>
          <ThemePanel />
        </div>
      </details>

      <details id="ed-layout" className={detailsCls}>
        <summary className={summaryCls}>Layout & regions</summary>
        <div className={bodyCls}>
          <LayoutPanel />
        </div>
      </details>
    </aside>
  );
}
