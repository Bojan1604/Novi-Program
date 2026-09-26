import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("ugovor o najmu: otvaranje, izmjena kraja, prilog, otkaz", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/najam");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: "Novi ugovor" }).click();
  await page.getByRole("combobox", { name: "Kupac" }).fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();
  await page.getByLabel("Početak").fill("2026-01-01");
  await page.getByLabel("Uvjeti ugovora").fill("Otkazni rok 30 dana");
  await page.getByRole("button", { name: "Otvori ugovor" }).click();
  await expect(page.getByRole("heading", { name: /Ugovor NU-\d+\/2026/ })).toBeVisible();
  await bezVodoravnogPomicanja(page);

  await page.getByLabel("Kraj (prazno = na neodređeno)").fill("2027-12-31");
  await page.getByRole("button", { name: "Spremi ugovor" }).click();
  await expect(page.getByText("Spremljeno.")).toBeVisible();

  // uređaji sa skladišta, zatim skupna cijena za oba
  const p = test.info().project.name.toUpperCase();
  await page.getByLabel(/Serijski brojevi/).fill(`E2E-NAJAM-${p}-1\nE2E-NAJAM-${p}-2`);
  await page.getByLabel("Naplata od").fill("2026-01-01");
  await page.getByLabel("€/mj. bez PDV-a").fill("50,00");
  await page.getByRole("button", { name: "Dodaj na ugovor" }).click();
  await expect(page.getByText("Dodano uređaja: 2.")).toBeVisible();
  const tablica = page.getByTestId("uredaji-ugovora");
  await expect(tablica).toContainText(`E2E-NAJAM-${p}-1`);
  await expect(tablica).toContainText("50,00");
  await page.getByLabel("Odaberi sve").check();
  const cijena = page.getByRole("form", { name: "Nova cijena" });
  await cijena.getByLabel("€/mj. bez PDV-a").fill("60");
  await cijena.getByRole("button", { name: "Postavi cijenu" }).click();
  await expect(cijena.getByText("Cijena je postavljena za 2 uređaja.")).toBeVisible();

  // rate do tekućeg mjeseca: jedan račun, zatim nema ništa za izdati
  await expect(page.getByTestId("rate-za-izdati")).toContainText(`E2E-NAJAM-${p}-2`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj račun" }).click();
  await expect(page.getByText(/Izdan račun \d+\/PP1\/1/)).toBeVisible();
  await expect(page.getByText("Sve rate do tekućeg mjeseca su izdane.")).toBeVisible();
  await page.getByText(/Izdane rate/).click();
  await expect(page.getByTestId("izdane-rate").getByRole("link").first()).toHaveText(/\d+\/PP1\/1/);
  const adresa = page.url();
  await page.goto(`/uredaji/sn/E2E-NAJAM-${p}-1`);
  await expect(page.getByText("U najmu").first()).toBeVisible();
  await page.goto("/najam/rate");
  await expect(page.getByTestId("rate-po-ugovorima")).toBeVisible();
  await bezVodoravnogPomicanja(page);
  await page.goto(adresa);

  await page
    .getByLabel(/Datoteke/)
    .setInputFiles({ name: "potpisan-ugovor.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByTestId("prilozi")).toContainText("potpisan-ugovor.pdf");

  await page.getByLabel("Otkaz od (zadnji dan naplate)").fill("2026-12-31");
  await page.getByRole("button", { name: "Otkaži ugovor" }).click();
  await expect(page.getByText("Otkazan od 31.12.2026.")).toBeVisible();
  await page.getByRole("button", { name: "Poništi otkaz" }).click();
  await expect(page.getByRole("button", { name: "Otkaži ugovor" })).toBeVisible();

  const broj = (await page.getByRole("heading", { name: /Ugovor NU-/ }).textContent())!.replace("Ugovor ", "");
  await page.goto("/najam");
  await expect(page.getByTestId("popis-ugovora")).toContainText(broj);
});
