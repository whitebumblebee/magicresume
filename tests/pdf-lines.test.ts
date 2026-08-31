import { describe, expect, it } from "vitest";
import { groupItemsIntoLines, type PdfItem } from "@/lib/import/pdf-lines";

function item(
  str: string,
  x: number,
  y: number,
  size = 10,
  font = "Helvetica",
  width?: number,
): PdfItem {
  return {
    str,
    x,
    y,
    size,
    fontName: font,
    width: width ?? str.length * size * 0.5,
  };
}

describe("groupItemsIntoLines", () => {
  it("groups items on the same baseline into one line", () => {
    const lines = groupItemsIntoLines([
      item("Senior", 40, 700, 10.5, "Helvetica-Bold"),
      item("Engineer", 90, 700, 10.5, "Helvetica-Bold"),
      item("Acme", 40, 685),
      item("2020", 500, 700),
    ]);
    expect(lines).toHaveLength(2);
    // top line first (y desc)
    expect(lines[0].text).toBe("Senior Engineer 2020");
    expect(lines[0].bold).toBe(true);
    expect(lines[1].text).toBe("Acme");
    expect(lines[1].bold).toBe(false);
  });

  it("inserts spaces based on horizontal gaps", () => {
    const lines = groupItemsIntoLines([
      item("Hello", 40, 700, 10, "Helvetica", 30),
      item("World", 200, 700, 10, "Helvetica", 30), // big gap → space
      item("!", 231, 700, 10, "Helvetica", 5), // tiny gap → no space
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello World!");
  });

  it("splits lines when baselines differ beyond tolerance", () => {
    const lines = groupItemsIntoLines([
      item("line one", 40, 700),
      item("line two", 40, 682), // 18pt apart at 10pt font → separate lines
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("line one");
    expect(lines[1].text).toBe("line two");
  });

  it("uses the dominant font size for the line", () => {
    const lines = groupItemsIntoLines([
      item("Name", 40, 700, 22, "Helvetica-Bold"),
      item("PhD", 140, 701, 8), // superscript-ish, same line
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].size).toBe(22);
  });

  it("detects bold from the majority of items", () => {
    const lines = groupItemsIntoLines([
      item("Bold", 40, 700, 10, "Arial-BoldMT"),
      item("Bold2", 70, 700, 10, "Arial-BoldMT"),
      item("regular", 110, 700, 10, "Arial"),
    ]);
    expect(lines[0].bold).toBe(true);
  });

  it("ignores whitespace-only items and empty input", () => {
    expect(groupItemsIntoLines([])).toHaveLength(0);
    expect(
      groupItemsIntoLines([item("  ", 40, 700)]),
    ).toHaveLength(0);
  });

  it("strips leading bullet glyphs from extracted line text", () => {
    const lines = groupItemsIntoLines([
      item("•", 40, 700, 10, "Helvetica", 4),
      item("Built a thing", 48, 700),
      item("▪", 40, 685, 10, "Helvetica", 4),
      item("Another thing", 48, 685),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Built a thing");
    expect(lines[1].text).toBe("Another thing");
  });
});
