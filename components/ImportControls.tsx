"use client";

import { useRef, useState } from "react";
import { useBuilderStore } from "@/lib/store";
import { extractPdf } from "@/lib/import/pdf-extract";
import { resumeDocSchema, type ResumeDoc } from "@/lib/resume/schema";

type Phase = "idle" | "working" | "error" | "done";

/**
 * Toolbar import controls: PDF import (client extraction → server Gemini) and
 * screenshot clone (image → server Gemini). Both land the result in the editor
 * for review — never straight to PDF.
 */
export function ImportControls({
  onImported,
}: {
  onImported?: (doc: ResumeDoc) => void;
}) {
  const loadImported = useBuilderStore((s) => s.loadImported);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setPhase("working");
    setError("");
    setStatus(label);
    try {
      await fn();
      setPhase("done");
      setStatus("");
      setTimeout(() => setPhase("idle"), 1500);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const onPdf = (file: File) =>
    run("Reading PDF…", async () => {
      setStatus("Extracting text and page renders…");
      const extract = await extractPdf(file);
      setStatus("Reconstructing resume with AI…");
      const res = await fetch("/api/import-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageSize: extract.pageSize,
          pageWidthPt: extract.pageWidthPt,
          pageHeightPt: extract.pageHeightPt,
          pageLines: extract.pageLines,
          images: extract.images,
        }),
      });
      await applyImported(res);
    });

  const onImage = (file: File) =>
    run("Reading image…", async () => {
      setStatus("Cloning resume with AI…");
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/clone-screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      await applyImported(res);
    });

  const applyImported = async (res: Response) => {
    const json = (await res.json()) as {
      doc?: unknown;
      templateId?: string | null;
      error?: string;
    };
    if (!res.ok || !json.doc) {
      throw new Error(json.error ?? `Import failed (${res.status})`);
    }
    const doc = resumeDocSchema.parse(json.doc);
    loadImported(doc);
    if (json.templateId) {
      window.dispatchEvent(new Event("mr:templates-changed"));
    }
    onImported?.(doc);
  };

  return (
    <>
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPdf(file);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImage(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => pdfInputRef.current?.click()}
        disabled={phase === "working"}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Import PDF
      </button>
      <button
        onClick={() => imageInputRef.current?.click()}
        disabled={phase === "working"}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Clone screenshot
      </button>

      {phase === "working" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40">
          <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
            <span className="text-sm text-zinc-700">{status || "Working…"}</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="max-w-sm rounded-lg bg-white px-5 py-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold text-red-600">
              Import failed
            </div>
            <div className="mb-3 text-sm text-zinc-600">{error}</div>
            <button
              onClick={() => setPhase("idle")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-900"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg">
          Imported — review everything below, then Download PDF.
        </div>
      )}
    </>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
