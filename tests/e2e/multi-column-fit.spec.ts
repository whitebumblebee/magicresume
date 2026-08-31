import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { underfilledRightSidebarDoc } from "../fixtures/multi-column";

async function visibleBox(locator: Locator) {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate.boundingBox();
  }
  return null;
}

test("fills an underused right sidebar before adding a second page", async ({
  page,
}) => {
  const doc = underfilledRightSidebarDoc();
  await page.addInitScript((resumeDoc) => {
    localStorage.setItem(
      "mr-career-draft-v1",
      JSON.stringify({
        state: {
          doc: resumeDoc,
          autoFit: true,
          manual: null,
          artifactKind: "application",
          targetWatermark: null,
        },
        version: 0,
      }),
    );
  }, doc);

  await page.goto("/");
  await expect(page.getByText(/Fits 1 page/)).toBeVisible({ timeout: 15_000 });
  const renderedPage = await page
    .locator("main .absolute.left-0.top-0")
    .evaluate((element) => ({
      offsetHeight: (element as HTMLElement).offsetHeight,
      resumeHeight: (element.firstElementChild as HTMLElement | null)
        ?.offsetHeight,
      resumeMinHeight: (element.firstElementChild as HTMLElement | null)?.style
        .minHeight,
    }));
  expect(renderedPage.resumeHeight).toBeLessThanOrEqual(
    Number.parseFloat(renderedPage.resumeMinHeight ?? "0") + 1,
  );
  await expect(page.getByText("Page 2 starts here")).toHaveCount(0);

  const experience = await visibleBox(
    page.getByRole("heading", { name: "Experience", exact: true }),
  );
  const education = await visibleBox(
    page.getByRole("heading", { name: "Education", exact: true }),
  );
  const projects = await visibleBox(
    page.getByRole("heading", { name: "Projects", exact: true }),
  );
  expect(experience).not.toBeNull();
  expect(education).not.toBeNull();
  expect(projects).not.toBeNull();
  expect(Math.abs(projects!.x - education!.x)).toBeLessThan(20);
  expect(projects!.x - experience!.x).toBeGreaterThan(150);
  expect(projects!.y).toBeGreaterThan(education!.y);

  const phone = await visibleBox(page.getByRole("link", { name: "+1 555 0100" }));
  const email = await visibleBox(
    page.getByRole("link", { name: "candidate@example.test" }),
  );
  expect(phone).not.toBeNull();
  expect(email).not.toBeNull();
  expect(Math.abs(phone!.y - email!.y)).toBeLessThan(8);
});
