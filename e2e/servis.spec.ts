import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("servisni nalog: prijem kupčevog uređaja, status, zamjenski, dijagnoza, povrat", async ({ page }) => {
  const p = test.info().project.name.toUpperCase();
  await prijaviSe(page);
  await page.goto("/servis");
  await bezVodoravnogPomicanja(page);
  await page.goto(`/servis/novi?serijski=E2E-SERVIS-${p}`);
  await page.getByLabel("Opis kvara").fill("Ne pali se nakon pada napona");
  await page.getByLabel("Kontakt (osoba, telefon)").fill("Ivana, 091 000 000");
  await page.getByRole("button", { name: "Zaprimi na servis" }).click();
  await expect(page.getByRole("heading", { name: /Servisni nalog SRV-\d+\/2026/ })).toBeVisible();
  await expect(page.getByText("E2E Kupac d.o.o.")).toBeVisible();
  await bezVodoravnogPomicanja(page);

  const status = page.getByRole("form", { name: "Status naloga" });
  await status.getByLabel("Status").selectOption("POPRAVAK");
  await status.getByLabel("Poruka klijentu (neobavezno)").fill("Mijenjamo napajanje");
  await status.getByRole("button", { name: "Promijeni" }).click();
  const tijek = page.getByTestId("tijek-servisa");
  await expect(tijek).toContainText("U popravku: Mijenjamo napajanje");

  const zamjena = page.getByRole("form", { name: "Zamjenski uređaj" });
  await zamjena.getByLabel("Serijski zamjenskog (sa skladišta)").fill(`E2E-ZAMJENA-${p}`);
  await zamjena.getByRole("button", { name: "Izdaj zamjenski" }).click();
  await expect(page.getByText("klijent ima zamjenski")).toBeVisible();
  await expect(tijek).toContainText(`Izdan zamjenski uređaj E2E-ZAMJENA-${p}`);

  const dijagnoza = page.getByRole("form", { name: "Dijagnoza" });
  await dijagnoza.getByLabel("Dijagnoza (interno — klijent je nikad ne vidi)").fill("Pregorio kondenzator C12");
  await dijagnoza.getByRole("button", { name: "Spremi" }).click();
  await expect(tijek).toContainText("Dijagnoza izmijenjena");

  const kraj = page.getByRole("form", { name: "Završetak naloga" });
  await kraj.getByLabel("Skladište (povrat na skladište)").selectOption({ label: "Glavno skladište" });
  await kraj.getByRole("button", { name: "Završi nalog" }).click();
  await expect(page.getByText("Vraćen", { exact: true }).first()).toBeVisible();
  await expect(tijek).toContainText(`Vraćen zamjenski uređaj E2E-ZAMJENA-${p}`);
  await bezVodoravnogPomicanja(page);

  await page.goto(`/servis?trazi=E2E-SERVIS-${p}`);
  await expect(page.getByTestId("popis-servisa")).toContainText(`E2E-SERVIS-${p}`);
});
