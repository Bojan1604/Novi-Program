import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test.beforeEach(async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/razvoj/komponente");
});

test.describe("pretraživač (odabir partnera)", () => {
  test("brzi Enter bira partnera za upisani tekst, ne za prethodni (stvarna greška)", async ({ page }) => {
    const polje = page.getByRole("combobox", { name: "Partner", exact: true });
    await polje.click();
    await polje.pressSequentially("Al"); // spori odgovor (900 ms) — prvi rezultat bi bio „Alfa d.o.o.“
    await page.waitForTimeout(200);
    await polje.pressSequentially("fa B"); // brzi odgovor — samo „Alfa Beta d.d.“
    await polje.press("Enter"); // odmah, prije ijednog odgovora
    await expect(page.getByTestId("odabrano")).toHaveText("Alfa Beta d.d.");
    await expect(polje).toHaveValue("Alfa Beta d.d.");
    // pričekaj da stigne i spori odgovor — ne smije ništa promijeniti
    await page.waitForTimeout(1200);
    await expect(page.getByTestId("odabrano")).toHaveText("Alfa Beta d.d.");
    // Enter nije poslao obrazac; skriveno polje nosi id
    await expect(page.getByTestId("poslano")).toHaveText("");
    await page.getByRole("button", { name: "Pošalji obrazac" }).click();
    await expect(page.getByTestId("poslano")).toHaveText("p2");
  });

  test("kasni odgovor za stari upit ne prepisuje popis", async ({ page }) => {
    const polje = page.getByRole("combobox", { name: "Partner", exact: true });
    await polje.pressSequentially("a");
    await page.waitForTimeout(250);
    await polje.fill("gama");
    await expect(page.getByRole("option")).toHaveText(["Gama Trgovina d.o.o.OIB 00000000004"]);
    await page.waitForTimeout(1200);
    await expect(page.getByRole("option")).toHaveCount(1);
  });

  test("strelice i Enter, klik mišem, čišćenje", async ({ page }) => {
    const polje = page.getByRole("combobox", { name: "Partner", exact: true });
    await polje.fill("alfa");
    await expect(page.getByRole("option")).toHaveCount(3);
    await polje.press("ArrowDown");
    await polje.press("ArrowDown");
    await polje.press("Enter");
    await expect(page.getByTestId("odabrano")).toHaveText("Alfa Informatika j.d.o.o.");
    await polje.fill("delta");
    await page.getByRole("option", { name: /Delta Najam/ }).click();
    await expect(page.getByTestId("odabrano")).toHaveText("Delta Najam d.o.o.");
    await page.getByRole("button", { name: "Očisti" }).click();
    await expect(page.getByTestId("odabrano")).toHaveText("—");
  });

  test("hrvatska slova u pretrazi", async ({ page }) => {
    await page.getByRole("combobox", { name: "Partner", exact: true }).fill("čakovec");
    await expect(page.getByRole("option")).toHaveCount(1);
  });

  test("u dijalogu: Esc prvo zatvara popis, drugi Esc dijalog", async ({ page }) => {
    await page.getByRole("button", { name: "Otvori dijalog" }).click();
    const dijalog = page.getByRole("dialog");
    await expect(dijalog).toBeVisible();
    const polje = dijalog.getByRole("combobox");
    await polje.fill("beta");
    await expect(dijalog.getByRole("option").first()).toBeVisible();
    await polje.press("Escape");
    await expect(dijalog.getByRole("listbox")).toBeHidden();
    await expect(dijalog).toBeVisible();
    await polje.press("Escape");
    await expect(dijalog).toBeHidden();
  });

  test("u dijalogu odabir radi i dijalog se zatvara gumbom", async ({ page }) => {
    await page.getByRole("button", { name: "Otvori dijalog" }).click();
    const polje = page.getByRole("dialog").getByRole("combobox");
    await polje.fill("zeta");
    await polje.press("Enter");
    await page.getByRole("button", { name: "Gotovo" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByTestId("u-dijalogu")).toHaveText("Zeta Uredska oprema");
  });
});

test.describe("tablica", () => {
  const redovi = (page: import("@playwright/test").Page) => page.getByTestId("tablica").locator("tbody tr");

  test("sortiranje u oba smjera, stranice, zbroj", async ({ page }) => {
    await expect(redovi(page)).toHaveCount(25);
    await expect(redovi(page).first()).toContainText("Uređaj 001");
    if (test.info().project.name === "racunalo") {
      await page.getByRole("columnheader", { name: /Naziv/ }).getByRole("link").click();
      await expect(page).toHaveURL(/sort=naziv&smjer=desc/);
      await expect(redovi(page).first()).toContainText("Uređaj 120");
      await page.getByRole("columnheader", { name: /Iznos/ }).getByRole("link").click();
      await expect(page).toHaveURL(/sort=iznos&smjer=asc/);
      await expect(redovi(page).first()).toContainText("0,99");
    }
    await page.getByRole("link", { name: "Sljedeća ›" }).click();
    await expect(page).toHaveURL(/stranica=2/);
    await expect(page.getByText("26–50 od 120")).toBeVisible();
    await expect(page.getByTestId("tablica").locator("tfoot")).toContainText("Ukupno");
  });

  test("filtar s više vrijednosti i pretraga (vraća na 1. stranicu)", async ({ page }) => {
    await page.goto("/razvoj/komponente?stranica=3");
    await page.getByRole("button", { name: /Status/ }).click();
    await page.getByRole("option", { name: "U najmu" }).click();
    await page.getByRole("option", { name: "Prodan" }).click();
    await expect(page).toHaveURL(/status=U\+najmu&status=Prodan|status=U%20najmu&status=Prodan/);
    await expect(page).not.toHaveURL(/stranica=/);
    await page.keyboard.press("Escape");
    await expect(page.getByText("od 60")).toBeVisible();
    await expect(redovi(page).filter({ hasText: "Na skladištu" })).toHaveCount(0);

    await page.getByRole("searchbox").fill("Uređaj 01");
    await expect(page).toHaveURL(/trazi=Ure%C4%91aj\+01|trazi=Ure%C4%91aj%2001/);
    await expect(page.getByText("od 6", { exact: false })).toBeVisible(); // 010–019: 3 u najmu + 3 prodana
  });

  test("na mobitelu kartice umjesto tablice, bez vodoravnog pomicanja", async ({ page }) => {
    await bezVodoravnogPomicanja(page);
    const zaglavlje = page.getByTestId("tablica").locator("thead");
    if (test.info().project.name === "mobitel") await expect(zaglavlje).toBeHidden();
    else await expect(zaglavlje).toBeVisible();
  });
});

test.describe("poruke, tema, boja firme, izvoz", () => {
  test("poruka se pokaže i nestane; greška ostaje dok se ne zatvori", async ({ page }) => {
    await page.getByRole("button", { name: "Pokaži poruku" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Spremljeno." })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Spremljeno." })).toBeHidden({ timeout: 6000 });
    await page.getByRole("button", { name: "Pokaži grešku" }).click();
    const greska = page.getByRole("alert").filter({ hasText: "Nešto nije u redu." });
    await page.waitForTimeout(4500);
    await expect(greska).toBeVisible();
    await greska.getByRole("button", { name: "Zatvori poruku" }).click();
    await expect(greska).toBeHidden();
  });

  test("tamna tema se pamti nakon osvježavanja", async ({ page }) => {
    const gumb = page.getByRole("button", { name: /^Tema:/ });
    await gumb.click(); // svijetla
    await gumb.click(); // tamna
    await expect(page.locator("html")).toHaveAttribute("data-tema", "tamna");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "tamna");
    const pozadina = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(pozadina).toBe("rgb(10, 10, 10)");
    await page.getByRole("button", { name: /^Tema:/ }).click(); // natrag na sustav
    await expect(page.locator("html")).not.toHaveAttribute("data-tema", /.+/);
  });

  test("boja firme na gumbima, s čitljivim tekstom", async ({ page }) => {
    await page.goto("/korisnici");
    const gumb = page.getByRole("button", { name: "Dodaj korisnika" });
    await expect(gumb).toHaveCSS("background-color", "rgb(15, 118, 110)");
    await expect(gumb).toHaveCSS("color", "rgb(255, 255, 255)");
  });

  test("izvoz u Excel, CSV i PDF; zapis u dnevniku", async ({ page }) => {
    for (const [gumb, nastavak] of [
      ["Excel", "xlsx"],
      ["CSV", "csv"],
      ["PDF", "pdf"],
    ] as const) {
      const [preuzimanje] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: gumb, exact: true }).click()]);
      expect(preuzimanje.suggestedFilename()).toMatch(new RegExp(`^korisnici-\\d{4}-\\d{2}-\\d{2}\\.${nastavak}$`));
      if (nastavak === "csv") {
        const put = await preuzimanje.path();
        const tekst = (await import("node:fs")).readFileSync(put!, "utf8");
        expect(tekst).toContain("Ime;E-pošta;Uloga");
        expect(tekst).toContain("ana@e2e.hr");
      }
    }
    await page.goto("/dnevnik?entitet=Izvoz");
    await expect(page.getByTestId("dnevnik")).toContainText("Izvoz: Korisnici (PDF");
  });
});
