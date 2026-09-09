import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const empty = { items: [], total: 0, page: 1, pages: 1 };

test("folder picker selects a path and cancellation preserves it", async ({
  page,
}) => {
  await page.route("**/api/operations/search", (r) =>
    r.fulfill({ json: empty }),
  );
  let selected = "C:/FileNest-demo";
  await page.route("**/api/folders/pick", (r) =>
    r.fulfill({ json: { path: selected } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Choose folder" }).click();
  await expect(page.getByLabel("Local folder path")).toHaveValue(selected);
  selected = null;
  await page.getByRole("button", { name: "Choose folder" }).click();
  await expect(page.getByLabel("Local folder path")).toHaveValue(
    "C:/FileNest-demo",
  );
});

test("history pagination, search, filters and JSON download", async ({
  page,
}) => {
  const record = {
    id: "demo",
    root: "C:/exemplo",
    status: "undone",
    created_at: "2026-09-07T12:00:00Z",
    actions: [],
    error: "",
  };
  await page.route("**/api/operations/search", (r) => {
    const q = r.request().postDataJSON();
    return r.fulfill({
      json:
        q.search === "inexistente"
          ? empty
          : { items: [record], total: 11, page: q.page, pages: 2 },
    });
  });
  await page.route("**/api/operations/export", (r) => {
    expect(r.request().postDataJSON().status).toBe("undone");
    return r.fulfill({
      json: { format: "filenest-history-v1", total: 11, operations: [record] },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await page.getByLabel("Operation status").selectOption("undone");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export results" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("filenest-history.json");
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(data.total).toBe(11);
  expect(data.operations[0].root).toBe("C:/exemplo");
  await page.getByLabel("Search paths").fill("inexistente");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByText("No operations match these filters.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export results" }),
  ).toBeDisabled();
});

test("real local OCR reads fictional scanned PDF", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const status = await request.post("/api/ocr/status", {
    headers: { "X-FileNest-Client": "local-preview" },
    data: {},
  });
  test.skip(
    !(await status.json()).available,
    "Requires local Tesseract with eng",
  );
  await page.route("**/api/operations/search", (r) =>
    r.fulfill({ json: empty }),
  );
  await page.goto("/");
  await page.getByLabel("Read scanned PDFs with local OCR").check();
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9, { timeout: 60_000 });
  await expect(
    page.getByText("Text recognized by OCR", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByLabel("Proposed name for scanned.pdf", { exact: true }),
  ).toBeEnabled();
});
