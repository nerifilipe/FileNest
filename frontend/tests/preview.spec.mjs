import { test, expect } from "@playwright/test";

test("demo, edit, validate, exclude and restore without external requests", async ({
  page,
}) => {
  const external = [];
  const errors = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5173"))
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Um lugar para cada ficheiro." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.locator(".file-card")).toHaveCount(8);
  await expect(
    page.getByText("PDF protegido.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Pode ser necessário OCR.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "../docs/demo-desktop.png", fullPage: true });
  const name = page.getByRole("textbox", {
    name: "Nome proposto de scan_001.pdf",
    exact: true,
  });
  await name.fill("fatura-revista.pdf");
  await page
    .getByRole("textbox", { name: "Subpasta de scan_001.pdf", exact: true })
    .fill("../fora");
  await page.getByRole("button", { name: "Validar plano" }).click();
  await expect(
    page.getByText("Nome ou subpasta inválidos.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Subpasta de scan_001.pdf", exact: true })
    .fill("Financas/2026");
  await page.getByRole("button", { name: "Validar plano" }).click();
  await expect(
    page.getByText("Nome ou subpasta inválidos.", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Incluir scan_001.pdf", exact: true })
    .uncheck();
  await expect(name).toBeDisabled();
  await page.getByRole("button", { name: "Repor sugestões" }).click();
  await expect(name).toHaveValue("2026-09-01_fatura.pdf");
  await expect(
    page.getByRole("checkbox", { name: "Incluir scan_001.pdf", exact: true }),
  ).toBeChecked();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.locator(".file-card")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "../docs/demo-mobile.png", fullPage: true });
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
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await expect(page.getByRole("status")).toContainText("A extrair texto");
  release();
  await expect(page.getByRole("alert")).toContainText("servidor local");
});
