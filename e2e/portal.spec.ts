import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./podaci";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

async function prijaviKlijenta(page: Page, email = E2E.klijent.email) {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/prijava$/);
  await page.getByLabel("E-pošta").fill(email);
  await page.getByLabel("Lozinka").fill(E2E.klijent.lozinka);
  await page.getByRole("button", { name: "Prijava" }).click();
  await expect(page.getByRole("heading", { name: "Vaši uređaji" })).toBeVisible();
}

test("portal: prijava klijenta, uređaji s jamstvom, tuđi uređaj nedostupan, program zatvoren", async ({ page, browser }) => {
  // id tuđeg uređaja (iz programa, kao da ga je napadač nekako saznao)
  await prijaviSe(page);
  await page.goto("/uredaji?trazi=E2E-TUDJI-1");
  const tudji = await page.getByRole("link", { name: "E2E-TUDJI-1" }).first().getAttribute("href");
  expect(tudji).toMatch(/^\/uredaji\/[0-9a-f-]{36}$/);

  const klijent = await browser.newPage({ viewport: page.viewportSize()! });
  await prijaviKlijenta(klijent);
  const popis = klijent.getByTestId("uredaji-klijenta");
  await expect(popis).toContainText("E2E-PORTAL-1");
  await expect(popis).toContainText("jamstvo do 01. 01. 2030.");
  await expect(popis).not.toContainText("E2E-TUDJI-1");
  await bezVodoravnogPomicanja(klijent);
  await klijent.getByRole("link", { name: "E2E-PORTAL-1" }).click();
  await expect(klijent.getByRole("heading", { name: "E2E-PORTAL-1" })).toBeVisible();
  await bezVodoravnogPomicanja(klijent);

  // napad: tuđi uređaj po id-u → ne postoji
  const odgovor = await klijent.goto(tudji!.replace("/uredaji/", "/portal/uredaji/"));
  expect(odgovor?.status()).toBe(404);
  // kolačić portala ne otvara program
  await klijent.goto("/uredaji");
  await expect(klijent).toHaveURL(/\/prijava/);

  await klijent.goto("/portal");
  await klijent.getByRole("button", { name: "Odjava" }).click();
  await expect(klijent).toHaveURL(/\/portal\/prijava$/);
  await klijent.goto("/portal");
  await expect(klijent).toHaveURL(/\/portal\/prijava$/);
  await klijent.close();
});

test("portal: prijava kvara s fotografijom, servis zaprima, klijent vidi napomenu ali ne dijagnozu", async ({ page, browser }) => {
  const p = test.info().project.name.toUpperCase();
  const klijent = await browser.newPage({ viewport: page.viewportSize()! });
  await prijaviKlijenta(klijent);
  await klijent.getByRole("link", { name: "Prijava kvara" }).first().click();
  const obrazac = klijent.getByRole("form", { name: "Prijava kvara" });
  await obrazac.getByLabel("Uređaj").selectOption({ label: `E2E-KVAR-${p} · E2E Laptop 14` });
  await obrazac.getByLabel("Opis kvara").fill("Tipkovnica ne radi nakon prolijevanja");
  await obrazac
    .getByLabel(/Fotografije/)
    .setInputFiles({ name: "tipkovnica.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await obrazac.getByRole("button", { name: "Pošalji prijavu" }).click();
  await expect(klijent.getByRole("heading", { name: /Servisni nalog SRV-/ })).toBeVisible();
  await expect(klijent.getByText("Prijavljen", { exact: true })).toBeVisible();
  await expect(klijent.getByTestId("prilozi-klijenta")).toContainText("tipkovnica.png");
  await bezVodoravnogPomicanja(klijent);
  const adresaNaloga = klijent.url();

  // servis: zaprimi, interna dijagnoza, napomena klijentu
  await prijaviSe(page);
  await page.goto(`/servis?trazi=E2E-KVAR-${p}`);
  await page.getByTestId("popis-servisa").getByRole("link").first().click();
  await page.getByRole("form", { name: "Zaprimanje prijavljenog uređaja" }).getByRole("button", { name: "Zaprimi uređaj" }).click();
  await expect(page.getByRole("form", { name: "Status naloga" })).toBeVisible();
  const dijagnoza = page.getByRole("form", { name: "Dijagnoza" });
  await dijagnoza.getByLabel("Dijagnoza (interno — klijent je nikad ne vidi)").fill("INTERNO: oksidacija ploče");
  await dijagnoza.getByLabel("Napomena klijentu (vidi se na portalu)").fill("Mijenjamo tipkovnicu, gotovo sutra");
  await dijagnoza.getByRole("button", { name: "Spremi" }).click();
  await expect(page.getByTestId("tijek-servisa")).toContainText("Napomena: Mijenjamo tipkovnicu");

  await klijent.goto(adresaNaloga);
  await expect(klijent.getByTestId("napomena-servisa")).toHaveText("Mijenjamo tipkovnicu, gotovo sutra");
  await expect(klijent.getByTestId("tijek-klijenta")).toContainText("Uređaj zaprimljen na servis");
  await expect(klijent.locator("body")).not.toContainText("INTERNO");
  const pdf = await klijent.request.get(`${adresaNaloga}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await klijent.close();
});

test("pristup portalu na partneru: dodaj, poveznica za lozinku, isključenje odmah odjavljuje", async ({ page, browser }) => {
  const p = test.info().project.name.toLowerCase();
  const email = `novi-${p}@e2e.hr`;
  await prijaviSe(page);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/partneri?trazi=E2E%20Kupac");
  await page.getByRole("link", { name: "E2E Kupac d.o.o." }).first().click();
  const novi = page.getByRole("form", { name: "Novi klijent na portalu" });
  await novi.getByLabel("Ime i prezime").fill(`Novi ${p}`);
  await novi.getByLabel("E-pošta").fill(email);
  await novi.getByRole("button", { name: "Dodaj pristup" }).click();
  const poveznica = await novi.getByTestId("tajna-vrijednost").textContent();
  expect(poveznica).toMatch(/\/portal\/lozinka\/[\w-]{40,}$/);
  await expect(page.getByTestId("klijenti-portala")).toContainText(email);
  await bezVodoravnogPomicanja(page);

  const klijent = await browser.newPage({ viewport: page.viewportSize()! });
  await klijent.goto(poveznica!);
  await klijent.getByLabel("Nova lozinka").fill(E2E.klijent.lozinka);
  await klijent.getByLabel("Ponovite lozinku").fill(E2E.klijent.lozinka);
  await klijent.getByRole("button", { name: "Postavi lozinku" }).click();
  await expect(klijent.getByText("Lozinka je postavljena.")).toBeVisible();
  await bezVodoravnogPomicanja(klijent);
  await prijaviKlijenta(klijent, email);

  // isključenje na partneru → klijentova sljedeća stranica je prijava
  const redak = page.getByTestId("klijenti-portala").locator("li", { hasText: email });
  await redak.getByRole("button", { name: "Isključi" }).click();
  await expect(redak.getByText("isključen", { exact: true })).toBeVisible();
  await klijent.goto("/portal");
  await expect(klijent).toHaveURL(/\/portal\/prijava$/);
  await klijent.close();
});
