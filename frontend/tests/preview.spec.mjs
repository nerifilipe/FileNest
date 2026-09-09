import { test, expect } from "@playwright/test";
import { screenshotPath } from "./screenshots.mjs";

// Preview tests isolate the history panel; operations.spec exercises real persistence.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/operations/search", (route) =>
    route.fulfill({
      json: { items: [], total: 0, page: 1, pages: 1, page_size: 10 },
    }),
  );
});

test("demo, edit, validate, exclude and restore without external requests", async ({
  page,
}) => {
  const external = [];
  const errors = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5174"))
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make room for what matters." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9);
  await expect(
    page.getByText("Protected PDF.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("OCR may be required.", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: screenshotPath("demo-desktop.png"),
    fullPage: true,
  });
  const name = page.getByRole("textbox", {
    name: "Proposed name for scan_001.pdf",
    exact: true,
  });
  await name.fill("reviewed-invoice.pdf");
  await page
    .getByRole("textbox", { name: "Folder for scan_001.pdf", exact: true })
    .fill("../fora");
  await page.getByRole("button", { name: "Validate plan" }).click();
  await expect(
    page.getByText("Invalid name or folder.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Folder for scan_001.pdf", exact: true })
    .fill("Finance/2026");
  await page.getByRole("button", { name: "Validate plan" }).click();
  await expect(
    page.getByText("Invalid name or folder.", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Include scan_001.pdf", exact: true })
    .uncheck();
  await expect(name).toBeDisabled();
  await page.getByRole("button", { name: "Reset suggestions" }).click();
  await expect(name).toHaveValue("2026-09-01_invoice.pdf");
  await expect(
    page.getByRole("checkbox", { name: "Include scan_001.pdf", exact: true }),
  ).toBeChecked();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: screenshotPath("demo-mobile.png"),
    fullPage: true,
  });
});

test("loading and unavailable local API have useful states", async ({
  page,
}) => {
  await page.goto("/");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/analyze", async (route) => {
    await gate;
    await route.abort();
  });
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.getByRole("status")).toContainText("Reading documents");
  release();
  await expect(page.getByRole("alert")).toContainText("local server");
});
