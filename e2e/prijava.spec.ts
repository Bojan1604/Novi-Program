import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

test.describe("prijava", () => {
  test("bez prijave svaka stranica vodi na prijavu i pamti kamo se išlo", async ({ page }) => {
    await page.goto("/?stranica=2");
    await expect(page).toHaveURL(/\/prijava\?dalje=%2F%3Fstranica%3D2$/);
    await page.getByLabel("E-pošta").fill(E2E.admin.email);
    await page.getByLabel("Lozinka").fill(E2E.admin.lozinka);
    await page.getByRole("button", { name: "Prijava" }).click();
    await expect(page).toHaveURL(/\/\?stranica=2$/);
  });

  test("kriva lozinka: poruka, e-pošta ostaje upisana", async ({ page }) => {
    await page.goto("/prijava");
    await page.getByLabel("E-pošta").fill(E2E.admin.email);
    await page.getByLabel("Lozinka").fill("kriva-lozinka");
    await page.getByRole("button", { name: "Prijava" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Neispravna e-pošta ili lozinka.");
    await expect(page.getByLabel("E-pošta")).toHaveValue(E2E.admin.email);
  });

  test("prijava, rad kroz više klikova, odjava", async ({ page, context }) => {
    await prijaviSe(page);
    await expect(page.getByTestId("firma")).toHaveText(E2E.firma);
    await expect(page.getByRole("heading", { name: `Dobro došli, ${E2E.admin.ime}` })).toBeVisible();

    // kolačić: httpOnly, preko http-a nije Secure (inače mobitel na lokalnoj mreži gubi prijavu)
    const kolacic = (await context.cookies()).find((c) => c.name === "erp_sesija");
    expect(kolacic?.httpOnly).toBe(true);
    expect(kolacic?.secure).toBe(false);
    expect(kolacic?.sameSite).toBe("Lax");

    for (let i = 0; i < 5; i++) {
      await page.reload();
      await expect(page.getByRole("button", { name: "Odjava" })).toBeVisible();
    }

    await page.getByRole("button", { name: "Odjava" }).click();
    await expect(page).toHaveURL(/\/prijava$/);
    await page.goBack();
    await page.reload();
    await expect(page).toHaveURL(/\/prijava/);
  });

  test("prijavljen korisnik na /prijava ide na početnu", async ({ page }) => {
    await prijaviSe(page);
    await page.goto("/prijava");
    await expect(page).toHaveURL(/\/$/);
  });

  test("dvostruki klik na Prijava ne radi dvije sesije niti grešku", async ({ page }) => {
    await page.goto("/prijava");
    await page.getByLabel("E-pošta").fill(E2E.admin.email);
    await page.getByLabel("Lozinka").fill(E2E.admin.lozinka);
    await page.getByRole("button", { name: "Prijava" }).dblclick();
    await expect(page.getByRole("button", { name: "Odjava" })).toBeVisible();
  });

  test("nakon 5 pogrešnih pokušaja račun je privremeno zaključan", async ({ page }) => {
    test.skip(test.info().project.name !== "racunalo", "jednom je dovoljno (dijeli bazu)");
    await page.goto("/prijava");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("E-pošta").fill(E2E.zakljucavanje.email);
      await page.getByLabel("Lozinka").fill(`kriva-${i}-lozinka`);
      await page.getByRole("button", { name: "Prijava" }).click();
      await expect(page.locator("form").getByRole("alert")).toBeVisible();
    }
    await page.getByLabel("Lozinka").fill(E2E.admin.lozinka);
    await page.getByRole("button", { name: "Prijava" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Previše neuspjelih pokušaja");
  });

  test("na mobitelu nema vodoravnog pomicanja", async ({ page }) => {
    await page.goto("/prijava");
    await bezVodoravnogPomicanja(page);
    await prijaviSe(page);
    await bezVodoravnogPomicanja(page);
  });
});
