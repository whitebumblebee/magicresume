import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { createLayoutPreset } from "../../lib/resume/layout-presets";
import { SAMPLE_RESUME } from "../../lib/resume/sample";

async function firstVisibleBox(locator: Locator) {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate.boundingBox();
  }
  return null;
}

test("builds a truthful application and keeps target state private", async ({
  page,
}) => {
  const factId = "00000000-0000-4000-8000-000000000001";
  const inferredFactId = "00000000-0000-4000-8000-000000000002";
  const applicationId = "00000000-0000-4000-8000-000000000010";
  const goalId = "00000000-0000-4000-8000-000000000020";
  const taskId = "00000000-0000-4000-8000-000000000021";
  const targetDoc = structuredClone(SAMPLE_RESUME);
  targetDoc.summary =
    "TARGET STATE: Web3 engineer after completing the evidence plan.";
  const applicationDoc = structuredClone(SAMPLE_RESUME);
  applicationDoc.layout = createLayoutPreset(applicationDoc, "two-column");

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "00000000-0000-4000-8000-000000000099",
          name: "Demo Candidate",
          email: "demo@example.com",
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
    }),
  );
  await page.route("**/api/career/facts", (route) =>
    route.fulfill({
      json: {
        facts: [
          {
            id: factId,
            kind: "experience",
            title: "Gameplay engineer",
            organization: "Studio",
            description:
              "Built multiplayer gameplay systems and reduced synchronization latency by 35%.",
            skills: ["TypeScript", "Networking"],
            metrics: ["35%"],
            state: "confirmed",
            qualityScore: 95,
            evidenceStrength: ["metric", "source"],
            sources: [],
          },
          {
            id: inferredFactId,
            kind: "skill",
            title: "Solidity",
            organization: "",
            description: "Currently building a small learning project.",
            skills: ["Solidity"],
            metrics: [],
            state: "inferred",
            qualityScore: 45,
            evidenceStrength: [],
            sources: [],
          },
        ],
        summary: {
          total: 2,
          confirmed: 1,
          needsReview: 1,
          aspirational: 0,
          rejected: 0,
        },
      },
    }),
  );
  await page.route("**/api/career/tailor", (route) =>
    route.fulfill({
      json: {
        applicationId,
        jobProfile: {
          title: "Web3 Engineer",
          company: "Protocol Labs",
          summary: "Build reliable distributed protocol systems.",
          requirements: [
            {
              capability: "Distributed systems",
              importance: "must_have",
              evidenceHint: "Production systems evidence",
            },
          ],
          keywords: ["distributed systems", "TypeScript"],
        },
        gaps: [
          {
            capability: "Solidity",
            importance: "must_have",
            state: "missing",
            sourceFactIds: [],
            rationale: "No confirmed Solidity evidence exists.",
            recommendation: "Build and document a small audited contract.",
          },
        ],
        goals: [
          {
            id: goalId,
            capability: "Solidity",
            title: "Ship a Solidity evidence project",
            description:
              "Create a small contract with tests and documentation.",
            status: "planned",
            tasks: [
              {
                id: taskId,
                title: "Build the contract",
                description: "Implement, test, and deploy a small contract.",
                completionEvidence:
                  "Repository, test output, and deployment link",
                status: "planned",
              },
            ],
          },
        ],
        application: {
          kind: "application",
          doc: applicationDoc,
          claims: [],
          exportable: true,
        },
        target: {
          kind: "target",
          doc: targetDoc,
          claims: [],
          exportable: false,
          watermark: "ASPIRATIONAL — NOT FOR APPLICATION",
        },
        rationale:
          "The application leads with confirmed networking evidence and keeps Solidity in the private plan.",
      },
    }),
  );
  await page.route("**/api/career/layout", (route) =>
    route.fulfill({
      json: {
        action: "ready",
        message: "The grounded application fits one page.",
      },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: /Career memory/ }).click();
  await expect(page.getByText("2 total", { exact: true })).toBeVisible();
  await expect(page.getByText("1 confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("1 needs review", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New application" }).click();
  // Both the confirmed and the still-unconfirmed item count as usable evidence:
  // the product trusts what the user supplied and does not gate on confirmation.
  await expect(
    page.getByText("2 memory items available as evidence.", { exact: false }),
  ).toBeVisible();
  // Exact match: the panel also has a "Job description URL" input beside this.
  await page
    .getByLabel("Job description", { exact: true })
    .fill(
      "Protocol Labs is hiring a Web3 Engineer to build reliable distributed protocol systems. Must have production TypeScript, distributed systems, Solidity, testing, and strong written communication experience.",
    );
  await page
    .getByRole("button", {
      name: "Build truthful application + gap plan",
    })
    .click();

  await expect(
    page.getByRole("button", { name: "Application resume" }),
  ).toBeVisible();
  const skillsBox = await firstVisibleBox(
    page.getByRole("heading", { name: "Skills", exact: true }),
  );
  const experienceBox = await firstVisibleBox(
    page.getByRole("heading", { name: "Experience", exact: true }),
  );
  expect(skillsBox).not.toBeNull();
  expect(experienceBox).not.toBeNull();
  expect(Math.abs(skillsBox!.x - experienceBox!.x)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Target-state preview" }).click();
  await expect(
    page.getByText("ASPIRATIONAL — NOT FOR APPLICATION"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export blocked" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Preparation plan" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Become the candidate shown in your target resume.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Evidence to graduate:")).toBeVisible();
});
