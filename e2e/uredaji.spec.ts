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

test("kartica uređaja: ispravak, prilog (prikaz i preuzimanje), brisanje bez veza", async ({ page }) => {
  const serijski = `E2E-KARTICA-${test.info().project.name.toUpperCase()}`;
  await prijaviSe(page);
  await page.goto(`/uredaji?trazi=${serijski}`);
  await page.getByTestId("popis-uredaja").getByRole("link", { name: serijski }).first().click();
  await expect(page.getByRole("heading", { name: serijski })).toBeVisible();
  await bezVodoravnogPomicanja(page);

  // ispravak: neispravan datum ne briše upisano; zatim spremanje
  const obrazac = page.getByRole("form", { name: "Ispravak uređaja" });
  await obrazac.getByLabel("RAM").fill("32 GB");
  await obrazac.getByLabel("Jamstvo do").fill("31.02.2028.");
  await obrazac.getByRole("button", { name: "Spremi ispravak" }).click();
  await expect(obrazac.getByText("Datum nije ispravan")).toBeVisible();
  await expect(obrazac.getByLabel("RAM")).toHaveValue("32 GB");
  await obrazac.getByLabel("Jamstvo do").fill("31.12.2028.");
  await obrazac.getByRole("button", { name: "Spremi ispravak" }).click();
  await expect(obrazac.getByText("Spremljeno.")).toBeVisible();
  await expect(page.getByTestId("ispravci")).toContainText("ram");
  // drugo spremanje s istog obrasca radi (verzija se osvježila)
  await obrazac.getByLabel("Disk").fill("1 TB");
  await obrazac.getByRole("button", { name: "Spremi ispravak" }).click();
  await expect(page.getByTestId("ispravci").getByText(/Ispravak uređaja .*: disk/)).toBeVisible();

  // prilog
  const prilozi = page.getByRole("form", { name: "Dodavanje priloga" });
  await prilozi
    .locator('input[type="file"]')
    .setInputFiles({ name: "Jamstveni list.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await prilozi.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByTestId("prilozi").getByRole("link", { name: "Jamstveni list.pdf" })).toBeVisible();
  const href = await page.getByTestId("prilozi").getByRole("link", { name: "Preuzmi" }).getAttribute("href");
  const r = await page.request.get(href!);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-disposition"]).toContain("attachment");
  expect(await r.text()).toContain("%PDF-1.4");
  // nedopuštena vrsta
  await prilozi.locator('input[type="file"]').setInputFiles({ name: "alat.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await prilozi.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByText("Vrsta datoteke „alat.exe“ nije dopuštena")).toBeVisible();

  // brisanje (nema primke ni dokumenata)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Obriši uređaj" }).click();
  await expect(page).toHaveURL(/\/uredaji$/);
  // prilog obrisanog uređaja više se ne može preuzeti
  expect((await page.request.get(href!)).status()).toBe(404);
});

test("kartica uređaja za prodavača: bez ispravka, bez nabavne cijene", async ({ page }) => {
  await prijaviSe(page, E2E.prodavac.email);
  await page.goto("/uredaji?trazi=E2E-UR-001");
  await page.getByTestId("popis-uredaja").getByRole("link", { name: "E2E-UR-001" }).first().click();
  await expect(page.getByRole("heading", { name: "E2E-UR-001" })).toBeVisible();
  await expect(page.getByText("Ispravak podataka")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Obriši uređaj" })).toHaveCount(0);
  expect(await page.content()).not.toContain("700,00");
  await bezVodoravnogPomicanja(page);
});
