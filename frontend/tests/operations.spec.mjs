import { test, expect } from "@playwright/test";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

test("copy demo, cancel approval, organize, reload history and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await page.getByRole("button", { name: "Create a demo copy" }).click();
  await expect(
    page.getByRole("button", { name: "Prepare organization" }),
  ).toBeEnabled();
  const root = await page.getByLabel("Local folder path").inputValue();
  const original = await readFile(join(root, "scan_001.pdf"));
  await page.getByRole("button", { name: "Prepare organization" }).click();
  const approval = page.getByRole("region", {
    name: "Confirm organization",
    exact: true,
  });
  await expect(approval).toBeVisible();
  await approval.screenshot({ path: "../tmp/approval-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await approval.screenshot({ path: "../tmp/approval-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    approval.getByRole("button", { name: "Confirm and organize" }),
  ).toBeDisabled();
  await approval.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readFile(join(root, "scan_001.pdf"))).toEqual(original);
  await page.getByRole("button", { name: "Prepare organization" }).click();
  await approval.getByRole("checkbox").check();
  await approval.getByRole("button", { name: "Confirm and organize" }).click();
  await expect(
    page.getByText("Organization complete.", { exact: false }),
  ).toBeVisible();
  expect(
    await readFile(join(root, "Finance", "2026-09-01_invoice.pdf")),
  ).toEqual(original);
  await expect(access(join(root, "scan_001.pdf"))).rejects.toThrow();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const restore = page.getByRole("region", {
    name: "Confirm undo",
    exact: true,
  });
  await expect(
    restore.getByRole("button", { name: "Confirm and undo" }),
  ).toBeDisabled();
  await restore.getByRole("checkbox").check();
  await restore.getByRole("button", { name: "Confirm and undo" }).click();
  await expect(
    page.getByText("Undo complete.", { exact: false }),
  ).toBeVisible();
  expect(await readFile(join(root, "scan_001.pdf"))).toEqual(original);
});
