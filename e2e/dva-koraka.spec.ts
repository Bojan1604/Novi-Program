import { expect, test } from "@playwright/test";
import { kodZaKorak, korak } from "../src/lib/totp";
import { E2E } from "./podaci";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("prijava u dva koraka: uključivanje (lozinka + kod), rezervni kodovi, prijava s kodom", async ({ page }) => {
  const email = `dvakoraka-${test.info().project.name}@e2e.hr`;
  await prijaviSe(page, email);
  await page.goto("/moj-racun");
  const kartica = page.getByTestId("dva-koraka");
  await kartica.getByLabel("Lozinka").fill(E2E.admin.lozinka);
  await kartica.getByRole("button", { name: "Uključi prijavu u dva koraka" }).click();
  const tajna = (await kartica.getByTestId("totp-tajna").textContent())!.trim();
  await bezVodoravnogPomicanja(page);
  await kartica.getByLabel("Kod iz aplikacije").fill(kodZaKorak(tajna, korak(new Date())));
  await kartica.getByRole("button", { name: "Potvrdi i uključi" }).click();
  await expect(kartica.getByTestId("rezervni-kodovi").locator("li")).toHaveCount(10);

  await page.getByRole("button", { name: "Odjava" }).click();
  await page.goto("/prijava");
  await page.getByLabel("E-pošta").fill(email);
  await page.getByLabel("Lozinka").fill(E2E.admin.lozinka);
  await page.getByRole("button", { name: "Prijava" }).click();
  await expect(page).toHaveURL(/\/prijava\/kod/);
  // bez koda nema pristupa programu
  await page.goto("/racuni");
  await expect(page).toHaveURL(/\/prijava/);
  await page.goto("/prijava/kod");
  await page.getByLabel("Kod").fill("000000");
  await page.getByRole("button", { name: "Potvrdi" }).click();
  await expect(page.getByText("Kod nije ispravan.")).toBeVisible();
  // sljedeći vremenski korak (kod korišten pri uključivanju ne prolazi ponovno)
  await page.getByLabel("Kod").fill(kodZaKorak(tajna, korak(new Date()) + 1));
  await page.getByRole("button", { name: "Potvrdi" }).click();
  await expect(page.getByRole("button", { name: "Odjava" })).toBeVisible();
});
