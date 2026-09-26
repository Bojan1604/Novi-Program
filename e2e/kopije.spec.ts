import { expect, test } from "@playwright/test";
import { kontrolnaZnamenkaOib } from "../src/domain/oib";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

function noviOib(): string {
  const prvih10 = String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999));
  return prvih10 + kontrolnaZnamenkaOib(prvih10);
}

test("sigurnosne kopije: izrada, preuzimanje i vraćanje u novu firmu", async ({ page }) => {
  test.setTimeout(120_000);
  await prijaviSe(page);
  await page.goto("/kopije");
  await expect(page.getByRole("heading", { name: "Sigurnosne kopije" })).toBeVisible();
  await page.getByRole("button", { name: "Izradi kopiju sada" }).click();
  await expect(page.getByText(/Kopija je izrađena/)).toBeVisible({ timeout: 60_000 });
  const popis = page.getByTestId("kopije");
  await expect(popis.getByText("ručna").first()).toBeVisible();

  const [preuzimanje] = await Promise.all([page.waitForEvent("download"), popis.getByRole("link", { name: "Preuzmi" }).first().click()]);
  expect(preuzimanje.suggestedFilename()).toMatch(/^kopija-\d{11}-.*\.ndjson\.gz$/);

  const obrazac = page.getByRole("form", { name: "Vraćanje kopije" });
  await obrazac.getByLabel("Naziv nove firme").fill("Vraćena iz kopije d.o.o.");
  await obrazac.getByLabel("OIB nove firme").fill(noviOib());
  page.once("dialog", (d) => void d.accept());
  await obrazac.getByRole("button", { name: "Vrati u novu firmu" }).click();
  await expect(page.getByText(/Kopija je vraćena u novu firmu \(\d+ zapisa\)/)).toBeVisible({ timeout: 90_000 });
  await bezVodoravnogPomicanja(page);
});
