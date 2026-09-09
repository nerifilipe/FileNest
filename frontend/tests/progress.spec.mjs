import { test, expect } from "@playwright/test";

test("progress and cooperative cancellation keep completed suggestions", async ({
  page,
}) => {
  await page.route("**/api/operations/search", (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 1, pages: 1 } }),
  );
  const job = {
    id: "test",
    status: "running",
    total: 4,
    completed: 1,
    current: "Arquivo/a.txt",
    cancel_requested: false,
    plan: null,
    error: "",
  };
  await page.route("**/api/analyze", (r) => {
    expect(r.request().postDataJSON().background).toBe(true);
    return r.fulfill({ json: job });
  });
  let cancelled = false;
  await page.route("**/api/analysis/test/cancel", (r) => {
    cancelled = true;
    return r.fulfill({ json: { ...job, cancel_requested: true } });
  });
  await page.route("**/api/analysis/test/status", (r) =>
    r.fulfill({
      json: cancelled
        ? {
            ...job,
            status: "cancelled",
            cancel_requested: true,
            plan: {
              root: "C:/demo",
              provider: "demo-rules",
              warnings: ["Analysis cancelled: 1 of 4 documents completed."],
              items: [
                {
                  id: "concluido.txt",
                  current_path: "concluido.txt",
                  size: 10,
                  status: "ready",
                  included: true,
                  issues: [],
                  category: "Work",
                  proposed_name: "meeting.txt",
                  proposed_folder: "Work",
                  reason: "Regra local",
                  suggestion_source: "demo-rules",
                  extraction_notes: [],
                },
              ],
            },
          }
        : job,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(
    page.getByText("1 of 4 documents completed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".loading")
    .screenshot({ path: "../tmp/analysis-progress.png" });
  await page
    .getByRole("button", { name: "Cancel analysis", exact: true })
    .click();
  await expect(
    page.getByText("Analysis cancelled:", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".file-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Try the demo" }),
  ).toBeEnabled();
});
