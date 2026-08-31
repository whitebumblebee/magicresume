import type { ResumeDoc } from "@/lib/resume/schema";
import { walkEngagements } from "@/lib/resume/engagements";
import { markdownToPlainText } from "@/lib/resume/markdown";

/**
 * Deterministic ATS checks — pure, no LLM, no DOM. Weighted to 100; checks
 * that depend on client-side fit info are skipped (and renormalized) when
 * that info is absent.
 */

export interface AtsCheck {
  id: string;
  label: string;
  earned: number;
  max: number;
  detail: string;
  /** editor accordion element id for deep-linking */
  fixTarget?: string;
}

export interface DeterministicAts {
  score: number; // 0–100, renormalized over applicable checks
  checks: AtsCheck[];
}

export interface FitInfo {
  status: "fit" | "overflow";
  bodyPt?: number;
}

const ACTION_VERBS = new Set(
  [
    "achieved",
    "accelerated",
    "analyzed",
    "architected",
    "authored",
    "automated",
    "awarded",
    "built",
    "centralized",
    "coordinated",
    "created",
    "cut",
    "debugged",
    "decreased",
    "delivered",
    "deployed",
    "designed",
    "developed",
    "directed",
    "drove",
    "engineered",
    "enhanced",
    "established",
    "executed",
    "expanded",
    "founded",
    "grew",
    "implemented",
    "improved",
    "increased",
    "initiated",
    "integrated",
    "launched",
    "led",
    "maintained",
    "managed",
    "mentored",
    "migrated",
    "modernized",
    "negotiated",
    "optimized",
    "owned",
    "partnered",
    "presented",
    "provisioned",
    "published",
    "rebuilt",
    "reduced",
    "refactored",
    "researched",
    "resolved",
    "reviewed",
    "saved",
    "scaled",
    "secured",
    "spearheaded",
    "standardized",
    "streamlined",
    "supported",
    "tested",
    "trained",
    "transformed",
    "wrote",
    "work",
    "worked",
    "contributed",
    "collaborated",
    "volunteered",
  ].map((v) => v),
);

function bulletsOf(doc: ResumeDoc): string[] {
  const values: string[] = [];
  for (const section of doc.sections) {
    for (const entry of section.entries) {
      values.push(...entry.bullets.map(markdownToPlainText));
      walkEngagements(entry.engagements, ({ engagement }) => {
        values.push(...engagement.bullets.map(markdownToPlainText));
      });
    }
  }
  return values.filter((value) => value.trim());
}

function experienceDateRanges(doc: ResumeDoc): string[] {
  const ranges: string[] = [];
  for (const section of doc.sections.filter(
    (candidate) => candidate.type === "experience",
  )) {
    for (const entry of section.entries) {
      // Root experience entries retain the legacy completeness requirement.
      ranges.push(entry.dateRange);
      walkEngagements(entry.engagements, ({ engagement }) => {
        // Undated nested work inherits its surrounding period and should not
        // enlarge the denominator; explicit nested dates remain checkable.
        if (engagement.dateRange.trim()) ranges.push(engagement.dateRange);
      });
    }
  }
  return ranges;
}

function startsWithVerb(text: string): boolean {
  const plain = markdownToPlainText(text).trim().toLowerCase();
  const first = plain.split(/[\s,]+/)[0]?.replace(/[^a-z]/g, "") ?? "";
  return ACTION_VERBS.has(first);
}

function isQuantified(text: string): boolean {
  const withoutYears = markdownToPlainText(text).replace(
    /\b(19|20)\d{2}\b/g,
    "",
  );
  return /\d|%|\$|₹|€|£/.test(withoutYears);
}

export function runDeterministicChecks(
  doc: ResumeDoc,
  fit?: FitInfo,
): DeterministicAts {
  const checks: AtsCheck[] = [];
  const bullets = bulletsOf(doc);
  const exp = doc.sections.find((s) => s.type === "experience");
  const expEntries = exp?.entries ?? [];

  // ---- Contact ----
  checks.push({
    id: "name",
    label: "Name present",
    earned: doc.contact.name.trim() ? 6 : 0,
    max: 6,
    detail: doc.contact.name.trim()
      ? "Found"
      : "Missing — ATS can't index the candidate",
    fixTarget: "ed-contact",
  });
  const emailOk = /.+@.+\..+/.test(doc.contact.email);
  checks.push({
    id: "email",
    label: "Email present",
    earned: emailOk ? 8 : 0,
    max: 8,
    detail: emailOk
      ? doc.contact.email
      : "Missing — recruiters can't reach you",
    fixTarget: "ed-contact",
  });
  const phoneOk = /(\+?\d[\d\s\-()]{6,})/.test(doc.contact.phone);
  checks.push({
    id: "phone",
    label: "Phone present",
    earned: phoneOk ? 5 : 0,
    max: 5,
    detail: phoneOk ? doc.contact.phone : "Missing",
    fixTarget: "ed-contact",
  });
  const linkCount = doc.contact.links.filter((l) => l.url.trim()).length;
  checks.push({
    id: "links",
    label: "Professional links",
    earned: linkCount >= 1 ? 5 : 0,
    max: 5,
    detail:
      linkCount >= 1
        ? `${linkCount} link(s)`
        : "Add LinkedIn/GitHub/portfolio — free credibility",
    fixTarget: "ed-contact",
  });
  checks.push({
    id: "summary",
    label: "Summary section",
    earned: doc.summary.trim() ? 4 : 0,
    max: 4,
    detail: doc.summary.trim()
      ? "Present"
      : "Optional but boosts keyword surface",
    fixTarget: "ed-summary",
  });

  // ---- Structure ----
  checks.push({
    id: "experience",
    label: "Experience with entries",
    earned: expEntries.length >= 1 ? 10 : 0,
    max: 10,
    detail: expEntries.length
      ? `${expEntries.length} entries`
      : "No experience entries",
    fixTarget: "ed-sections",
  });
  const hasEdu = doc.sections.some((s) => s.type === "education");
  checks.push({
    id: "education",
    label: "Education section",
    earned: hasEdu ? 5 : 0,
    max: 5,
    detail: hasEdu ? "Present" : "Missing",
    fixTarget: "ed-sections",
  });
  const hasSkills = doc.sections.some((s) => s.type === "skills");
  checks.push({
    id: "skills",
    label: "Skills section",
    earned: hasSkills ? 5 : 0,
    max: 5,
    detail: hasSkills ? "Present" : "Missing — primary ATS keyword surface",
    fixTarget: "ed-sections",
  });

  // ---- Dates ----
  const dateRanges = experienceDateRanges(doc);
  const dated = dateRanges.filter((dateRange) =>
    /(19|20)\d{2}|present|current/i.test(dateRange),
  ).length;
  const dateRatio = dateRanges.length ? dated / dateRanges.length : 0;
  checks.push({
    id: "dates",
    label: "Parseable employment dates",
    earned: Math.round(12 * dateRatio),
    max: 12,
    detail: dateRanges.length
      ? `${dated}/${dateRanges.length} entries have year-based dates`
      : "No entries to check",
    fixTarget: "ed-sections",
  });

  // ---- Bullets ----
  const verbRatio = bullets.length
    ? bullets.filter(startsWithVerb).length / bullets.length
    : 0;
  checks.push({
    id: "verbs",
    label: "Action-verb bullets",
    earned: Math.round(10 * verbRatio),
    max: 10,
    detail: bullets.length
      ? `${Math.round(verbRatio * 100)}% start with action verbs`
      : "No bullets",
    fixTarget: "ed-sections",
  });
  const quantRatio = bullets.length
    ? bullets.filter(isQuantified).length / bullets.length
    : 0;
  checks.push({
    id: "quantified",
    label: "Quantified achievements",
    earned: Math.round(10 * quantRatio),
    max: 10,
    detail: bullets.length
      ? `${Math.round(quantRatio * 100)}% contain numbers/metrics`
      : "No bullets",
    fixTarget: "ed-sections",
  });
  const avgWords = bullets.length
    ? bullets.reduce(
        (acc, bullet) => acc + markdownToPlainText(bullet).split(/\s+/).length,
        0,
      ) / bullets.length
    : 0;
  checks.push({
    id: "length",
    label: "Bullet length sanity",
    earned: avgWords > 0 && avgWords <= 28 ? 5 : avgWords > 0 ? 2 : 0,
    max: 5,
    detail: bullets.length
      ? `avg ${Math.round(avgWords)} words/bullet (target ≤ 28)`
      : "No bullets",
    fixTarget: "ed-sections",
  });

  // ---- Layout (only when fit info provided) ----
  if (fit) {
    checks.push({
      id: "onepage",
      label: "Fits one page",
      earned: fit.status === "fit" ? 9 : 0,
      max: 9,
      detail:
        fit.status === "fit"
          ? "One page — recruiters read it fully"
          : "Overflows one page at readable sizes",
      fixTarget: "ed-design",
    });
    const bodyPt = fit.bodyPt ?? 10;
    checks.push({
      id: "fontsize",
      label: "Readable font size",
      earned: bodyPt >= 9.5 ? 6 : bodyPt >= 9 ? 4 : 2,
      max: 6,
      detail: `${bodyPt.toFixed(2)}pt body (9.5pt+ recommended)`,
      fixTarget: "ed-design",
    });
  }

  const earned = checks.reduce((a, c) => a + c.earned, 0);
  const max = checks.reduce((a, c) => a + c.max, 0);
  return {
    score: max ? Math.round((earned / max) * 100) : 0,
    checks,
  };
}
