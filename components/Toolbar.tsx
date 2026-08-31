"use client";

import { useSession } from "next-auth/react";
import { useBuilderStore } from "@/lib/store";
import type { ResumeDoc } from "@/lib/resume/schema";
import { ImportControls } from "./ImportControls";
import { AccountMenu } from "./AccountMenu";

export function Toolbar({
  onOpenResumes,
  onImported,
}: {
  onOpenResumes: () => void;
  onImported?: (doc: ResumeDoc) => void;
}) {
  const { data: session } = useSession();
  const fit = useBuilderStore((s) => s.fit);
  const doc = useBuilderStore((s) => s.doc);
  const loadSample = useBuilderStore((s) => s.loadSample);
  const clearDoc = useBuilderStore((s) => s.clearDoc);
  const artifactKind = useBuilderStore((s) => s.artifactKind);

  const download = () => {
    if (artifactKind === "target") return;
    const name = doc.contact.name.trim() || "resume";
    document.title = `${name} — Resume`;
    window.print();
  };

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-sky-700">Magic</span>Resume
        </span>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
          Evidence-first · truthful by design
        </span>
        {artifactKind === "target" && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Private target preview · export blocked
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {fit &&
          (fit.status === "fit" ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {fit.tight ? "Tight fit" : "Fits 1 page"} ·{" "}
              {Math.round(fit.fillRatio * 100)}% full · body{" "}
              {(doc.theme.sizes.body * fit.config.sizeScale).toFixed(2)}pt
            </span>
          ) : (
            <button
              type="button"
              onClick={() => useBuilderStore.getState().setCompressOpen(true)}
              className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              Too long for 1 page (~{fit.estimatedPages} pages) — ✨ Make it fit
            </button>
          ))}
        {artifactKind === "application" && (
          <button
            onClick={() => useBuilderStore.getState().setAtsOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ATS score
          </button>
        )}
        <ImportControls onImported={onImported} />
        {artifactKind === "application" && (
          <button
            onClick={onOpenResumes}
            className={`rounded-md border px-3 py-1.5 text-sm ${session?.user ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
          >
            {session?.user ? "My resumes ☁" : "My resumes"}
          </button>
        )}
        <button
          onClick={loadSample}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Load sample
        </button>
        <button
          onClick={clearDoc}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Clear
        </button>
        <button
          onClick={download}
          disabled={artifactKind === "target"}
          title={
            artifactKind === "target"
              ? "Target-state resumes are private and cannot be exported."
              : "Download PDF"
          }
          className="rounded-md bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-amber-800"
        >
          {artifactKind === "target" ? "Export blocked" : "Download PDF"}
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
