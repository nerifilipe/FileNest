import { test, expect } from "@playwright/test";
import { screenshotPath } from "./screenshots.mjs";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/operations/search", (route) =>
    route.fulfill({
      json: { items: [], total: 0, page: 1, pages: 1, page_size: 10 },
    }),
  );
});

test("unavailable Ollama offers explicit rules choice", async ({ page }) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      json: {
        available: false,
        model: "qwen3:4b",
        message: "The qwen3:4b model is not installed.",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Suggestion engine").selectOption("ollama");
  await expect(
    page.getByText("The qwen3:4b model is not installed."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use local rules", exact: true })
    .click();
  await expect(page.getByLabel("Suggestion engine")).toHaveValue("demo-rules");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9);
});

test("mixed AI and rules suggestions are clearly labelled", async ({
  page,
}) => {
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      json: {
        available: true,
        model: "qwen3:4b",
        message: "Ollama is available.",
      },
    }),
  );
  await page.route("**/api/analyze", (route) => {
    expect(route.request().postDataJSON().provider).toBe("ollama");
    const base = {
      size: 123,
      category: "Work",
      proposed_folder: "Work",
      status: "ready",
      included: true,
      issues: [],
    };
    return route.fulfill({
      json: {
        root: "C:/demo",
        provider: "ollama",
        warnings: [],
        items: [
          {
            ...base,
            id: "a.txt",
            current_path: "a.txt",
            proposed_name: "project-meeting.txt",
            reason: "Meeting minutes.",
            suggestion_source: "ollama",
            provider_note: "",
          },
          {
            ...base,
            id: "b.txt",
            current_path: "b.txt",
            proposed_name: "meeting.txt",
            reason: "Local rule: meeting.",
            suggestion_source: "demo-rules",
            provider_note: "Local rules fallback: the model took too long.",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Suggestion engine").selectOption("ollama");
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".source-badge.ai")).toHaveCount(1);
  await expect(
    page.locator(".source-badge").filter({ hasText: "Local rules" }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Local rules fallback:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("1 AI suggestions · 1 from rules.", { exact: false }),
  ).toBeVisible();
});

test("live Ollama analyses only fictional samples", async ({ page }) => {
  test.skip(
    process.env.FILENEST_LIVE_AI !== "1",
    "Opt-in: requires local Ollama and qwen3:4b",
  );
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByLabel("Suggestion engine").selectOption("ollama");
  await expect(
    page.getByText("Ollama and local model are available."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore sample files" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9, { timeout: 230_000 });
  await expect(page.locator(".source-badge.ai")).toHaveCount(5);
  await page.screenshot({
    path: screenshotPath("ai-demo.png"),
    fullPage: true,
  });
});
