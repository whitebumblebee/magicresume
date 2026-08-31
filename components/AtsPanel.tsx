"use client";

import { useEffect, useState } from "react";
import { useBuilderStore } from "@/lib/store";
import { effectiveConfig } from "@/lib/fit/engine";

interface AtsCheck {
  id: string;
  label: string;
  earned: number;
  max: number;
  detail: string;
  fixTarget?: string;
}

interface AtsReport {
  combined: number;
  deterministic: { score: number; checks: AtsCheck[] };
  ai: {
    score: number;
    impact: { score: number; note: string };
    clarity: { score: number; note: string };
    keywords: { score: number; note: string };
    strengths: string[];
    fixes: {
      target: string;
      issue: string;
      suggestion: string;
    }[];
  } | null;
  aiAvailable: boolean;
  methodology: {
    formula: string;
    appliedFormula: string;
    deterministicWeight: number;
    geminiWeight: number;
    applicableChecks: number;
    disclaimer: string;
  };
  jdEvidence: {
    status: "not_provided" | "evaluated" | "unavailable";
    matchedTerms: Array<{
      term: string;
      evidence: string;
      sectionTitle: string;
    }>;
    missingTerms: string[];
  };
}

function jumpTo(target: string) {
  const el = document.getElementById(target);
  if (el) {
    el.setAttribute("open", "");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

/** ATS score modal — deterministic checks + AI rubric (with optional JD). */
export function AtsPanel() {
  const open = useBuilderStore((s) => s.atsOpen);
  const setOpen = useBuilderStore((s) => s.setAtsOpen);
  const doc = useBuilderStore((s) => s.doc);
  const autoFitOn = useBuilderStore((s) => s.autoFit);
  const manual = useBuilderStore((s) => s.manual);
  const fit = useBuilderStore((s) => s.fit);

  const [jd, setJd] = useState("");
  const [report, setReport] = useState<AtsReport | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;

    void Promise.resolve().then(async () => {
      if (!alive) return;
      setPhase("loading");
      try {
        const config = effectiveConfig(doc, autoFitOn, manual, fit);
        const res = await fetch("/api/ats-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc,
            fit: fit
              ? {
                  status: fit.status,
                  bodyPt: doc.theme.sizes.body * config.sizeScale,
                }
              : undefined,
            jd: jd.trim() || undefined,
          }),
        });
        const json = (await res.json()) as AtsReport & { error?: string };
        if (!res.ok || typeof json.combined !== "number") {
          throw new Error(json.error ?? `Scoring failed (${res.status})`);
        }
        if (!alive) return;
        setReport(json);
        setPhase("ready");
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [open, jd, doc, autoFitOn, manual, fit]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-base font-semibold text-zinc-900">
            ATS & recruiter readiness
          </h2>
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
              Scoring resume…
            </div>
          )}
          {phase === "error" && (
            <div className="py-8 text-sm text-red-600">{error}</div>
          )}
          {phase === "ready" && report && (
            <div className="space-y-5">
              <div className="flex items-center gap-5">
                <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-8 border-zinc-100">
                  <span
                    className={`text-3xl font-bold tabular-nums ${scoreColor(report.combined)}`}
                  >
                    {report.combined}
                  </span>
                  <span className="text-[10px] text-zinc-400">/ 100</span>
                </div>
                <p className="text-sm text-zinc-600">
                  {report.combined >= 80
                    ? "Strong heuristic result — review the evidence and checks below."
                    : report.combined >= 60
                      ? "Promising heuristic result — the fixes below show where to improve."
                      : "Several readiness checks need attention; start with the highest-impact fixes below."}
                  {!report.aiAvailable && (
                    <span className="mt-1 block text-xs text-amber-600">
                      Structure checks only — no AI provider configured on the
                      server.
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  How this score is calculated
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-zinc-800">
                      Deterministic · {report.methodology.deterministicWeight}%
                    </div>
                    <div className="mt-0.5 text-zinc-500">
                      {report.deterministic.score}/100 across {report.methodology.applicableChecks} applicable formatting and readability checks
                    </div>
                  </div>
                  <div className="rounded bg-white p-2">
                    <div className="font-semibold text-zinc-800">
                      Gemini · {report.methodology.geminiWeight}%
                    </div>
                    <div className="mt-0.5 text-zinc-500">
                      {report.ai
                        ? `${report.ai.score}/100 across impact, clarity, and keywords`
                        : "Unavailable; the displayed result uses deterministic checks only"}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Applied formula: {report.methodology.appliedFormula}. {report.methodology.disclaimer}
                </p>
              </div>

              {report.ai && (
                <div className="space-y-2">
                  {(
                    [
                      ["Impact", report.ai.impact],
                      ["Clarity", report.ai.clarity],
                      ["Keywords", report.ai.keywords],
                    ] as const
                  ).map(([label, r]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-600">{label}</span>
                        <span className="tabular-nums text-zinc-500">
                          {r.score}/100
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-zinc-100">
                        <div
                          className={`h-full rounded ${barColor(r.score)}`}
                          style={{ width: `${r.score}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{r.note}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Structure checks
                </h3>
                <ul className="space-y-1">
                  {report.deterministic.checks.map((c) => (
                    <li
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-50"
                      onClick={() => c.fixTarget && jumpTo(c.fixTarget)}
                      title={c.fixTarget ? "Click to jump to the editor" : undefined}
                    >
                      <span
                        className={
                          c.earned === c.max
                            ? "text-emerald-500"
                            : c.earned === 0
                              ? "text-red-500"
                              : "text-amber-500"
                        }
                      >
                        {c.earned === c.max ? "✓" : c.earned === 0 ? "✕" : "!"}
                      </span>
                      <span className="flex-1 text-zinc-700">{c.label}</span>
                      <span className="text-xs text-zinc-400">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {report.ai && report.ai.strengths.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Strengths
                  </h3>
                  <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600">
                    {report.ai.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.ai && report.ai.fixes.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Fixes (click to jump)
                  </h3>
                  <ul className="space-y-2">
                    {report.ai.fixes.map((f, i) => (
                      <li
                        key={i}
                        className="cursor-pointer rounded-lg border border-zinc-200 p-2.5 hover:border-sky-300 hover:bg-sky-50/40"
                        onClick={() =>
                          jumpTo(
                            f.target === "contact"
                              ? "ed-contact"
                              : f.target === "summary"
                                ? "ed-summary"
                                : f.target === "design"
                                  ? "ed-design"
                                  : "ed-sections",
                          )
                        }                      >
                        <div className="text-sm font-medium text-zinc-800">
                          {f.issue}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {f.suggestion}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.jdEvidence.status !== "not_provided" && (
                <div className="rounded-lg border border-zinc-200 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    JD-aware evidence
                  </h3>
                  {report.jdEvidence.status === "unavailable" ? (
                    <p className="mt-2 text-xs text-amber-700">
                      A JD was supplied, but semantic evidence could not be evaluated because Gemini was unavailable.
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-emerald-700">
                          Supported matches
                        </div>
                        {report.jdEvidence.matchedTerms.length === 0 ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            No directly supported matches were returned.
                          </p>
                        ) : (
                          <ul className="mt-1 space-y-2">
                            {report.jdEvidence.matchedTerms.map((match) => (
                              <li key={`${match.term}-${match.sectionTitle}`} className="text-xs">
                                <div className="font-medium text-zinc-800">{match.term}</div>
                                <div className="text-zinc-500">
                                  {match.sectionTitle}: “{match.evidence}”
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-amber-700">
                          Missing or unverified
                        </div>
                        {report.jdEvidence.missingTerms.length === 0 ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            No important missing terms were returned.
                          </p>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {report.jdEvidence.missingTerms.map((term) => (
                              <span key={term} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                                {term}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">
                  Target job description (optional — paste text for keyword
                  matching)
                </label>
                <textarea
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  rows={3}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the JD here to re-score keywords against it…"
                />
                <p className="mt-1 text-[11px] text-zinc-400">
                  Editing this re-runs the score automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
