import { test, expect } from "@playwright/test";
import { screenshotPath } from "./screenshots.mjs";

test("read TXT and render PDF while editing suggestions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await page
    .getByRole("button", { name: "Preview ideas.txt", exact: true })
    .click();
  const text = page.getByRole("region", {
    name: "Preview of ideas.txt",
    exact: true,
  });
  await expect(text.locator("pre")).not.toBeEmpty();
  await page
    .getByLabel("Proposed name for ideas.txt", { exact: true })
    .fill("reviewed-ideas.txt");
  await page
    .getByRole("button", {
      name: "Preview scanned.pdf",
      exact: true,
    })
    .click();
  const pdf = page.getByRole("region", {
    name: "Preview of scanned.pdf",
    exact: true,
  });
  await expect(pdf.getByRole("img")).toBeVisible();
  expect(
    await pdf.getByRole("img").evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(pdf.getByRole("button", { name: "Next page" })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByRole("button", { name: "Preview scan_001.pdf", exact: true })
    .click();
  const card = page.locator(".file-card").filter({
    has: page.getByRole("button", {
      name: "Preview scan_001.pdf",
      exact: true,
    }),
  });
  await expect(
    card.getByRole("img", { name: "Page 1 of scan_001.pdf", exact: true }),
  ).toBeVisible();
  await card.screenshot({ path: screenshotPath("document-preview.png") });
  await expect(
    page.getByLabel("Proposed name for ideas.txt", { exact: true }),
  ).toHaveValue("reviewed-ideas.txt");
  await page
    .getByRole("button", { name: "Preview scan_001.pdf", exact: true })
    .click();
  await expect(card.getByRole("region")).toHaveCount(0);
});
