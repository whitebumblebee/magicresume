"use client";

import { useEffect, useState } from "react";
import { useBuilderStore } from "@/lib/store";

interface Edit {
  sectionId: string;
  entryId: string;
  bulletIndex: number;
  original: string;
  compressed: string;
  action: "shorten" | "drop";
  reason: string;
}

/**
 * "Make it fit" diff dialog: shows verified LLM edits (shorten/drop) with the
 * original text, the proposed change and the reason. Nothing is applied until
 * the user clicks Apply — never silent deletion.
 */
export function CompressDialog() {
  const open = useBuilderStore((s) => s.compressOpen);
  const setOpen = useBuilderStore((s) => s.setCompressOpen);
  const doc = useBuilderStore((s) => s.doc);
  const fit = useBuilderStore((s) => s.fit);
  const updateEntry = useBuilderStore((s) => s.updateEntry);

  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "empty">(
    "loading",
  );
  const [edits, setEdits] = useState<Edit[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;

    void Promise.resolve().then(async () => {
      if (!alive) return;
      setPhase("loading");
      setEdits([]);
      setAccepted(new Set());
      try {
        const res = await fetch("/api/compress-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc,
            fit: {
              overflowPx: fit?.overflowPx ?? 200,
              bodyPt: fit ? doc.theme.sizes.body * fit.config.sizeScale : 8.5,
            },
          }),
        });
        const json = (await res.json()) as { edits?: Edit[]; error?: string };
        if (!res.ok || !json.edits) {
          throw new Error(json.error ?? `Failed (${res.status})`);
        }
        if (!alive) return;
        setEdits(json.edits);
        setAccepted(new Set(json.edits.map((_, i) => i)));
        setPhase(json.edits.length === 0 ? "empty" : "ready");
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [open, doc, fit]);

  const toggle = (i: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const apply = () => {
    const chosen = edits.filter((_, i) => accepted.has(i));
    // Read the live doc (not a stale render snapshot) and apply all chosen
    // edits per entry in one pass. Keying by original text (rather than index)
    // is safe against bullet shifts, and batching per entry stops later edits
    // from overwriting earlier ones on the same entry.
    const current = useBuilderStore.getState().doc;
    const perEntry = new Map<
      string,
      { sectionId: string; entryId: string; bullets: string[] }
    >();
    for (const edit of chosen) {
      const section = current.sections.find((s) => s.id === edit.sectionId);
      const entry = section?.entries.find((e) => e.id === edit.entryId);
      if (!entry) continue;
      let acc = perEntry.get(edit.entryId);
      if (!acc) {
        acc = {
          sectionId: edit.sectionId,
          entryId: edit.entryId,
          bullets: [...entry.bullets],
        };
        perEntry.set(edit.entryId, acc);
      }
      if (edit.action === "drop") {
        acc.bullets = acc.bullets.filter(
          (b) => b.trim() !== edit.original.trim(),
        );
      } else {
        const idx = acc.bullets.findIndex(
          (b) => b.trim() === edit.original.trim(),
        );
        if (idx !== -1) acc.bullets[idx] = edit.compressed;
      }
    }
    for (const acc of perEntry.values()) {
      updateEntry(acc.sectionId, acc.entryId, { bullets: acc.bullets });
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Make it fit — AI compression
            </h2>
            <p className="text-xs text-zinc-500">
              {phase === "ready"
                ? `${accepted.size} of ${edits.length} changes selected — review and apply`
                : "Shortens wordy bullets and flags weak ones. You approve every change."}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-400 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === "loading" && (
            <div className="flex items-center gap-3 py-10 text-sm text-zinc-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
              Analyzing resume…
            </div>
          )}
          {phase === "error" && (
            <div className="space-y-3 py-8">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white"
              >
                Close
              </button>
            </div>
          )}
          {phase === "empty" && (
            <div className="space-y-3 py-8 text-sm text-zinc-600">
              <p>No safe compressions found — the resume is already tight.</p>
              <p className="text-xs text-zinc-400">
                Consider removing an entry or shortening it manually in the editor.
              </p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white"
              >
                Close
              </button>
            </div>
          )}
          {phase === "ready" && (
            <ul className="space-y-3">
              {edits.map((edit, i) => {
                const on = accepted.has(i);
                return (
                  <li
                    key={i}
                    className={`rounded-lg border p-3 ${on ? "border-sky-200 bg-sky-50/50" : "border-zinc-200 bg-white opacity-60"}`}
                  >
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-sky-700"
                        checked={on}
                        onChange={() => toggle(i)}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${edit.action === "drop" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                        >
                          {edit.action === "drop" ? "Remove" : "Shorten"}
                        </span>
                        <p className="text-sm text-zinc-400 line-through decoration-zinc-300">
                          {edit.original}
                        </p>
                        {edit.action === "shorten" && (
                          <p className="text-sm font-medium text-zinc-900">
                            {edit.compressed}
                          </p>
                        )}
                        <p className="text-xs italic text-zinc-500">
                          {edit.reason}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {phase === "ready" && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3">
            <span className="text-xs text-zinc-500">
              Applying re-runs auto-fit immediately.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={accepted.size === 0}
                className="rounded-md bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-40"
              >
                Apply {accepted.size} change{accepted.size === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
