import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

test("promjena korisnika vidi se u dnevniku s razlikom", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/korisnici");
  await page.getByRole("link", { name: /Petar/ }).click();
  await expect(page).toHaveURL(/\/korisnici\/[0-9a-f-]{36}$/);
  const novoIme = `Petar ${test.info().project.name} ${Date.now() % 10000}`;
  await page.getByLabel("Ime i prezime").fill(novoIme);
  await page.getByRole("button", { name: "Spremi" }).click();
  await expect(page.getByText("Spremljeno.")).toBeVisible();

  await page.goto("/dnevnik");
  await bezVodoravnogPomicanja(page);
  const zapis = page
    .getByTestId("dnevnik")
    .getByRole("listitem")
    .filter({ hasText: `Izmijenjen korisnik ${novoIme}` });
  await expect(zapis).toBeVisible();
  await expect(zapis).toContainText(E2E.admin.ime);
  await zapis.getByText("promjena").click();
  await expect(zapis.getByRole("cell", { name: novoIme })).toBeVisible();

  await page.getByRole("searchbox").or(page.getByPlaceholder("opis, ime, vrijednost…")).fill(novoIme);
  await page.getByRole("button", { name: "Primijeni" }).click();
  await expect(page.getByTestId("dnevnik").getByRole("listitem")).toHaveCount(1);
});

test("prodavač nema dnevnik", async ({ page }) => {
  await prijaviSe(page, E2E.prodavac.email);
  await page.goto("/dnevnik");
  await expect(page).toHaveURL(/\/nema-pristupa$/);
});
