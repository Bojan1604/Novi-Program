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

  await page
    .getByLabel(/Datoteke/)
    .setInputFiles({ name: "potpisan-ugovor.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await page.getByRole("button", { name: "Dodaj" }).click();
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
