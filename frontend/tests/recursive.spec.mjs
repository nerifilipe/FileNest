import { test, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

test("opt-in subfolders retain distinct paths through edits, organization and undo", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const parent = resolve("../tmp");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "recursive-e2e-"));
  for (const folder of ["A", "B/Arquivo"]) {
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(
      join(root, folder, "nota.txt"),
      "Project meeting on 2026-09-08",
      "utf8",
    );
  }
  await page.goto("/");
  await page.getByLabel("Local folder path").fill(root);
  await expect(
    page.getByLabel("Include subfolders", { exact: true }),
  ).not.toBeChecked();
  const shallow = page.waitForResponse("**/api/analyze");
  await page
    .getByRole("button", { name: "Analyze folder", exact: true })
    .click();
  await shallow;
  await expect(
    page.getByRole("heading", { name: "No supported documents" }),
  ).toBeVisible();
  await page.getByLabel("Include subfolders", { exact: true }).check();
  await page
    .getByRole("button", { name: "Analyze folder", exact: true })
    .click();
  await expect(page.locator(".file-card")).toHaveCount(2);
  await page
    .getByLabel("Proposed name for A/nota.txt", { exact: true })
    .fill("meeting-a.txt");
  await page
    .getByLabel("Proposed name for B/Arquivo/nota.txt", { exact: true })
    .fill("meeting-b.txt");
  await page.getByRole("button", { name: "Validate plan" }).click();
  await page.getByRole("button", { name: "Prepare organization" }).click();
  const approval = page.getByRole("region", {
    name: "Confirm organization",
    exact: true,
  });
  await expect(approval).toContainText("B/Arquivo/nota.txt");
  await approval.getByRole("checkbox").check();
  await approval.getByRole("button", { name: "Confirm and organize" }).click();
  await expect(
    page.getByText("Organization complete.", { exact: false }),
  ).toBeVisible();
  expect(await readFile(join(root, "Work/meeting-b.txt"), "utf8")).toContain(
    "Project meeting",
  );
  const history = page.locator(".history-card").filter({ hasText: root });
  await history.getByRole("button", { name: "Undo", exact: true }).click();
  const restore = page.getByRole("region", {
    name: "Confirm undo",
    exact: true,
  });
  await restore.getByRole("checkbox").check();
  await restore.getByRole("button", { name: "Confirm and undo" }).click();
  await expect(
    page.getByText("Undo complete.", { exact: false }),
  ).toBeVisible();
  for (const folder of ["A", "B/Arquivo"]) {
    expect(await readFile(join(root, folder, "nota.txt"), "utf8")).toBe(
      "Project meeting on 2026-09-08",
    );
  }
});
