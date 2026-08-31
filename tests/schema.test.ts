import { describe, expect, it } from "vitest";
import { resumeDocSchema } from "@/lib/resume/schema";
import { SAMPLE_RESUME } from "@/lib/resume/sample";
import { emptyResumeDoc } from "@/lib/resume/defaults";
import { parseMarkers, stripMarkers } from "@/lib/render/text-utils";

describe("resumeDocSchema", () => {
  it("validates the sample resume fixture", () => {
    const parsed = resumeDocSchema.safeParse(SAMPLE_RESUME);
    expect(parsed.success).toBe(true);
  });

  it("validates an empty resume", () => {
    const parsed = resumeDocSchema.safeParse(emptyResumeDoc());
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid page size", () => {
    const bad = structuredClone(SAMPLE_RESUME) as Record<string, unknown>;
    (bad.page as Record<string, unknown>).size = "B5";
    expect(resumeDocSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts the header/entry style theme tokens", () => {
    const doc = structuredClone(SAMPLE_RESUME);
    doc.theme.colors.name = "#111111";
    doc.theme.headerAlignment = "center";
    doc.theme.contactStyle = "plain";
    doc.theme.entryStyle = {
      subheadingInline: true,
      subheadingItalic: true,
      dateItalic: true,
    };
    expect(resumeDocSchema.safeParse(doc).success).toBe(true);
  });

  it("still validates docs persisted before the style tokens existed", () => {
    const doc = structuredClone(SAMPLE_RESUME);
    delete doc.theme.headerAlignment;
    delete doc.theme.contactStyle;
    delete doc.theme.entryStyle;
    delete doc.theme.colors.name;
    expect(resumeDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("text markers", () => {
  it("strips ** markers for measurement", () => {
    expect(stripMarkers("**Lead:** did things")).toBe("Lead: did things");
    expect(stripMarkers("no markers")).toBe("no markers");
  });

  it("parses bold segments", () => {
    expect(parseMarkers("a **b** c **d**")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c ", bold: false },
      { text: "d", bold: true },
    ]);
  });
});
