import { describe, expect, it } from "vitest";
import { firestoreSessionPrefix } from "@/lib/ai/genkit";
import { createAgentContext, requireAgentUserId } from "@/lib/agent/context";
import {
  careerTools,
  reviewCareerFactTool,
} from "@/lib/agent/tools";

describe("career agent contracts", () => {
  it("registers unique, schema-validated scoped tools", () => {
    const names = careerTools.map((tool) => tool.__action.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of careerTools) {
      expect(tool.__action.actionType).toBe("tool");
      expect(tool.__action.inputSchema).toBeDefined();
      expect(tool.__action.outputSchema).toBeDefined();
      expect(tool.__action.description).toBeTruthy();
    }
  });

  it("derives Firestore tenant paths only from trusted action context", () => {
    const first = createAgentContext({ userId: "user-a" });
    const second = createAgentContext({ userId: "user-b" });
    expect(firestoreSessionPrefix({ context: first })).toBe("user-a");
    expect(firestoreSessionPrefix({ context: second })).toBe("user-b");
    expect(() =>
      firestoreSessionPrefix({
        context: { modelInput: { userId: "attacker-controlled" } },
      }),
    ).toThrow("Authenticated agent user id");
  });

  it("rejects missing identity instead of trusting tool input", () => {
    expect(() => requireAgentUserId(undefined)).toThrow(
      "Authenticated agent context",
    );
    expect(() => requireAgentUserId({})).toThrow(
      "Authenticated agent user id",
    );
  });

  it("interrupts before a fact-state mutation without human approval", async () => {
    await expect(
      reviewCareerFactTool.run(
        {
          factId: "00000000-0000-4000-8000-000000000001",
          proposedState: "confirmed",
          summary: "Confirm this career fact.",
        },
        {
          context: createAgentContext({ userId: "user-a" }),
        },
      ),
    ).rejects.toMatchObject({
      name: expect.stringMatching(/interrupt/i),
    });
  });
});
