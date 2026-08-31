import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultFitConfig } from "@/lib/fit/types";
import {
  linkifyText,
  safeEmailHref,
  safeHref,
  safePhoneHref,
  safeTextHref,
} from "@/lib/render/link-utils";
import { ResumePage } from "@/lib/render/ResumePage";
import { RichText } from "@/lib/render/text";
import { emptyResumeDoc } from "@/lib/resume/defaults";

describe("safe resume links", () => {
  it("normalizes supported links and rejects unsafe or ambiguous values", () => {
    expect(safeHref("linkedin.com/in/ada")).toBe(
      "https://linkedin.com/in/ada",
    );
    expect(safeEmailHref("ada@example.test")).toBe(
      "mailto:ada@example.test",
    );
    expect(safePhoneHref("+1 (555) 010-0200")).toBe("tel:+15550100200");
    expect(safeTextHref("ada@example.test")).toBe(
      "mailto:ada@example.test",
    );
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hello")).toBeNull();
    expect(safeTextHref("4 Years")).toBeNull();
  });

  it("auto-links URLs and email without mistaking technology names for domains", () => {
    const segments = linkifyText(
      "Node.js and B.Tech/Bs work: https://example.test/profile, ada@example.test.",
    );
    expect(segments.filter((segment) => segment.href)).toEqual([
      {
        text: "https://example.test/profile",
        href: "https://example.test/profile",
      },
      { text: "ada@example.test", href: "mailto:ada@example.test" },
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "Node.js and B.Tech/Bs work: https://example.test/profile, ada@example.test.",
    );
  });

  it("keeps bold markers while rendering links as real anchors", () => {
    const html = renderToStaticMarkup(
      <RichText text="**Portfolio:** example.test/work" />,
    );
    expect(html).toContain("<strong>Portfolio:</strong>");
    expect(html).toContain('href="https://example.test/work"');
  });

  it("renders contact and inline links through the shared preview/print page", () => {
    const doc = emptyResumeDoc();
    doc.contact.name = "Ada Lovelace";
    doc.contact.email = "ada@example.test";
    doc.contact.phone = "+1 (555) 010-0200";
    doc.contact.links = [
      {
        id: "portfolio",
        label: "Portfolio",
        url: "example.test/portfolio",
      },
      {
        id: "unsafe",
        label: "Unsafe",
        url: "javascript:alert(1)",
      },
    ];
    doc.summary =
      "See https://example.test/profile or email ada@example.test.";
    doc.summaryTitle = "About — example.test/about";
    doc.sections = [
      {
        id: "projects",
        type: "projects",
        title: "Projects — example.test/links",
        entries: [
          {
            id: "project",
            heading: "example.test/project",
            subheading: "",
            dateRange: "",
            location: "",
            bullets: ["Source: https://github.com/example/project."],
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <ResumePage doc={doc} config={defaultFitConfig(doc.theme)} />,
    );

    for (const href of [
      "tel:+15550100200",
      "mailto:ada@example.test",
      "https://example.test/portfolio",
      "https://example.test/profile",
      "https://example.test/about",
      "https://example.test/links",
      "https://example.test/project",
      "https://github.com/example/project",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("Unsafe");
  });
});
