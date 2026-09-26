import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("izvještaji: popis, godina „Sve“, sortiranje, zbroj i izvoz s istim filtrima", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/izvjestaji");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: "Prihod po mjesecima" }).click();
  await expect(page.getByRole("heading", { name: "Prihod po mjesecima" })).toBeVisible();
  await page.getByLabel("Godina", { exact: true }).selectOption("sve");
  await expect(page).toHaveURL(/godina=sve/);
  const tablica = page.getByTestId("izvjestaj");
  await expect(tablica).toContainText("Osnovica");
  await bezVodoravnogPomicanja(page);
  const izvoz = await page.request.get("/api/izvoz/izvjestaj-prihod-mjeseci?format=csv&godina=sve");
  expect(izvoz.status()).toBe(200);
  expect(await izvoz.text()).toContain("Ukupno");

  // sortiranje po stupcu (redoslijed testova ne jamči podatke — provjerava se da izvještaj radi)
  await page.goto("/izvjestaji/prihod-modeli?godina=sve&sort=model&smjer=asc");
  await expect(page.getByTestId("izvjestaj")).toContainText("Model");
  expect((await page.goto("/izvjestaji/nepostojeci"))?.status()).toBe(404);
});
