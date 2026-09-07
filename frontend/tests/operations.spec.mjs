import { test, expect } from "@playwright/test";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

test("copy demo, cancel approval, organize, reload history and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar exemplo" }).click();
  await page
    .getByRole("button", { name: "Criar cópia para organizar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparar organização" }),
  ).toBeEnabled();
  const root = await page.getByLabel("Caminho da pasta local").inputValue();
  const original = await readFile(join(root, "scan_001.pdf"));
  await page.getByRole("button", { name: "Preparar organização" }).click();
  const approval = page.getByRole("region", {
    name: "Confirmar organização",
    exact: true,
  });
  await expect(approval).toBeVisible();
  await approval.screenshot({ path: "../tmp/approval-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await approval.screenshot({ path: "../tmp/approval-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    approval.getByRole("button", { name: "Confirmar e organizar" }),
  ).toBeDisabled();
  await approval.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await readFile(join(root, "scan_001.pdf"))).toEqual(original);
  await page.getByRole("button", { name: "Preparar organização" }).click();
  await approval.getByRole("checkbox").check();
  await approval.getByRole("button", { name: "Confirmar e organizar" }).click();
  await expect(
    page.getByText("Organização concluída.", { exact: false }),
  ).toBeVisible();
  expect(
    await readFile(join(root, "Financas", "2026-09-01_fatura.pdf")),
  ).toEqual(original);
  await expect(access(join(root, "scan_001.pdf"))).rejects.toThrow();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Desfazer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  const restore = page.getByRole("region", {
    name: "Confirmar restauro",
    exact: true,
  });
  await expect(
    restore.getByRole("button", { name: "Confirmar e desfazer" }),
  ).toBeDisabled();
  await restore.getByRole("checkbox").check();
  await restore.getByRole("button", { name: "Confirmar e desfazer" }).click();
  await expect(
    page.getByText("Restauro concluído.", { exact: false }),
  ).toBeVisible();
  expect(await readFile(join(root, "scan_001.pdf"))).toEqual(original);
});
