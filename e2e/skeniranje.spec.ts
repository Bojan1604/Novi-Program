import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

prepareZXingModule({ overrides: { wasmBinary: readFileSync("node_modules/zxing-wasm/dist/writer/zxing_writer.wasm").buffer as ArrayBuffer } });

async function slikaBarkoda(tekst: string, format: "Code128" | "QRCode" = "Code128"): Promise<Buffer> {
  const r = await writeBarcode(tekst, { format, scale: 4 });
  if (!r.image) throw new Error(r.error);
  return Buffer.from(await r.image.arrayBuffer());
}

/** Fotografija naljepnice bez barkoda: tekst iscrtan u pregledniku. */
async function slikaTeksta(page: Page, tekst: string): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 700, height: 220 });
  await p.setContent(`<div style="font:48px/1.4 Arial;padding:24px;background:#fff;color:#000">LENOVO ThinkPad<br>${tekst}</div>`);
  const slika = await p.screenshot();
  await p.close();
  return slika;
}

test("pronađi uređaj USB skenerom (upis + Enter) i poruka za nepoznat", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/skeniranje");
  await bezVodoravnogPomicanja(page);
  const polje = page.getByLabel("Serijski broj", { exact: true });
  await polje.fill("NEPOSTOJI-999");
  await polje.press("Enter");
  await expect(page.getByText("Uređaj NEPOSTOJI-999 nije u programu.")).toBeVisible();
  await polje.fill("e2e-ur-001");
  await polje.press("Enter");
  await expect(page).toHaveURL(/\/uredaji\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "E2E-UR-001" })).toBeVisible();
});

test("skupno: ponovljeni se broji, nepoznati označen, prikaz na popisu uređaja", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/skeniranje");
  await page.getByRole("button", { name: "Skupno" }).click();
  const polje = page.getByLabel("Serijski broj", { exact: true });
  for (const s of ["E2E-UR-001", "E2E-UR-002", "NEPOSTOJI-1", "E2E-UR-001"]) {
    await polje.fill(s);
    await polje.press("Enter");
  }
  const popis = page.getByTestId("skenirani");
  await expect(popis.locator("li")).toHaveCount(3);
  await expect(popis).toContainText("skenirano 2×");
  await expect(popis.locator("li", { hasText: "NEPOSTOJI-1" })).toContainText("Nije u programu");
  await expect(popis.locator("li", { hasText: "E2E-UR-002" })).toContainText("E2E Laptop 14");
  await expect(page.getByRole("heading", { name: /Skenirano: 3 · nije u programu: 1/ })).toBeVisible();
  // popis preživi osvježavanje
  await page.reload();
  await expect(page.getByTestId("skenirani").locator("li")).toHaveCount(3);
  await page.getByRole("link", { name: "Prikaži na popisu uređaja" }).click();
  await expect(page).toHaveURL(/serijski=/);
  await expect(page.getByTestId("popis-uredaja").locator("tbody tr")).toHaveCount(2);
});

test("iz slike: barkod, QR s poveznicom naljepnice i tekst (OCR)", async ({ page }) => {
  test.setTimeout(90_000);
  await prijaviSe(page);
  await page.goto("/skeniranje");
  await page.getByRole("button", { name: "Skupno" }).click();
  const slika = page.getByLabel("Slika barkoda ili naljepnice");

  await slika.setInputFiles({ name: "barkod.png", mimeType: "image/png", buffer: await slikaBarkoda("E2E-UR-002") });
  await expect(page.getByTestId("skenirani")).toContainText("E2E-UR-002");

  await slika.setInputFiles({
    name: "qr.png",
    mimeType: "image/png",
    buffer: await slikaBarkoda("https://erp.primjer.hr/uredaji/sn/E2E-UR-001", "QRCode"),
  });
  await expect(page.getByTestId("skenirani")).toContainText("E2E-UR-001");

  await slika.setInputFiles({ name: "naljepnica.png", mimeType: "image/png", buffer: await slikaTeksta(page, "S/N: PF3XK42Q") });
  const dijalog = page.getByRole("dialog");
  await expect(dijalog.getByLabel("Serijski broj")).toHaveValue("PF3XK42Q", { timeout: 60_000 });
  await dijalog.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByTestId("skenirani").locator("li", { hasText: "PF3XK42Q" })).toContainText("Nije u programu");
});
