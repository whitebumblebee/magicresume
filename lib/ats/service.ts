import { generateStructured, llmConfigured } from "@/lib/llm/client";
import { llmAtsSchema, type LlmAts } from "@/lib/llm/schemas";
import { atsSystemPrompt, atsUserPrompt } from "@/lib/llm/prompts";
import type { ResumeDoc } from "@/lib/resume/schema";
import { resumeAtsText } from "@/lib/resume/engagements";
import {
  runDeterministicChecks,
  type DeterministicAts,
  type FitInfo,
} from "./checks";

/**
 * ATS scoring: deterministic checks (always) + LLM rubric (when a provider
 * key exists). Combined = 55% deterministic + 45% Gemini.
 */
const DETERMINISTIC_WEIGHT = 0.55;
const GEMINI_WEIGHT = 0.45;
const ATS_DISCLAIMER =
  "This is a heuristic readiness estimate, not a score from an ATS vendor or a guarantee of screening outcomes.";

export interface JdMatchEvidence {
  term: string;
  evidence: string;
  sectionTitle: string;
}

export interface JdEvidenceReport {
  status: "not_provided" | "evaluated" | "unavailable";
  matchedTerms: JdMatchEvidence[];
  missingTerms: string[];
}

export interface AtsReport {
  combined: number;
  deterministic: DeterministicAts;
  ai: LlmAts | null;
  aiAvailable: boolean;
  methodology: {
    formula: string;
    appliedFormula: string;
    deterministicWeight: number;
    geminiWeight: number;
    applicableChecks: number;
    disclaimer: string;
  };
  jdEvidence: JdEvidenceReport;
}

export function clampAtsScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function combineAtsScores(
  deterministicScore: number,
  geminiScore: number | null,
): number {
  if (geminiScore === null) return clampAtsScore(deterministicScore);
  return clampAtsScore(
    deterministicScore * DETERMINISTIC_WEIGHT + geminiScore * GEMINI_WEIGHT,
  );
}

function normalizeEvidenceText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeEvidenceText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groundJdEvidence(
  doc: ResumeDoc,
  raw: LlmAts["jdEvidence"],
  hasJd: boolean,
): JdEvidenceReport {
  if (!hasJd) {
    return { status: "not_provided", matchedTerms: [], missingTerms: [] };
  }
  if (!raw) {
    return { status: "unavailable", matchedTerms: [], missingTerms: [] };
  }

  const visibleResume = resumeAtsText(doc);
  const sectionText = new Map<string, { title: string; text: string }>();
  if (visibleResume.summary.trim()) {
    sectionText.set("summary", {
      title: "Summary",
      text: visibleResume.summary,
    });
  }
  for (const section of visibleResume.sections) {
    sectionText.set(normalizeEvidenceText(section.title), {
      title: section.title,
      text: section.text,
    });
  }

  const missingFromInvalidMatches: string[] = [];
  const matchedTerms: JdMatchEvidence[] = [];
  const seenMatches = new Set<string>();
  for (const match of raw.matchedTerms.slice(0, 20)) {
    const termKey = normalizeEvidenceText(match.term);
    const section = sectionText.get(normalizeEvidenceText(match.sectionTitle));
    const evidence = normalizeEvidenceText(match.evidence);
    if (
      !termKey ||
      !section ||
      !evidence ||
      !normalizeEvidenceText(section.text).includes(evidence)
    ) {
      if (match.term.trim()) missingFromInvalidMatches.push(match.term.trim());
      continue;
    }
    if (seenMatches.has(termKey)) continue;
    seenMatches.add(termKey);
    matchedTerms.push({
      term: match.term.trim(),
      evidence: match.evidence.trim(),
      sectionTitle: section.title,
    });
  }

  return {
    status: "evaluated",
    matchedTerms,
    missingTerms: uniqueTerms([
      ...raw.missingTerms.map((term) => term.trim()),
      ...missingFromInvalidMatches,
    ])
      .filter((term) => !seenMatches.has(normalizeEvidenceText(term)))
      .slice(0, 20),
  };
}

function methodology(
  deterministic: DeterministicAts,
  aiAvailable: boolean,
): AtsReport["methodology"] {
  return {
    formula: "55% deterministic checks + 45% Gemini rubric",
    appliedFormula: aiAvailable
      ? "55% deterministic checks + 45% Gemini rubric"
      : "100% deterministic checks (Gemini unavailable)",
    deterministicWeight: 55,
    geminiWeight: 45,
    applicableChecks: deterministic.checks.length,
    disclaimer: ATS_DISCLAIMER,
  };
}

export async function runAtsScore(
  doc: ResumeDoc,
  fit: FitInfo | undefined,
  jd: string | undefined,
): Promise<AtsReport> {
  const deterministic = runDeterministicChecks(doc, fit);
  const hasJd = Boolean(jd?.trim());

  if (!llmConfigured()) {
    return {
      combined: combineAtsScores(deterministic.score, null),
      deterministic,
      ai: null,
      aiAvailable: false,
      methodology: methodology(deterministic, false),
      jdEvidence: {
        status: hasJd ? "unavailable" : "not_provided",
        matchedTerms: [],
        missingTerms: [],
      },
    };
  }

  const resumePayload = resumeAtsText(doc);

  const parts = [
    {
      text:
        atsUserPrompt({
          hasJd,
          fitStatus: fit?.status,
          bodyPt: fit?.bodyPt,
        }) + JSON.stringify(resumePayload),
    },
  ];
  if (jd?.trim()) {
    parts.push({ text: `JOB DESCRIPTION:\n${jd.trim().slice(0, 12000)}` });
  }

  const ai = await generateStructured({
    system: atsSystemPrompt(),
    parts,
    schema: llmAtsSchema,
    profile: "ats-readiness",
    maxOutputTokens: 8192,
  });

  const componentScore = clampAtsScore(
    (ai.impact.score + ai.clarity.score + ai.keywords.score) / 3,
  );
  const normalizedAi = { ...ai, score: componentScore };
  const combined = combineAtsScores(deterministic.score, componentScore);
  return {
    combined,
    deterministic,
    ai: normalizedAi,
    aiAvailable: true,
    methodology: methodology(deterministic, true),
    jdEvidence: groundJdEvidence(doc, ai.jdEvidence, hasJd),
  };
}
