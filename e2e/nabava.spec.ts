import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("narudžbenica: stavke, djelomično zaprimanje, primka po narudžbenici", async ({ page }) => {
  const p = test.info().project.name.toUpperCase();
  await prijaviSe(page);
  await page.goto("/nabava");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: "Nova narudžbenica" }).click();
  await page.getByRole("combobox", { name: "Dobavljač" }).fill("E2E Distrib");
  await page.getByRole("option", { name: /E2E Distributer/ }).click();
  await page.getByRole("combobox", { name: "Model 1" }).fill("Laptop");
  await page
    .getByRole("option", { name: /E2E Laptop/ })
    .first()
    .click();
  await page.getByLabel("Količina 1").fill("2");
  await page.getByLabel("Cijena 1 (€ bez PDV-a)").fill("500,00");
  await expect(page.getByText("Ukupno bez PDV-a: 1.000,00 €")).toBeVisible();
  await page.getByRole("button", { name: "Spremi narudžbenicu" }).click();
  await expect(page.getByRole("heading", { name: /Narudžbenica NAR-\d+\/2026/ })).toBeVisible();
  await expect(page.getByTestId("pdv-nabave")).toContainText("1.250,00");
  await bezVodoravnogPomicanja(page);

  const z = page.getByTestId("zaprimanje");
  await z.getByLabel(/Serijski brojevi/).fill(`E2E-NAR-${p}-1`);
  await z.getByRole("button", { name: "Zaprimi" }).click();
  await expect(z.getByText(/Zaprimljeno primkom PRI-\d+\/2026/)).toBeVisible();
  await expect(page.getByTestId("primke-narudzbenice")).toContainText("PRI-");
  await expect(page.getByText("Djelomično zaprimljena")).toBeVisible();
});

test("ulazni račun za robu po narudžbenici: trošak robe je veći od primke i računa", async ({ page }) => {
  const p = test.info().project.name.toUpperCase();
  await prijaviSe(page);
  await page.goto("/nabava/nova");
  await page.getByRole("combobox", { name: "Dobavljač" }).fill("E2E Distrib");
  await page.getByRole("option", { name: /E2E Distributer/ }).click();
  await page.getByRole("combobox", { name: "Model 1" }).fill("Laptop");
  await page
    .getByRole("option", { name: /E2E Laptop/ })
    .first()
    .click();
  await page.getByLabel("Cijena 1 (€ bez PDV-a)").fill("400");
  await page.getByRole("button", { name: "Spremi narudžbenicu" }).click();
  await expect(page.getByRole("heading", { name: /Narudžbenica NAR-/ })).toBeVisible();
  await page
    .getByTestId("zaprimanje")
    .getByLabel(/Serijski brojevi/)
    .fill(`E2E-URA-${p}-1`);
  await page.getByTestId("zaprimanje").getByRole("button", { name: "Zaprimi" }).click();
  // sve zaprimljeno: kartica zaprimanja nestaje, primka je na popisu
  await expect(page.getByTestId("primke-narudzbenice")).toContainText("PRI-");
  await expect(page.getByTestId("trosak-robe")).toContainText("400,00");

  await page.getByRole("link", { name: "Upiši ulazni račun" }).click();
  await page.getByLabel("Broj računa dobavljača").fill(`R-${p}-1`);
  await page.getByLabel("Osnovica (€)").fill("450,00");
  await page.getByLabel("PDV (€)").fill("112,50");
  await expect(page.getByLabel(/Račun za robu/)).toBeChecked();
  await page.getByRole("button", { name: "Spremi" }).click();
  await expect(page.getByRole("heading", { name: /Ulazni račun URA-\d+\/2026/ })).toBeVisible();
  await expect(page.getByText("račun za robu", { exact: true })).toBeVisible();
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: /NAR-/ }).click();
  await expect(page.getByTestId("trosak-robe")).toContainText("450,00");
});
