import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("provjera dosljednosti: sažetak i sve vrste provjera", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/provjera");
  await expect(page.getByRole("heading", { name: "Provjera dosljednosti" })).toBeVisible();
  await expect(page.getByTestId("sazetak")).toHaveText(/Sve je dosljedno|Odstupanja: \d+/);
  await expect(page.getByRole("heading", { name: /Zaprimljena količina na narudžbenici/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /U najmu bez aktivnog ugovora/ })).toBeVisible();
  await bezVodoravnogPomicanja(page);
});
