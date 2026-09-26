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
  expect(await javi.json()).toEqual({ naredbe: [] });
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
