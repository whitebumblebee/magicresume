"use client";

import { useEffect, useRef, useState } from "react";
import { useBuilderStore } from "@/lib/store";
import { ResumePage } from "@/lib/render/ResumePage";
import { resolvePage } from "@/lib/render/resolve";
import { effectiveConfig } from "@/lib/fit/engine";

export function PreviewPane() {
  const doc = useBuilderStore((s) => s.doc);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const fit = useBuilderStore((s) => s.fit);
  const setCompressOpen = useBuilderStore((s) => s.setCompressOpen);
  const artifactKind = useBuilderStore((s) => s.artifactKind);
  const targetWatermark = useBuilderStore((s) => s.targetWatermark);

  const config = effectiveConfig(doc, autoFitOn, manual, fit);
  const page = resolvePage(doc, config);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const [realHeight, setRealHeight] = useState(page.pageH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - 64;
      setScale(Math.max(0.25, Math.min(1.25, available / page.pageW)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.pageW]);

  // Measure the *real* rendered height (content never gets cut). The scaled
  // frame then reserves exactly that much space — no dead gap below the page —
  // and page-break lines land on the true page boundaries.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const update = () => setRealHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, config]);

  const pageCount = Math.max(1, Math.ceil((realHeight - 2) / page.pageH));

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-zinc-200/70 py-8"
    >
      <div
        className="relative mx-auto"
        style={{ width: page.pageW * scale, height: realHeight * scale }}
      >
        <div
          ref={pageRef}
          className="absolute left-0 top-0 shadow-xl ring-1 ring-zinc-300"
          style={{
            width: page.pageW,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <ResumePage doc={doc} config={config} />
          {artifactKind === "target" && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
              <div className="rotate-[-30deg] border-y-4 border-amber-500/30 bg-amber-50/75 px-24 py-5 text-center font-sans text-3xl font-black tracking-[0.18em] text-amber-700/45">
                {targetWatermark || "ASPIRATIONAL — NOT FOR APPLICATION"}
              </div>
            </div>
          )}
          {Array.from({ length: pageCount - 1 }, (_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: (i + 1) * page.pageH }}
            >
              <div
                className="relative"
                style={{ borderTop: "2px dashed rgba(220,38,38,0.6)" }}
              >
                <span
                  className="absolute font-sans"
                  style={{
                    right: 8,
                    top: -20,
                    fontSize: 11,
                    color: "rgb(185,28,28)",
                    background: "white",
                    padding: "0 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(220,38,38,0.3)",
                  }}
                >
                  Page {i + 2} starts here
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {fit && fit.status === "overflow" && (
        <div className="mx-auto mt-4 max-w-md rounded-md bg-amber-50 px-4 py-3 text-center text-xs text-amber-800">
          Content needs ~{fit.estimatedPages} pages even at the smallest readable
          settings — see the dashed line where page 2 begins.
          <button
            type="button"
            onClick={() => setCompressOpen(true)}
            className="mx-auto mt-2 flex items-center gap-1 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            ✨ Make it fit with AI
          </button>
        </div>
      )}
    </div>
  );
}
