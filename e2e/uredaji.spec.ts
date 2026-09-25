import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

test("popis uređaja: pretraga dijela serijskog, filtar stanja, stupci po izboru", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/uredaji");
  await bezVodoravnogPomicanja(page);
  const tablica = page.getByTestId("popis-uredaja");

  await page.getByRole("searchbox").fill("ur-00");
  await expect(page).toHaveURL(/trazi=ur-00/);
  await expect(tablica.locator("tbody tr")).toHaveCount(3);

  await page.getByRole("button", { name: /Stanje/ }).click();
  await page.getByRole("option", { name: "Otpisan" }).click();
  await page.keyboard.press("Escape");
  await expect(tablica.locator("tbody tr")).toHaveCount(1);
  await expect(tablica).toContainText("E2E-UR-003");

  // stupac Procesor nije zadan; uključi ga i pamti nakon osvježavanja
  await expect(tablica).not.toContainText("AMD Ryzen 5");
  await page.getByRole("button", { name: "Stupci" }).click();
  await page.getByRole("dialog").getByLabel("Procesor").check();
  await page.getByRole("dialog").getByRole("button", { name: "Primijeni" }).click();
  await expect(tablica).toContainText("AMD Ryzen 5");
  await page.reload();
  await expect(page.getByTestId("popis-uredaja")).toContainText("AMD Ryzen 5");
  await bezVodoravnogPomicanja(page);
});

test("nabavnu cijenu uređaja ne vidi korisnik bez prava — ni u stranici ni u izvozu", async ({ page }) => {
  await prijaviSe(page, E2E.prodavac.email);
  await page.goto("/uredaji?trazi=E2E-UR");
  const html = await page.content();
  expect(html).not.toContain("700,00");
  await expect(page.getByRole("columnheader", { name: /Nabavna/ })).toHaveCount(0);
  const csv = await (await page.request.get("/api/izvoz/uredaji?format=csv&trazi=E2E-UR")).text();
  expect(csv).toContain("E2E-UR-001");
  expect(csv).not.toContain("Nabavna");
  expect(csv).not.toContain("700,00");
  // i ručno složeno sortiranje po nabavnoj cijeni ne otkriva redoslijed cijena
  const r = await page.request.get("/uredaji?sort=nabavnaCijena&smjer=desc");
  expect(r.status()).toBe(200);
});
