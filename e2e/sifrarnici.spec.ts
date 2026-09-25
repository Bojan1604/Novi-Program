import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

test("administrator dodaje proizvođača i model; dupli naziv se odbija; deaktivacija", async ({ page }) => {
  const oznaka = `${test.info().project.name}-${Date.now() % 100000}`;
  await prijaviSe(page);
  await page.goto("/sifrarnici");
  await bezVodoravnogPomicanja(page);
  await page.getByRole("link", { name: /Proizvođači/ }).click();
  await page.getByRole("link", { name: "Novi zapis" }).click();
  await expect(page).toHaveURL(/\/novi$/);
  await page.getByLabel("Naziv", { exact: true }).fill(`Lenovo ${oznaka}`);
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page).toHaveURL(/\/sifrarnici\/proizvodjaci$/);
  await expect(page.getByTestId("popis-sifrarnika")).toContainText(`Lenovo ${oznaka}`);

  // isti naziv drugim slovima
  await page.getByRole("link", { name: "Novi zapis" }).click();
  await expect(page).toHaveURL(/\/novi$/);
  await page.getByLabel("Naziv", { exact: true }).fill(`LENOVO ${oznaka.toUpperCase()}`);
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("već postoji");

  // model s cijenom u hrvatskom zapisu i KPD-om
  await page.goto("/sifrarnici/modeli/novi");
  await bezVodoravnogPomicanja(page);
  await page.getByLabel("Proizvođač").selectOption({ label: `Lenovo ${oznaka}` });
  await page.getByLabel("Naziv", { exact: true }).fill("ThinkPad T14");
  await page.getByLabel("Kategorija").selectOption({ label: "Prijenosno računalo" });
  await page.getByLabel("KPD za prodaju").fill("262011");
  await page.getByLabel(/Preporučena cijena/).fill("abc");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByText("Iznos nije ispravan broj.")).toBeVisible();
  await page.getByLabel(/Preporučena cijena/).fill("1.099,90");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page).toHaveURL(/\/sifrarnici\/modeli$/);
  const red = page.getByTestId("popis-sifrarnika").locator("tr", { hasText: `Lenovo ${oznaka}` });
  await expect(red).toContainText("1.099,90 €");
  await expect(red).toContainText("26.20.11");

  // deaktivacija
  await red.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/sifrarnici\/modeli\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Deaktiviraj" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deaktivirano." })).toBeVisible();
  await page.goto("/sifrarnici/modeli");
  await expect(page.getByTestId("popis-sifrarnika")).not.toContainText(`Lenovo ${oznaka}`);
  await page.goto("/sifrarnici/modeli?aktivnost=neaktivni");
  await expect(page.getByTestId("popis-sifrarnika")).toContainText("deaktiviran");
});

test("prodavač samo pregledava šifrarnike i ne vidi maržu", async ({ page }) => {
  await prijaviSe(page, E2E.prodavac.email);
  await page.goto("/sifrarnici/modeli");
  await expect(page.getByRole("link", { name: "Novi zapis" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: /marža/i })).toHaveCount(0);
  await page.goto("/sifrarnici/modeli/novi");
  await expect(page.getByRole("heading", { name: /404|nije pronađena/i }).or(page.getByText("404"))).toBeVisible();
});

test("izvoz bez prava vraća 403 i ne otkriva podatke", async ({ page }) => {
  await prijaviSe(page, E2E.prodavac.email);
  const odgovor = await page.request.get("/api/izvoz/dnevnik?format=csv");
  expect(odgovor.status()).toBe(403);
  expect(await odgovor.text()).not.toContain(";");
  const nepoznat = await page.request.get("/api/izvoz/korisnici?format=constructor");
  expect([400, 403]).toContain(nepoznat.status());
});
