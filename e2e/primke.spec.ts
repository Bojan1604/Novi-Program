import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("zaprimanje: skener, zalijepljeni stupac, dvostruki serijski, primka s uređajima", async ({ page }) => {
  const oznaka = `${test.info().project.name === "mobitel" ? "M" : "R"}${Date.now() % 1_000_000}`;
  await prijaviSe(page);
  await page.goto("/primke");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: "Nova primka" }).click();
  await expect(page).toHaveURL(/\/primke\/nova$/);
  await bezVodoravnogPomicanja(page);

  // bez modela skener javlja grešku
  const skener = page.getByRole("textbox", { name: "Skener" });
  await skener.fill(`${oznaka}A`);
  await skener.press("Enter");
  await expect(page.getByText("Prvo odaberite model uređaja.")).toBeVisible();

  const dobavljac = page.getByRole("combobox", { name: "Dobavljač" });
  await dobavljac.fill("E2E Dist");
  await expect(page.getByRole("option", { name: /E2E Distributer/ })).toBeVisible();
  await dobavljac.press("Enter");

  const model = page.getByRole("combobox", { name: "Model" });
  await model.fill("E2E Lap");
  await expect(page.getByRole("option", { name: /E2E Laptop 14/ })).toBeVisible();
  await model.press("Enter");
  await page.getByLabel("Nabavna cijena (€, bez PDV-a)").fill("650,00");
  await page.getByLabel("Procesor").fill("Intel i5");

  await skener.fill(`${oznaka}A`);
  await skener.press("Enter");
  await skener.fill(`${oznaka.toLowerCase()}b`);
  await skener.press("Enter");
  await expect(page.getByTestId("broj-uredaja")).toHaveText("2");

  await page.getByLabel("Zalijepite stupac serijskih brojeva").fill(`${oznaka}C\t8 GB\n${oznaka}D\n\n${oznaka}A`);
  await page.getByRole("button", { name: "Dodaj zalijepljene" }).click();
  await expect(page.getByTestId("broj-uredaja")).toHaveText("4");
  await expect(page.getByText(`${oznaka}A je već na popisu.`)).toBeVisible();

  await page.getByRole("button", { name: "Zaprimi 4 uređaja" }).click();
  await expect(page).toHaveURL(/\/primke\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /^Primka PRI-\d+\/\d{4}$/ })).toBeVisible();
  const tablica = page.getByTestId("uredaji-primke");
  await expect(tablica.locator("tbody tr")).toHaveCount(4);
  await expect(tablica).toContainText(`${oznaka}B`);
  await expect(tablica).toContainText("650,00 €");
  await bezVodoravnogPomicanja(page);

  // isti serijski na novoj primci: upozorenje, gumb onemogućen
  await page.goto("/primke/nova");
  await page.getByRole("combobox", { name: "Model" }).fill("E2E Lap");
  await page.getByRole("combobox", { name: "Model" }).press("Enter");
  await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue(/E2E Laptop 14/);
  await skener.fill(`${oznaka}C`);
  await skener.press("Enter");
  await expect(page.getByText(/Već u programu: .*C \(PRI-/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Zaprimi 1 uređaja" })).toBeDisabled();
});
