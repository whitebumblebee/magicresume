import { describe, expect, it } from "vitest";
import { GEMINI_MODEL, VERTEX_LOCATION } from "@/lib/ai/genkit";
import {
  thinkingConfigFor,
  thinkingLevelFor,
  type TaskProfile,
} from "@/lib/ai/profiles";

describe("Gemini task profiles", () => {
  it("uses only the approved GA model at the global endpoint", () => {
    expect(GEMINI_MODEL).toBe("gemini-3.7-flash");
    expect(VERTEX_LOCATION).toBe("global");
  });

  it("uses only thinking levels supported by Gemini 3.7 Flash", () => {
    const profiles: TaskProfile[] = [
      "resume-import",
      "layout-retry",
      "ats-readiness",
      "resume-compression",
      "career-jd",
      "career-gap",
      "career-artifacts",
      "career-partner",
    ];
    for (const profile of profiles) {
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(
        thinkingLevelFor(profile),
      );
      expect(thinkingConfigFor(profile)).toEqual({
        thinkingConfig: { thinkingLevel: thinkingLevelFor(profile) },
      });
    }
    expect(thinkingLevelFor("layout-retry")).toBe("HIGH");
    expect(thinkingLevelFor("career-artifacts")).toBe("HIGH");
  });
});
