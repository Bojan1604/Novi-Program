import { expect, type Page } from "@playwright/test";
import { E2E } from "./podaci";

export async function prijaviSe(page: Page, email = E2E.admin.email, lozinka = E2E.admin.lozinka): Promise<void> {
  await page.goto("/prijava");
  await page.getByLabel("E-pošta").fill(email);
  await page.getByLabel("Lozinka").fill(lozinka);
  await page.getByRole("button", { name: "Prijava" }).click();
  await expect(page.getByRole("button", { name: "Odjava" })).toBeVisible();
}

/** Stranica ne smije biti šira od ekrana (mobitel bi je inače smanjio ili pomicao vodoravno). */
export async function bezVodoravnogPomicanja(page: Page): Promise<void> {
  const sirinaEkrana = page.viewportSize()!.width;
  const sirinaStranice = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sirinaStranice, `stranica ${page.url()} je šira od ekrana`).toBeLessThanOrEqual(sirinaEkrana);
}
