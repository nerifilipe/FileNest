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
        message: "O modelo qwen3:4b não está instalado.",
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Como gerar sugestões").selectOption("ollama");
  await expect(
    page.getByText("O modelo qwen3:4b não está instalado."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Usar regras locais", exact: true })
    .click();
  await expect(page.getByLabel("Como gerar sugestões")).toHaveValue(
    "demo-rules",
  );
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
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
        message: "Ollama disponível.",
      },
    }),
  );
  await page.route("**/api/analyze", (route) => {
    expect(route.request().postDataJSON().provider).toBe("ollama");
    const base = {
      size: 123,
      category: "Trabalho",
      proposed_folder: "Trabalho",
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
            proposed_name: "reuniao-projeto.txt",
            reason: "Ata de reunião.",
            suggestion_source: "ollama",
            provider_note: "",
          },
          {
            ...base,
            id: "b.txt",
            current_path: "b.txt",
            proposed_name: "reuniao.txt",
            reason: "Regra local: reunião.",
            suggestion_source: "demo-rules",
            provider_note:
              "Alternativa por regras locais: o modelo demorou demasiado.",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Como gerar sugestões").selectOption("ollama");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.locator(".source-badge.ai")).toHaveCount(1);
  await expect(
    page.locator(".source-badge").filter({ hasText: "Regras locais" }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Alternativa por regras locais:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("1 sugestão(ões) da IA · 1 por regras.", { exact: false }),
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
  await page.getByLabel("Como gerar sugestões").selectOption("ollama");
  await expect(
    page.getByText("Ollama e modelo local disponíveis."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.locator(".file-card")).toHaveCount(9, { timeout: 230_000 });
  await expect(page.locator(".source-badge.ai")).toHaveCount(5);
  await page.screenshot({ path: screenshotPath("ai-demo.png"), fullPage: true });
});
