"use client";

import { useBuilderStore } from "@/lib/store";
import { ResumePage } from "@/lib/render/ResumePage";
import { effectiveConfig } from "@/lib/fit/engine";

/**
 * Hidden on screen, exact-size on paper. `window.print()` + `@page` rules in
 * globals.css produce a pixel-perfect PDF with zero server work.
 */
export function PrintRoot() {
  const doc = useBuilderStore((s) => s.doc);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const fit = useBuilderStore((s) => s.fit);
  const artifactKind = useBuilderStore((s) => s.artifactKind);
  const config = effectiveConfig(doc, autoFitOn, manual, fit);

  if (artifactKind === "target") return null;

  return (
    <div className="print-root" aria-hidden>
      <style>{`@page { size: ${doc.page.size === "A4" ? "A4" : "letter"}; margin: 0; }`}</style>
      <ResumePage doc={doc} config={config} />
    </div>
  );
}
