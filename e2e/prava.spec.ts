import { expect, test, type Page } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

async function otvoriIzbornik(page: Page) {
  const gumb = page.getByRole("button", { name: "Izbornik" });
  if (await gumb.isVisible()) await gumb.click();
}

test.describe("uloge i prava", () => {
  test("administrator vidi Korisnike i Uloge i dodaje korisnika", async ({ page }) => {
    await prijaviSe(page);
    await otvoriIzbornik(page);
    await page.getByRole("link", { name: "Korisnici" }).click();
    await expect(page.getByRole("heading", { name: "Korisnici" })).toBeVisible();

    const email = `novi-${test.info().project.name}-${Date.now()}@e2e.hr`;
    const obrazac = page.getByRole("form", { name: "Novi korisnik" });
    await obrazac.getByLabel("Ime i prezime").fill("Novi Skladištar");
    await obrazac.getByLabel("E-pošta").fill(email);
    await obrazac.getByLabel("Početna lozinka").fill("Pocetna-lozinka-1");
    await obrazac.getByLabel("Uloga").selectOption({ label: "Skladištar" });
    await obrazac.getByRole("button", { name: "Dodaj korisnika" }).click();
    await expect(page.getByText("Korisnik je dodan.")).toBeVisible();
    await expect(page.getByTestId("popis-korisnika")).toContainText(email);
  });

  test("uloga Administrator je samo za pregled", async ({ page }) => {
    await prijaviSe(page);
    await page.goto("/uloge");
    await page.getByRole("link", { name: /^Administrator/ }).click();
    await expect(page.getByText("ne može se mijenjati")).toBeVisible();
    await expect(page.getByRole("button", { name: "Spremi" })).toHaveCount(0);
  });

  test("prodavač ne vidi Korisnike u izborniku i ne može otvoriti stranicu", async ({ page }) => {
    await prijaviSe(page, E2E.prodavac.email);
    await otvoriIzbornik(page);
    await expect(page.getByRole("navigation", { name: "Glavni izbornik" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Korisnici" })).toHaveCount(0);
    await page.goto("/korisnici");
    await expect(page).toHaveURL(/\/nema-pristupa$/);
    await page.goto(`/uloge/nova`);
    await expect(page).toHaveURL(/\/nema-pristupa$/);
  });

  test("na mobitelu izbornik se otvara i zatvara (Esc)", async ({ page }) => {
    test.skip(test.info().project.name !== "mobitel", "samo mobitel");
    await prijaviSe(page);
    await page.getByRole("button", { name: "Izbornik" }).click();
    await expect(page.getByRole("link", { name: "Uloge i prava" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Uloge i prava" })).toBeHidden();
  });
});

test("stranice prava stanu na ekran", async ({ page }) => {
  await prijaviSe(page);
  for (const put of ["/korisnici", "/uloge", "/uloge/nova"]) {
    await page.goto(put);
    await bezVodoravnogPomicanja(page);
  }
  await page.goto("/uloge");
  await page.getByRole("link", { name: /^Voditelj/ }).click();
  await expect(page).toHaveURL(/\/uloge\/[0-9a-f-]{36}$/);
  await bezVodoravnogPomicanja(page);
  await page.goto("/korisnici");
  await page.getByRole("link", { name: /Petar/ }).click();
  await expect(page).toHaveURL(/\/korisnici\/[0-9a-f-]{36}$/);
  await bezVodoravnogPomicanja(page);
});
