import { expect, test } from "@playwright/test";
import { E2E } from "./podaci";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("MDM: organizacija distributera, upis uređaja kodom, javljanje, distributer vidi samo svoje", async ({ page, browser }) => {
  const p = test.info().project.name.toUpperCase();
  await prijaviSe(page);
  await page.goto("/mdm");
  await bezVodoravnogPomicanja(page);
  const nova = page.getByRole("form", { name: "Nova organizacija" });
  await nova.getByLabel("Naziv").fill(`E2E MDM ${p}`);
  await nova.getByLabel("Vrsta").selectOption("DISTRIBUTER");
  await nova.getByLabel("Partner (pristup na portalu)").selectOption({ label: "E2E Distributer d.o.o." });
  await nova.getByRole("button", { name: "Dodaj organizaciju" }).click();
  await expect(page.getByRole("heading", { name: `E2E MDM ${p}` })).toBeVisible();
  const kod = (await page.getByTestId("kod-upisa").textContent())!.trim();
  expect(kod).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const qr = await page.request.get(`${page.url()}`.replace("/mdm/", "/api/mdm/organizacije/") + "/qr");
  expect(qr.headers()["content-type"]).toBe("image/png");
  const orgUrl = page.url();

  // agent: upis kodom (s razmacima, malim slovima) i javljanje tokenom
  const upis = await page.request.post("/api/mdm/upis", {
    data: {
      kod: kod.toLowerCase().replace(/-/g, " "),
      serijski: `E2E-MDM-${p}`,
      platforma: "ANDROID",
      model: "Galaxy Tab A9",
      verzijaAgenta: "1.0.0",
    },
  });
  expect(upis.status()).toBe(200);
  const { token } = (await upis.json()) as { token: string };
  const javi = await page.request.post("/api/mdm/javi", { headers: { Authorization: `Bearer ${token}` }, data: { izvjestaj: { baterija: 77 } } });
  expect(await javi.json()).toMatchObject({ naredbe: [], profil: null, aplikacije: [], datoteke: [] });
  expect((await page.request.post("/api/mdm/javi", { headers: { Authorization: "Bearer lazni-token-lazni-token-123" }, data: {} })).status()).toBe(
    401,
  );
  expect((await page.request.post("/api/mdm/upis", { data: { kod: "AAAA-AAAA-AAAA", serijski: "X-1", platforma: "ANDROID" } })).status()).toBe(400);

  await page.reload();
  await expect(page.getByTestId("mdm-uredaji")).toContainText(`E2E-MDM-${p}`);
  await expect(page.getByTestId("mdm-uredaji")).toContainText("na vezi");
  await page.getByTestId("mdm-uredaji").getByRole("link").first().click();
  await expect(page.getByTestId("mdm-izvjestaj")).toContainText("77");
  await bezVodoravnogPomicanja(page);

  // portal: distributer vidi organizaciju i uređaj; drugi klijent ne vidi ništa ni po id-u
  const prijava = async (email: string) => {
    const s = await browser.newPage({ viewport: page.viewportSize()! });
    await s.goto("/portal/prijava");
    await s.getByLabel("E-pošta").fill(email);
    await s.getByLabel("Lozinka").fill(E2E.klijent.lozinka);
    await s.getByRole("button", { name: "Prijava" }).click();
    await expect(s.getByRole("heading", { name: "Vaši uređaji" })).toBeVisible();
    return s;
  };
  const distributer = await prijava(E2E.distributer.email);
  await distributer.getByRole("link", { name: "MDM" }).click();
  await distributer.getByRole("link", { name: `E2E MDM ${p}` }).click();
  await expect(distributer.getByTestId("portal-mdm-uredaji")).toContainText(`E2E-MDM-${p}`);
  await bezVodoravnogPomicanja(distributer);
  const orgPortal = distributer.url();
  expect(orgPortal).toContain(orgUrl.split("/mdm/")[1]!);

  const drugi = await prijava(E2E.klijent.email);
  await expect(drugi.getByRole("link", { name: "MDM" })).toHaveCount(0);
  expect((await drugi.goto(orgPortal))?.status()).toBe(404);
  expect((await drugi.request.get(`${orgPortal}/qr`)).status()).toBe(404);
  await distributer.close();
  await drugi.close();
});

test("MDM: aplikacija i nova verzija stižu na uređaj, naredba, zapisnik, snimka zaslona", async ({ page }) => {
  const p = test.info().project.name.toUpperCase();
  const paket = `com.e2e.${p.toLowerCase()}`;
  await prijaviSe(page);
  await page.goto("/mdm");
  const nova = page.getByRole("form", { name: "Nova organizacija" });
  await nova.getByLabel("Naziv").fill(`E2E MDM aplikacije ${p}`);
  await nova.getByRole("button", { name: "Dodaj organizaciju" }).click();
  await expect(page.getByRole("heading", { name: `E2E MDM aplikacije ${p}` })).toBeVisible();
  const orgUrl = page.url();
  const kod = (await page.getByTestId("kod-upisa").textContent())!.trim();

  // aplikacija v1 (APK) preko obrasca
  const dodaj = async (verzija: string, broj: string) => {
    await page.goto("/mdm/aplikacije");
    const f = page.getByRole("form", { name: "Nova aplikacija" });
    await f.getByLabel("Naziv").fill(`E2E aplikacija ${p}`);
    await f.getByLabel("Paket (npr. com.firma.app)").fill(paket);
    await f.getByLabel("Verzija (npr. 2.1.0)").fill(verzija);
    await f.getByLabel("Broj verzije (raste)").fill(broj);
    await f
      .getByLabel(/Datoteka \(APK\/MSI/)
      .setInputFiles({ name: "app.apk", mimeType: "application/vnd.android.package-archive", buffer: Buffer.from(`APK ${verzija}`) });
    await f.getByRole("button", { name: "Dodaj aplikaciju" }).click();
    await expect(f.getByText("Aplikacija je dodana")).toBeVisible();
  };
  await dodaj("1.0", "1");
  await bezVodoravnogPomicanja(page);
  await page.goto(orgUrl);
  await page.getByLabel("Dodijeli aplikaciju").selectOption({ label: `E2E aplikacija ${p} (${paket}) · Android · 1.0` });
  await page.getByRole("button", { name: "Dodijeli", exact: true }).click();
  await expect(page.getByTestId("dodjele")).toContainText(paket);

  // agent
  const upis = await page.request.post("/api/mdm/upis", { data: { kod, serijski: `E2E-APL-${p}`, platforma: "ANDROID" } });
  const { token, uredajId } = (await upis.json()) as { token: string; uredajId: string };
  const javi = async (instalirano: number | null) =>
    (await (
      await page.request.post("/api/mdm/javi", {
        headers: { Authorization: `Bearer ${token}` },
        data: { izvjestaj: { aplikacije: instalirano === null ? [] : [{ paket, verzijaKod: instalirano }] } },
      })
    ).json()) as {
      naredbe: { id: string; vrsta: string; parametri: { aplikacijaId?: string } }[];
      aplikacije: { id: string; verzija: string; adresa: string }[];
    };
  const o1 = await javi(null);
  expect(o1.naredbe.map((n) => n.vrsta)).toEqual(["INSTALIRAJ"]);
  const apk = await page.request.get(o1.aplikacije[0]!.adresa, { headers: { Authorization: `Bearer ${token}` } });
  expect(await apk.text()).toBe("APK 1.0");
  await page.request.post("/api/mdm/rezultat", {
    headers: { Authorization: `Bearer ${token}` },
    data: { naredbaId: o1.naredbe[0]!.id, uspjeh: true, poruka: "Instalirano 1.0" },
  });
  expect((await javi(1)).naredbe).toEqual([]);

  // nova verzija stiže sama
  await dodaj("2.0", "2");
  const o2 = await javi(1);
  expect(o2.naredbe.map((n) => n.vrsta)).toEqual(["INSTALIRAJ"]);
  expect(o2.aplikacije[0]!.verzija).toBe("2.0");

  // naredba s kartice uređaja, rezultat, zapisnik
  await page.goto(`/mdm/uredaji/${uredajId}`);
  const n = page.getByRole("form", { name: "Naredba uređaju" });
  await n.getByLabel("Naredba").selectOption("PORUKA");
  await n.getByLabel("Tekst poruke").fill("Molimo vratite tablet");
  await n.getByRole("button", { name: "Pošalji" }).click();
  await expect(page.getByTestId("mdm-naredbe")).toContainText("Poruka na zaslonu");
  const o3 = await javi(2);
  const poruka = o3.naredbe.find((x) => x.vrsta === "PORUKA")!;
  await page.request.post("/api/mdm/rezultat", {
    headers: { Authorization: `Bearer ${token}` },
    data: { naredbaId: poruka.id, uspjeh: true, poruka: "Prikazano" },
  });
  await page.request.post("/api/mdm/zapisnik", {
    headers: { Authorization: `Bearer ${token}` },
    data: { zapisi: [{ razina: "UPOZORENJE", poruka: "Slaba baterija" }] },
  });
  await page.reload();
  await expect(page.getByTestId("mdm-naredbe")).toContainText("Izvršena");
  await expect(page.getByTestId("mdm-zapisnik")).toContainText("Slaba baterija");
  await bezVodoravnogPomicanja(page);
});
