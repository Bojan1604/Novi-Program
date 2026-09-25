import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("novi partner: kriv OIB se odbija uz polje, ispravan sprema; poslovnica u dijalogu", async ({ page }) => {
  const naziv = `Kupac ${test.info().project.name} ${Date.now() % 100000}`;
  await prijaviSe(page);
  await page.goto("/partneri");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: "Novi partner" }).click();
  await expect(page).toHaveURL(/\/partneri\/novi$/);
  await bezVodoravnogPomicanja(page);
  await page.getByLabel("Naziv", { exact: true }).fill(naziv);
  await page.getByLabel("OIB", { exact: true }).fill("12345678901");
  await page.getByLabel("Poštanski broj").fill("10000");
  await page.getByLabel("Mjesto").fill("Zagreb");
  await page.getByRole("button", { name: "Dodaj partnera" }).click();
  await expect(page.getByText("OIB nije ispravan (kontrolna znamenka ne odgovara).")).toBeVisible();
  // ostala polja nisu izgubljena
  await expect(page.getByLabel("Mjesto")).toHaveValue("Zagreb");

  // jedinstven ispravan OIB za ovaj test (kontrolna znamenka izračunata)
  const prvih10 = String(1_000_000_000 + (Date.now() % 8_999_999_999)).slice(0, 10);
  let a = 10;
  for (const c of prvih10) {
    a = (a + Number(c)) % 10 || 10;
    a = (a * 2) % 11;
  }
  const oib = prvih10 + ((11 - a) % 10);
  await page.getByLabel("OIB", { exact: true }).fill(oib);
  await page.getByRole("button", { name: "Dodaj partnera" }).click();
  await expect(page).toHaveURL(/\/partneri\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: naziv })).toBeVisible();

  await page.getByRole("button", { name: "Nova poslovnica" }).click();
  const dijalog = page.getByRole("dialog");
  await dijalog.getByLabel("Naziv poslovnice").fill("Skladište Split");
  await dijalog.getByLabel("Mjesto").fill("Split");
  await dijalog.getByRole("button", { name: "Spremi poslovnicu" }).click();
  await expect(dijalog).toBeHidden();
  await expect(page.getByTestId("poslovnice")).toContainText("Skladište Split");

  await page.goto(`/partneri?trazi=${oib}`);
  await expect(page.getByTestId("popis-partnera")).toContainText(naziv);
});

test("cjenik: posebna cijena modela preko pretraživača", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/cjenici/novi");
  await page.getByLabel("Naziv", { exact: true }).fill(`Cjenik ${test.info().project.name} ${Date.now() % 100000}`);
  await page.getByLabel(/Popust/).fill("5");
  await page.getByRole("button", { name: "Napravi cjenik" }).click();
  await expect(page).toHaveURL(/\/cjenici\/[0-9a-f-]{36}$/);
  await bezVodoravnogPomicanja(page);
  const model = page.getByRole("combobox", { name: "Model" });
  await model.fill("E2E Lap");
  await expect(page.getByRole("option", { name: /E2E Laptop 14/ })).toBeVisible();
  await model.press("Enter");
  await page.getByLabel("Cijena (€, bez PDV-a)").fill("899,00");
  await page.getByRole("button", { name: "Dodaj" }).click();
  const tablica = page.getByTestId("stavke-cjenika");
  await expect(tablica).toContainText("E2E Proizvođač E2E Laptop 14");
  await expect(tablica).toContainText("899,00 €");
  await expect(tablica).toContainText("1.000,00 €");
});
