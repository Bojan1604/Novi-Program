import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

test("postavke firme: neispravan IBAN odbijen bez gubitka upisa; SMTP lozinka se ne vraća u preglednik", async ({ page }) => {
  test.skip(test.info().project.name !== "racunalo", "mijenja zajedničke postavke — jednom je dovoljno");
  await prijaviSe(page);
  await page.goto("/postavke");
  await bezVodoravnogPomicanja(page);
  const o = page.getByRole("form", { name: "Postavke firme" });
  await o.getByLabel("IBAN").fill("HR1210010051863000161");
  await o.getByLabel("Banka").fill("Testna banka");
  await o.getByRole("button", { name: "Spremi postavke" }).click();
  await expect(o.getByText("IBAN nije ispravan")).toBeVisible();
  await expect(o.getByLabel("Banka")).toHaveValue("Testna banka");
  await o.getByLabel("IBAN").fill("HR12 1001 0051 8630 0016 0");
  await o.getByLabel("Lozinka", { exact: true }).fill("tajna-smtp-lozinka");
  await o.getByRole("button", { name: "Spremi postavke" }).click();
  await expect(o.getByText("Postavke su spremljene")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("IBAN")).toHaveValue("HR1210010051863000160");
  expect(await page.content()).not.toContain("tajna-smtp-lozinka");
  await expect(page.getByLabel("Lozinka", { exact: true })).toHaveAttribute("placeholder", /spremljena/);
  // fiskalizacija: kriva lozinka certifikata odbijena; lozinka se ne vraća u preglednik
  const fisk = page.getByRole("form", { name: "Fiskalizacija" });
  await expect(fisk.getByLabel("Način fiskalizacije")).toHaveValue("DEMO");
  await expect(fisk.getByTestId("certifikat")).toContainText("nije učitan");
  await fisk
    .getByLabel("Novi certifikat (.p12 / .pfx)")
    .setInputFiles({ name: "cert.p12", mimeType: "application/x-pkcs12", buffer: Buffer.from("nije certifikat") });
  await fisk.getByLabel("Lozinka certifikata").fill("tajna-certifikata");
  await fisk.getByRole("button", { name: "Spremi fiskalizaciju" }).click();
  await expect(fisk.getByText("Certifikat se ne može otvoriti")).toBeVisible();
  await fisk.getByLabel("Način fiskalizacije").selectOption("TEST");
  await fisk.getByLabel("Novi certifikat (.p12 / .pfx)").setInputFiles([]);
  await fisk.getByRole("button", { name: "Spremi fiskalizaciju" }).click();
  await expect(fisk.getByText("učitajte certifikat")).toBeVisible();
  expect(await page.content()).not.toContain("tajna-certifikata");
});

test("postavke: voditelj vidi, ne mijenja", async ({ page }) => {
  await prijaviSe(page, E2E.voditelj.email);
  await page.goto("/postavke");
  await expect(page.getByRole("button", { name: "Spremi postavke" })).toHaveCount(0);
  await expect(page.getByLabel("IBAN")).toBeDisabled();
});

test("postavke: logo na dokumentima, nizovi brojeva", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/postavke");
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
    "hex",
  );
  const f = page.getByRole("form", { name: "Logo firme" });
  await f.getByLabel(/Slika/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await f.getByRole("button", { name: "Spremi logo" }).click();
  await expect(page.getByTestId("logo-firme")).toBeVisible();
  await expect(page.getByTestId("nizovi-brojeva")).toContainText("Računi (PP1/1)");
  await bezVodoravnogPomicanja(page);
});
