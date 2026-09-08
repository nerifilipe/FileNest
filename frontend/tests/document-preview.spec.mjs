import { test, expect } from "@playwright/test";
import { screenshotPath } from "./screenshots.mjs";

test("read TXT and render PDF while editing suggestions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await page
    .getByRole("button", { name: "Pré-visualizar ideias.txt", exact: true })
    .click();
  const text = page.getByRole("region", {
    name: "Pré-visualização de ideias.txt",
    exact: true,
  });
  await expect(text.locator("pre")).not.toBeEmpty();
  await page
    .getByLabel("Nome proposto de ideias.txt", { exact: true })
    .fill("ideias-revistas.txt");
  await page
    .getByRole("button", {
      name: "Pré-visualizar digitalizado.pdf",
      exact: true,
    })
    .click();
  const pdf = page.getByRole("region", {
    name: "Pré-visualização de digitalizado.pdf",
    exact: true,
  });
  await expect(pdf.getByRole("img")).toBeVisible();
  expect(
    await pdf.getByRole("img").evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(
    pdf.getByRole("button", { name: "Página seguinte" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByRole("button", { name: "Pré-visualizar scan_001.pdf", exact: true })
    .click();
  const card = page
    .locator(".file-card")
    .filter({
      has: page.getByRole("button", {
        name: "Pré-visualizar scan_001.pdf",
        exact: true,
      }),
    });
  await expect(card.getByRole("img", { name: "Página 1 de scan_001.pdf", exact: true })).toBeVisible();
  await card.screenshot({ path: screenshotPath("document-preview.png") });
  await expect(
    page.getByLabel("Nome proposto de ideias.txt", { exact: true }),
  ).toHaveValue("ideias-revistas.txt");
  await page
    .getByRole("button", { name: "Pré-visualizar scan_001.pdf", exact: true })
    .click();
  await expect(card.getByRole("region")).toHaveCount(0);
});
