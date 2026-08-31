import { emptyResumeDoc, newId } from "@/lib/resume/defaults";
import { createLayoutPreset } from "@/lib/resume/layout-presets";
import type { ResumeDoc } from "@/lib/resume/schema";

/** Synthetic, PII-free equivalent of a dense main flow plus underfilled
 * supporting sidebar. Shared by deterministic and real-browser fit tests. */
export function underfilledRightSidebarDoc(): ResumeDoc {
  const doc = emptyResumeDoc();
  doc.page.size = "LETTER";
  doc.contact = {
    name: "Demo Candidate",
    email: "candidate@example.test",
    phone: "+1 555 0100",
    location: "",
    links: [{ id: "portfolio", label: "Portfolio", url: "example.test" }],
  };
  doc.theme.contactLayout = "stacked";
  const entry = (
    heading: string,
    bullets: string[],
    subheading = "Example Organization",
  ) => ({
    id: newId(),
    heading,
    subheading,
    dateRange: "2022 - Present",
    location: "",
    bullets,
  });
  const detail =
    "Built and operated a production system across multiple services, improving reliability and reducing repeated manual work for partner teams.";
  doc.sections = [
    {
      id: "experience",
      type: "experience",
      title: "Experience",
      entries: [
        entry("Lead Engineer", Array(7).fill(detail)),
        entry("Senior Engineer", Array(5).fill(detail)),
        entry("Software Engineer", Array(4).fill(detail)),
      ],
    },
    {
      id: "skills",
      type: "skills",
      title: "Skills",
      entries: [entry("", ["TypeScript, React, Node.js, AWS, PostgreSQL"], "")],
    },
    {
      id: "education",
      type: "education",
      title: "Education",
      entries: [entry("Example University", [], "MSc")],
    },
    {
      id: "projects",
      type: "projects",
      title: "Projects",
      entries: [
        entry("Project One", [detail, detail, detail, detail], ""),
        entry("Project Two", [detail, detail, detail, detail], ""),
        entry("Project Three", [detail, detail, detail, detail], ""),
      ],
    },
  ];
  doc.layout = createLayoutPreset(doc, "sidebar-right");
  return doc;
}
