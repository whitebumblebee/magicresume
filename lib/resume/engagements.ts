import type {
  ChildEngagement,
  Engagement,
  EngagementKind,
  Entry,
  OrganizationVisibility,
  ResumeDoc,
  Section,
} from "./schema";
import { markdownToPlainText } from "./markdown";

export const DEFAULT_CONFIDENTIAL_LABEL = "Confidential organization";

export const ENGAGEMENT_KIND_LABELS: Record<EngagementKind, string> = {
  employer: "Employer",
  practice: "Practice",
  client: "Client",
  account: "Account",
  product: "Product",
  project: "Project",
  program: "Program",
  assignment: "Assignment",
  contract: "Contract",
  site: "Site",
  facility: "Facility",
  department: "Department",
  campaign: "Campaign",
  production: "Production",
  research: "Research",
  clinical: "Clinical",
  teaching: "Teaching",
  service: "Service",
  volunteer: "Volunteer",
  portfolio: "Portfolio",
  custom: "Custom",
};

export function organizationDisplay(
  organization: string,
  visibility: OrganizationVisibility | undefined,
  confidentialLabel?: string,
): string {
  if (!visibility || visibility === "named") return organization.trim();
  if (visibility === "confidential") {
    return confidentialLabel?.trim() || DEFAULT_CONFIDENTIAL_LABEL;
  }
  return "";
}

export function entryOrganizationDisplay(entry: Entry): string {
  return organizationDisplay(
    entry.subheading,
    entry.organizationVisibility,
    entry.confidentialLabel,
  );
}

export function engagementOrganizationDisplay(
  engagement: Engagement | ChildEngagement,
): string {
  return organizationDisplay(
    engagement.organization,
    engagement.visibility,
    engagement.confidentialLabel,
  );
}

export interface EngagementVisit {
  engagement: Engagement | ChildEngagement;
  path: number[];
  ancestors: (Engagement | ChildEngagement)[];
}

export function walkEngagements(
  engagements: Engagement[] | undefined,
  visit: (value: EngagementVisit) => void,
): void {
  for (const [index, engagement] of (engagements ?? []).entries()) {
    visit({ engagement, path: [index], ancestors: [] });
    for (const [childIndex, child] of (
      engagement.engagements ?? []
    ).entries()) {
      visit({
        engagement: child,
        path: [index, childIndex],
        ancestors: [engagement],
      });
    }
  }
}

export function workNodePlainText(
  node: Entry | Engagement | ChildEngagement,
): string {
  if ("heading" in node) {
    return [
      node.heading,
      entryOrganizationDisplay(node),
      node.dateRange,
      node.location,
      markdownToPlainText(node.narrative ?? ""),
      ...node.bullets.map(markdownToPlainText),
    ]
      .filter((value) => value.trim())
      .join("\n");
  }
  return [
    node.name,
    node.role,
    engagementOrganizationDisplay(node),
    node.dateRange,
    node.location,
    markdownToPlainText(node.narrative),
    ...node.bullets.map(markdownToPlainText),
  ]
    .filter((value) => value.trim())
    .join("\n");
}

export function resumeSectionPlainText(section: Section): string {
  const values: string[] = [];
  for (const entry of section.entries) {
    values.push(workNodePlainText(entry));
    walkEngagements(entry.engagements, ({ engagement }) => {
      values.push(workNodePlainText(engagement));
    });
  }
  return values.filter((value) => value.trim()).join("\n");
}

export interface AtsEngagementNode {
  kind: EngagementKind;
  name: string;
  role: string;
  organization: string;
  dateRange: string;
  location: string;
  narrative: string;
  bullets: string[];
  engagements: AtsEngagementNode[];
}

function engagementAtsNode(
  engagement: Engagement | ChildEngagement,
): AtsEngagementNode {
  const children =
    "engagements" in engagement ? (engagement.engagements ?? []) : [];
  return {
    kind: engagement.kind,
    name: engagement.name,
    role: engagement.role,
    organization: engagementOrganizationDisplay(engagement),
    dateRange: engagement.dateRange,
    location: engagement.location,
    narrative: markdownToPlainText(engagement.narrative),
    bullets: engagement.bullets.map(markdownToPlainText).filter(Boolean),
    engagements: children.map(engagementAtsNode),
  };
}

export function resumeAtsText(doc: ResumeDoc) {
  return {
    contact: doc.contact,
    summary: markdownToPlainText(doc.summary),
    sections: doc.sections.map((section) => ({
      title: section.title,
      type: section.type,
      text: resumeSectionPlainText(section),
      entries: section.entries.map((entry) => ({
        heading: entry.heading,
        organization: entryOrganizationDisplay(entry),
        dateRange: entry.dateRange,
        location: entry.location,
        narrative: markdownToPlainText(entry.narrative ?? ""),
        bullets: entry.bullets.map(markdownToPlainText).filter(Boolean),
        engagements: (entry.engagements ?? []).map(engagementAtsNode),
      })),
    })),
  };
}
