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
      "Reuniao de projeto em 2026-09-08",
      "utf8",
    );
  }
  await page.goto("/");
  await page.getByLabel("Caminho da pasta local").fill(root);
  await expect(
    page.getByLabel("Incluir subpastas", { exact: true }),
  ).not.toBeChecked();
  const shallow = page.waitForResponse("**/api/analyze");
  await page
    .getByRole("button", { name: "Analisar pasta", exact: true })
    .click();
  await shallow;
  await expect(
    page.getByRole("heading", { name: "Nenhum documento compatível" }),
  ).toBeVisible();
  await page.getByLabel("Incluir subpastas", { exact: true }).check();
  await page
    .getByRole("button", { name: "Analisar pasta", exact: true })
    .click();
  await expect(page.locator(".file-card")).toHaveCount(2);
  await page
    .getByLabel("Nome proposto de A/nota.txt", { exact: true })
    .fill("reuniao-a.txt");
  await page
    .getByLabel("Nome proposto de B/Arquivo/nota.txt", { exact: true })
    .fill("reuniao-b.txt");
  await page.getByRole("button", { name: "Validar plano" }).click();
  await page.getByRole("button", { name: "Preparar organização" }).click();
  const approval = page.getByRole("region", {
    name: "Confirmar organização",
    exact: true,
  });
  await expect(approval).toContainText("B/Arquivo/nota.txt");
  await approval.getByRole("checkbox").check();
  await approval.getByRole("button", { name: "Confirmar e organizar" }).click();
  await expect(
    page.getByText("Organização concluída.", { exact: false }),
  ).toBeVisible();
  expect(
    await readFile(join(root, "Trabalho/reuniao-b.txt"), "utf8"),
  ).toContain("Reuniao");
  const history = page.locator(".history-card").filter({ hasText: root });
  await history.getByRole("button", { name: "Desfazer", exact: true }).click();
  const restore = page.getByRole("region", {
    name: "Confirmar restauro",
    exact: true,
  });
  await restore.getByRole("checkbox").check();
  await restore.getByRole("button", { name: "Confirmar e desfazer" }).click();
  await expect(
    page.getByText("Restauro concluído.", { exact: false }),
  ).toBeVisible();
  for (const folder of ["A", "B/Arquivo"]) {
    expect(await readFile(join(root, folder, "nota.txt"), "utf8")).toBe(
      "Reuniao de projeto em 2026-09-08",
    );
  }
});
