import { expect, test } from "@playwright/test";
import { kontrolnaZnamenkaOib } from "../src/domain/oib";
import { E2E } from "./podaci";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

function noviOib(): string {
  const prvih10 = String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999));
  return prvih10 + kontrolnaZnamenkaOib(prvih10);
}

test("više firmi: nova firma, prelazak iz zaglavlja, poziv i otkaz, podaci odvojeni", async ({ page }, info) => {
  await prijaviSe(page, `firme-${info.project.name}@e2e.hr`);
  await page.goto("/firme");
  await expect(page.getByTestId("moje-firme")).toContainText(E2E.firma);
  const naziv = `E2E Nova ${info.project.name} ${Date.now()}`;
  const obrazac = page.getByRole("form", { name: "Nova firma" });
  await obrazac.getByLabel("Naziv firme").fill(naziv);
  await obrazac.getByLabel("OIB").fill(noviOib());
  await obrazac.getByRole("button", { name: "Napravi firmu" }).click();
  await expect(page.getByText(/Firma je napravljena/)).toBeVisible();
  const odabir = page.getByRole("combobox", { name: "Firma" });
  await expect(odabir.locator("option:checked")).toHaveText(naziv);

  // nova firma je prazna: nema partnera iz E2E firme
  await page.goto("/partneri?trazi=E2E");
  await expect(page.getByText("E2E Kupac d.o.o.")).toHaveCount(0);

  // poziv (e-pošta bez računa se ne otkriva) i otkaz
  await page.goto("/korisnici");
  const poziv = page.getByRole("form", { name: "Poziv u firmu" });
  await poziv.getByLabel("E-pošta").fill(`netko-${info.project.name}@primjer.hr`);
  await poziv.getByRole("button", { name: "Pošalji poziv" }).click();
  await expect(page.getByTestId("poveznica-poziva")).toContainText("/firme/poziv/");
  await expect(page.getByTestId("pozivi-firme")).toContainText(`netko-${info.project.name}@primjer.hr`);
  await page.getByTestId("pozivi-firme").getByRole("button", { name: "Otkaži" }).click();
  await expect(page.getByTestId("pozivi-firme")).toHaveCount(0);
  await bezVodoravnogPomicanja(page);

  // natrag u E2E firmu iz zaglavlja; podaci E2E firme su opet tu
  await odabir.selectOption({ label: E2E.firma });
  await expect(odabir.locator("option:checked")).toHaveText(E2E.firma);
  await page.goto("/partneri?trazi=E2E%20Kupac");
  await expect(page.getByText("E2E Kupac d.o.o.").first()).toBeVisible();
});
