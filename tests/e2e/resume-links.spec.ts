import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

test("keeps every preview link clickable in the downloaded PDF", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Resume editor" }).click();

  await page.getByPlaceholder("you@example.com").fill("candidate@example.test");
  await page.getByPlaceholder("+91-…").fill("+1 (555) 010-0200");
  await page
    .getByPlaceholder("https://…")
    .first()
    .fill("example.test/portfolio");
  await page.locator("#ed-summary > summary").click();
  await page
    .getByPlaceholder("Optional professional summary…")
    .fill(
      "Profile: https://example.test/profile. Email candidate@example.test.",
    );

  const expectedHrefs = [
    "mailto:candidate@example.test",
    "tel:+15550100200",
    "https://example.test/portfolio",
    "https://example.test/profile",
  ];
  for (const href of expectedHrefs) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  }

  const previewHrefs = await page.locator("main a[href]").evaluateAll((links) =>
    Array.from(
      new Set(links.map((link) => link.getAttribute("href")).filter(Boolean)),
    ),
  );

  await page.emulateMedia({ media: "print" });
  const pdfBytes = await page.pdf({ format: "A4", printBackground: true });
  const loadingTask = getDocument({ data: new Uint8Array(pdfBytes) });
  const pdf = await loadingTask.promise;
  const pdfHrefs = new Set<string>();
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const annotations = await pdfPage.getAnnotations({ intent: "display" });
    for (const annotation of annotations) {
      if (annotation.subtype !== "Link") continue;
      const href = annotation.url ?? annotation.unsafeUrl;
      if (href) pdfHrefs.add(href);
    }
  }
  await loadingTask.destroy();

  for (const href of previewHrefs) {
    expect(pdfHrefs, `missing PDF annotation for ${href}`).toContain(href);
  }
});
