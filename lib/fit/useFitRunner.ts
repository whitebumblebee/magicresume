"use client";

import { useEffect } from "react";
import { useBuilderStore } from "@/lib/store";
import { autoFit, evaluateConfig } from "./engine";
import { defaultFitConfig } from "./types";
import { ensureFontsLoaded, getMeasurer } from "./measure";

/**
 * Runs the fit engine (debounced) whenever the doc or fit mode changes, and
 * stores the result. Measurement is font-dependent, so fonts are loaded first.
 */
export function useFitRunner() {
  const doc = useBuilderStore((s) => s.doc);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const setFit = useBuilderStore((s) => s.setFit);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        await ensureFontsLoaded([doc.theme.fonts.heading, doc.theme.fonts.body]);
        const measurer = getMeasurer();
        const result = autoFitOn
          ? autoFit(doc, measurer)
          : evaluateConfig(
              doc,
              manual ?? defaultFitConfig(doc.theme),
              measurer,
            );
        if (alive) setFit(result);
      } catch (err) {
        // Measurement failure should never break the editor — keep last fit.
        console.error("fit engine failed", err);
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [doc, autoFitOn, manual, setFit]);
}
