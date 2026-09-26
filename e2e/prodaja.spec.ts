import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("ponuda: kupac, model i usluga, zbrojevi uživo, izdavanje, predračun i račun bez gubitka", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/ponude");
  await page.getByRole("link", { name: "Nova ponuda" }).click();
  await expect(page.getByRole("heading", { name: "Nova ponuda" })).toBeVisible();
  await bezVodoravnogPomicanja(page);

  const kupac = page.getByRole("combobox", { name: "Kupac" });
  await kupac.fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();

  const model = page.getByRole("combobox", { name: "Model (bez serijskog)" });
  await model.fill("E2E Laptop");
  await page.getByRole("option", { name: /E2E Laptop 14/ }).click();
  await expect(page.getByLabel("Cijena stavke 1")).toHaveValue("1.000,00");
  await page.getByLabel("Količina stavke 1").fill("2");
  await page.getByLabel("Popust stavke 1").fill("10");

  await page.getByLabel("Vrsta", { exact: true }).selectOption("USLUGA");
  const usluga = page.getByRole("combobox", { name: "Usluga" });
  await usluga.fill("E2E Instal");
  await page.getByRole("option", { name: /E2E Instalacija/ }).click();
  await page.getByLabel("Količina stavke 2").fill("1,5");

  // 2 × 1.000 − 10 % = 1.800,00 + 1,5 × 40,00 = 60,00 → 1.860,00 + PDV 465,00 = 2.325,00
  const zbrojevi = page.getByTestId("zbrojevi");
  await expect(zbrojevi).toContainText("1.860,00 €");
  await expect(zbrojevi).toContainText("2.325,00 €");
  await bezVodoravnogPomicanja(page);

  // neispravna količina ne briše upisano
  await page.getByLabel("Količina stavke 2").fill("abc");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page.getByText(/Stavka 2: Količina nije ispravna/)).toBeVisible();
  await page.getByLabel("Količina stavke 2").fill("1,5");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page).toHaveURL(/\/ponude\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Ponuda (nacrt)" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj ponuda" }).click();
  await expect(page.getByRole("heading", { name: /Ponuda PON-\d+\/\d{4}/ })).toBeVisible();
  await expect(page.getByTestId("zbrojevi")).toContainText("2.325,00 €");

  await page.getByRole("button", { name: "Napravi predračun" }).click();
  await expect(page.getByRole("heading", { name: "Predračun (nacrt)" })).toBeVisible();
  await expect(page.getByTestId("zbrojevi")).toContainText("2.325,00 €");
  await expect(page.getByLabel("Količina stavke 2")).toHaveValue("1,5");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj predračun" }).click();
  await expect(page.getByRole("heading", { name: /Predračun PRED-/ })).toBeVisible();
  await expect(page.getByText(/iz: Ponuda PON-/)).toBeVisible();
});

test("račun: skenirani uređaj, izdavanje s brojem, uređaj prodan, izdani se ne mijenja", async ({ page }) => {
  const serijski = `E2E-PRODAJA-${test.info().project.name.toUpperCase()}`;
  await prijaviSe(page);
  await page.goto("/racuni");
  await page.getByRole("link", { name: "Novi račun" }).click();
  await expect(page.getByRole("heading", { name: "Novi račun" })).toBeVisible();
  await page.getByRole("combobox", { name: "Kupac" }).fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();
  const polje = page.getByLabel("Serijski broj uređaja");
  await polje.fill(serijski.toLowerCase());
  await polje.press("Enter");
  await expect(page.getByLabel("Naziv stavke 1")).toHaveValue("E2E Proizvođač E2E Laptop 14");
  await expect(page.getByTestId("zbrojevi")).toContainText("1.250,00 €");
  await page.getByLabel("Način plaćanja").selectOption("G");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page).toHaveURL(/\/racuni\/[0-9a-f-]{36}$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj račun" }).click();
  await expect(page.getByRole("heading", { name: /Račun \d+\/PP1\/1/ })).toBeVisible();
  await expect(page.getByTestId("stavke-dokumenta")).toContainText(`S/N: ${serijski}`);
  // gotovina → fiskaliziran (demo način: ZKI i izmišljeni JIR)
  const fisk = page.getByTestId("fiskalizacija");
  await expect(fisk).toContainText("fiskaliziran");
  await expect(fisk).toContainText(/ZKI: [0-9a-f]{32}/);
  await expect(fisk).toContainText(/JIR: [0-9a-f-]{36}/);
  const pdf = await page.request.get((await page.getByRole("link", { name: "PDF" }).getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Spremi nacrt" })).toHaveCount(0);

  // plaćanje: djelomično 1.000,00 → otvoreno 250,00; zatim 300,00 → preplata 50,00; povrat 50,00 → plaćen
  const unos = page.getByRole("form", { name: "Upis uplate" });
  const stanjePl = page.getByTestId("stanje-placanja");
  await expect(unos.getByLabel("Iznos (€)")).toHaveValue("1.250,00");
  await unos.getByLabel("Iznos (€)").fill("1.000,00");
  await unos.getByRole("button", { name: "Upiši uplatu" }).click();
  await expect(stanjePl).toContainText("Otvoreno250,00 €");
  await page.getByRole("form", { name: "Upis uplate" }).getByLabel("Iznos (€)").fill("300");
  await page.getByRole("form", { name: "Upis uplate" }).getByRole("button", { name: "Upiši uplatu" }).click();
  await expect(stanjePl).toContainText("Za povrat kupcu50,00 €");
  await expect(page.getByRole("form", { name: "Upis uplate" }).getByLabel("Iznos povrata (€)")).toHaveValue("50,00");
  await page.getByRole("form", { name: "Upis uplate" }).getByRole("button", { name: "Upiši povrat kupcu" }).click();
  await expect(page.getByRole("heading", { name: "Plaćanje · Plaćen" })).toBeVisible();
  await expect(page.getByTestId("uplate").locator("li")).toHaveCount(3);

  // e-pošta: predložak „Potvrda plaćanja“ jer je račun plaćen; slanje (testni prijevoz) i zapis
  const eposta = page.getByRole("group", { name: "Slanje e-poštom" });
  await expect(eposta.getByLabel("Predložak")).toHaveValue("PLACEN");
  await expect(eposta.getByLabel("Predmet")).toHaveValue(/je plaćen/);
  await eposta.getByLabel("Prima").fill("kupac@e2e.hr");
  await eposta.getByRole("button", { name: "Pošalji s PDF-om" }).click();
  await expect(eposta.getByText("Poslano.")).toBeVisible();
  await expect(page.getByTestId("slanja")).toContainText("kupac@e2e.hr");

  await page.goto(`/uredaji/sn/${serijski}`);
  await expect(page.getByText("Prodan").first()).toBeVisible();
  await expect(page.getByTestId("povijest")).toContainText(/Račun \d+\/PP1\/1/);
  await bezVodoravnogPomicanja(page);
});

async function izdajRacunZa(page: import("@playwright/test").Page, dodaj: () => Promise<void>) {
  await page.goto("/racuni/nova");
  await page.getByRole("combobox", { name: "Kupac" }).fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();
  await dodaj();
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page).toHaveURL(/\/racuni\/[0-9a-f-]{36}$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj račun" }).click();
  await expect(page.getByRole("heading", { name: /Račun \d+\/PP1\/1/ })).toBeVisible();
}

test("storno računa vraća uređaj na odabrano skladište", async ({ page }) => {
  const serijski = `E2E-STORNO-${test.info().project.name.toUpperCase()}`;
  await prijaviSe(page);
  await izdajRacunZa(page, async () => {
    await page.getByLabel("Serijski broj uređaja").fill(serijski);
    await page.getByLabel("Serijski broj uređaja").press("Enter");
    await expect(page.getByLabel("Naziv stavke 1")).toHaveValue(/E2E Laptop 14/);
  });
  await page.getByLabel("Skladište za vraćene uređaje").selectOption({ label: "E2E Split" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Storniraj" }).click();
  await expect(page.getByRole("heading", { name: /Storno računa \d+\/PP1\/1/ })).toBeVisible();
  await expect(page.getByTestId("zbrojevi")).toContainText("-1.250,00 €");
  await page.goto(`/uredaji/sn/${serijski}`);
  await expect(page.getByText("Na skladištu").first()).toBeVisible();
  await expect(page.getByText("E2E Split").first()).toBeVisible();
});

test("odobrenje za dio usluge; ostatak se ne može prijeći", async ({ page }) => {
  await prijaviSe(page);
  await izdajRacunZa(page, async () => {
    await page.getByLabel("Vrsta", { exact: true }).selectOption("USLUGA");
    await page.getByRole("combobox", { name: "Usluga" }).fill("E2E Instal");
    await page.getByRole("option", { name: /E2E Instalacija/ }).click();
    await page.getByLabel("Količina stavke 1").fill("2");
    await page.getByLabel("KPD stavke 1").fill("62.09.20");
  });
  await page.getByRole("button", { name: "Odobrenje" }).click();
  await expect(page.getByRole("heading", { name: "Odobrenje (nacrt)" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Dodavanje stavke" })).toHaveCount(0);
  await expect(page.getByLabel("Količina stavke 1")).toHaveValue("-2");
  await page.getByLabel("Količina stavke 1").fill("-3");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page.getByText("Spremljeno.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj odobrenje" }).click();
  await expect(page.getByText("odobrava se više nego što je bilo na računu")).toBeVisible();
  await page.getByLabel("Količina stavke 1").fill("-1");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page.getByText("Spremljeno.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj odobrenje" }).click();
  await expect(page.getByRole("heading", { name: /Odobrenje \d+\/PP1\/1/ })).toBeVisible();
  await expect(page.getByTestId("zbrojevi")).toContainText("-50,00 €");
  await expect(page.getByTestId("stanje-placanja")).toContainText("Za povrat kupcu50,00 €");
});

test("račun za predujam i odbitak na konačnom računu", async ({ page }) => {
  await prijaviSe(page);
  const rucna = async (naziv: string, cijena: string) => {
    await page.getByRole("button", { name: "Ručna stavka" }).click();
    await page.getByLabel("Naziv stavke 1").fill(naziv);
    await page.getByLabel("Cijena stavke 1").fill(cijena);
    await page.getByLabel("KPD stavke 1").fill("26.20.11");
  };
  await page.goto("/racuni");
  await page.getByRole("link", { name: "Račun za predujam" }).click();
  await expect(page.getByRole("heading", { name: "Novi račun za predujam" })).toBeVisible();
  await page.getByRole("combobox", { name: "Kupac" }).fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();
  await rucna("Predujam za opremu", "400");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page).toHaveURL(/\/racuni\/[0-9a-f-]{36}$/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj račun za predujam" }).click();
  const naslov = page.getByRole("heading", { name: /Račun za predujam \d+\/PP1\/1/ });
  await expect(naslov).toBeVisible();
  const brojPredujma = ((await naslov.textContent()) ?? "").replace("Račun za predujam ", "");

  await page.goto("/racuni/nova");
  await page.getByRole("combobox", { name: "Kupac" }).fill("E2E Kupac");
  await page.getByRole("option", { name: /E2E Kupac d\.o\.o\./ }).click();
  await rucna("Oprema", "1000");
  await page.getByRole("button", { name: "Spremi nacrt" }).click();
  await expect(page).toHaveURL(/\/racuni\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: `Odbij predujam ${brojPredujma}` }).click();
  await expect(page.getByLabel("Naziv stavke 2")).toHaveValue(`Predujam po računu ${brojPredujma}`);
  // 1.000 − 400 = 600 + PDV 150 = 750
  await expect(page.getByTestId("zbrojevi")).toContainText("750,00 €");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Izdaj račun" }).click();
  await expect(page.getByRole("heading", { name: /Račun \d+\/PP1\/1/ })).toBeVisible();
  await expect(page.getByTestId("zbrojevi")).toContainText("750,00 €");
});
