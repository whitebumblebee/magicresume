import type {
  EngagementKind,
  ResumeDoc,
  SectionType,
} from "@/lib/resume/schema";
import {
  ENGAGEMENT_KIND_LABELS,
  engagementOrganizationDisplay,
  entryOrganizationDisplay,
  walkEngagements,
} from "@/lib/resume/engagements";
import { markdownToPlainText } from "@/lib/resume/markdown";
import type { CareerFact, CareerFactDraft } from "./schema";
import {
  documentEvidenceFingerprint,
  evidenceEntryFingerprint,
  evidenceFingerprint,
} from "./evidence";

const METRIC_RE =
  /(?:[$£€₹]\s?\d[\d,.]*|\b\d+(?:\.\d+)?\s?(?:%|x|k|m|million|billion|users?|requests?|ms|seconds?|hours?|days?)(?=\s|[.,;:)]|$))/gi;
const METRIC_TEST_RE =
  /(?:[$£€₹]\s?\d[\d,.]*|\b\d+(?:\.\d+)?\s?(?:%|x|k|m|million|billion|users?|requests?|ms|seconds?|hours?|days?)(?=\s|[.,;:)]|$))/i;
const OUTCOME_RE =
  /\b(improved|increased|reduced|saved|grew|delivered|launched|optimized|prevented|enabled|accelerated|cut)\b/i;
const OWNERSHIP_RE =
  /\b(led|owned|designed|architected|built|implemented|created|managed|drove)\b/i;

function occurrenceKey(base: string, occurrences: Map<string, number>): string {
  const occurrence = occurrences.get(base) ?? 0;
  occurrences.set(base, occurrence + 1);
  return occurrence === 0 ? base : `${base}:${occurrence}`;
}

export function resumeToFactDrafts(
  doc: ResumeDoc,
  sourceRef = "resume-import",
  options: {
    sourceType?: CareerFactDraft["sources"][number]["type"];
    keyedEntries?: boolean;
  } = {},
): CareerFactDraft[] {
  const facts: CareerFactDraft[] = [];
  const sourceKeyOccurrences = new Map<string, number>();
  const rootContextOccurrences = new Map<string, number>();
  const engagementKeyOccurrences = new Map<string, number>();
  const engagementSourceKeys = new Map<object, string>();

  doc.sections.forEach((section, sectionIndex) => {
    section.entries.forEach((entry, entryIndex) => {
      const organization = entryOrganizationDisplay(entry);
      const rootContextBase = evidenceEntryFingerprint({
        kind: mapSectionType(section.type),
        title: [
          section.type,
          section.title.trim(),
          entry.kind ?? "",
          entry.heading.trim(),
          entry.location.trim(),
        ].join("\u001f"),
        organization: organization || undefined,
        description: "",
        startDate: entry.dateRange.trim() || undefined,
        endDate: undefined,
      });
      const rootContextKey = occurrenceKey(
        rootContextBase,
        rootContextOccurrences,
      );
      const narrative = markdownToPlainText(entry.narrative ?? "");
      const bullets = entry.bullets.map(markdownToPlainText).filter(Boolean);
      const content = [
        entry.heading,
        organization,
        entry.dateRange,
        entry.location,
        narrative,
        ...bullets,
      ]
        .filter(Boolean)
        .join("\n")
        .trim();

      let rootSourceKey: string | undefined;
      if (content) {
        const metrics = [...new Set(content.match(METRIC_RE) ?? [])];
        const skills =
          section.type === "skills"
            ? extractSkillTokens(bullets.join(", "))
            : [];
        const draftIdentity = {
          kind: mapSectionType(section.type),
          title:
            entry.heading.trim() ||
            organization ||
            section.title.trim() ||
            "Career evidence",
          organization: organization || undefined,
          description:
            [narrative, ...bullets].filter(Boolean).join(" ") ||
            [entry.heading, organization].filter(Boolean).join(" — "),
          startDate: entry.dateRange?.trim() || undefined,
          endDate: undefined,
        } satisfies Pick<
          CareerFactDraft,
          | "kind"
          | "title"
          | "organization"
          | "description"
          | "startDate"
          | "endDate"
        >;
        const sourceKeyBase = evidenceEntryFingerprint(draftIdentity);
        rootSourceKey = occurrenceKey(sourceKeyBase, sourceKeyOccurrences);
        facts.push({
          ...draftIdentity,
          skills,
          metrics,
          state: "inferred",
          qualityScore: scoreCareerEvidence(content),
          evidenceStrength: [
            "source",
            ...(metrics.length > 0 ? (["metric"] as const) : []),
          ],
          sources: [
            {
              type: options.sourceType ?? "resume_pdf",
              excerpt: content,
              reference: sourceRef,
              key: options.keyedEntries ? rootSourceKey : undefined,
              metadata: {
                section: section.title,
                sectionId: section.id,
                entryId: entry.id,
                sectionIndex,
                entryIndex,
                contentKind: "entry",
                nodeId: entry.id,
                groundingPath: `sections.${sectionIndex}.entries.${entryIndex}`,
                active: true,
                evidenceFingerprint: evidenceFingerprint(draftIdentity),
              },
            },
          ],
        });
      }

      walkEngagements(entry.engagements, ({ engagement, path, ancestors }) => {
        const visibleOrganization = engagementOrganizationDisplay(engagement);
        const engagementIdentityKey = evidenceEntryFingerprint({
          kind: mapEngagementKind(engagement.kind),
          title: [
            engagement.kind,
            engagement.name.trim(),
            engagement.role.trim(),
            engagement.location.trim(),
          ].join("\u001f"),
          organization: visibleOrganization || undefined,
          description: "",
          startDate: engagement.dateRange.trim() || undefined,
          endDate: undefined,
        });
        const parentContextKey = ancestors.at(-1)
          ? (engagementSourceKeys.get(ancestors.at(-1)!) ?? rootContextKey)
          : rootContextKey;
        const engagementSourceKey = occurrenceKey(
          `${parentContextKey}/engagement:${engagementIdentityKey}`,
          engagementKeyOccurrences,
        );
        engagementSourceKeys.set(engagement, engagementSourceKey);
        const engagementNarrative = markdownToPlainText(engagement.narrative);
        const engagementBullets = engagement.bullets
          .map(markdownToPlainText)
          .filter(Boolean);
        const engagementContent = [
          engagement.name,
          engagement.role,
          visibleOrganization,
          engagement.dateRange,
          engagement.location,
          engagementNarrative,
          ...engagementBullets,
        ]
          .filter(Boolean)
          .join("\n")
          .trim();
        if (!engagementContent) return;

        const metrics = [...new Set(engagementContent.match(METRIC_RE) ?? [])];
        const draftIdentity = {
          kind: mapEngagementKind(engagement.kind),
          title:
            engagement.name.trim() ||
            engagement.role.trim() ||
            visibleOrganization ||
            ENGAGEMENT_KIND_LABELS[engagement.kind],
          organization: visibleOrganization || organization || undefined,
          description:
            [engagementNarrative, ...engagementBullets]
              .filter(Boolean)
              .join(" ") ||
            [engagement.name, engagement.role, visibleOrganization]
              .filter(Boolean)
              .join(" — "),
          startDate: engagement.dateRange.trim() || undefined,
          endDate: undefined,
        } satisfies Pick<
          CareerFactDraft,
          | "kind"
          | "title"
          | "organization"
          | "description"
          | "startDate"
          | "endDate"
        >;
        const groundingPath = path.reduce(
          (current, index) => `${current}.engagements.${index}`,
          `sections.${sectionIndex}.entries.${entryIndex}`,
        );
        facts.push({
          ...draftIdentity,
          skills: [],
          metrics,
          state: "inferred",
          qualityScore: scoreCareerEvidence(engagementContent),
          evidenceStrength: [
            "source",
            ...(metrics.length > 0 ? (["metric"] as const) : []),
          ],
          sources: [
            {
              type: options.sourceType ?? "resume_pdf",
              excerpt: engagementContent,
              reference: sourceRef,
              key: options.keyedEntries ? engagementSourceKey : undefined,
              metadata: {
                section: section.title,
                sectionId: section.id,
                entryId: entry.id,
                sectionIndex,
                entryIndex,
                contentKind: "engagement",
                nodeId: engagement.id,
                engagementPath: path,
                engagementIds: [
                  ...ancestors.map((ancestor) => ancestor.id),
                  engagement.id,
                ],
                engagementKinds: [
                  ...ancestors.map((ancestor) => ancestor.kind),
                  engagement.kind,
                ],
                parentEngagementId: ancestors.at(-1)?.id,
                groundingPath,
                active: true,
                evidenceFingerprint: evidenceFingerprint(draftIdentity),
              },
            },
          ],
        });
      });
    });
  });

  return facts;
}

export function resumeDocumentFingerprint(doc: ResumeDoc): string {
  return documentEvidenceFingerprint(resumeToFactDrafts(doc));
}

export function scoreCareerEvidence(text: string): number {
  let score = 20;
  if (OWNERSHIP_RE.test(text)) score += 25;
  if (OUTCOME_RE.test(text)) score += 25;
  if (METRIC_TEST_RE.test(text)) score += 20;
  if (text.trim().length >= 80) score += 10;
  return Math.min(100, score);
}

export function nextClarifyingQuestion(
  fact: Pick<CareerFact, "title" | "description" | "metrics" | "qualityScore">,
): string | null {
  if (fact.qualityScore >= 80) return null;
  if (!OWNERSHIP_RE.test(fact.description)) {
    return `For “${fact.title}”, what part did you personally own or decide?`;
  }
  if (!OUTCOME_RE.test(fact.description)) {
    return `What changed for users, the business, or the team because of “${fact.title}”?`;
  }
  if (fact.metrics.length === 0) {
    return `Do you know the scale of “${fact.title}” (users, latency, revenue, volume, time saved, or team size)? A truthful qualitative outcome is fine if no metric exists.`;
  }
  return `What constraint made “${fact.title}” difficult, and how did you handle it?`;
}

function mapSectionType(type: SectionType): CareerFactDraft["kind"] {
  switch (type) {
    case "experience":
    case "education":
      return type;
    case "projects":
      return "project";
    case "skills":
      return "skill";
    case "certifications":
      return "certification";
    case "awards":
      return "award";
    default:
      return "other";
  }
}

function mapEngagementKind(kind: EngagementKind): CareerFactDraft["kind"] {
  switch (kind) {
    case "product":
    case "project":
    case "program":
    case "campaign":
    case "production":
    case "research":
    case "portfolio":
      return "project";
    case "custom":
      return "other";
    default:
      return "experience";
  }
}

function extractSkillTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,|/•·]/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 40),
    ),
  ].slice(0, 30);
}
