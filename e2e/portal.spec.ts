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
