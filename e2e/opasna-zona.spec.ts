import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("opasna zona: stanje održavanja, kriva lozinka i krivi naziv se odbijaju", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/opasna-zona");
  await expect(page.getByRole("heading", { name: "Opasna zona" })).toBeVisible();
  await expect(page.getByTestId("odrzavanje")).toContainText("Veličina baze");

  const brisanje = page.getByRole("form", { name: "Brisanje podataka" });
  await brisanje.getByLabel(/Prepišite naziv firme/).fill("Kriva firma");
  await brisanje.getByLabel("Vaša lozinka").fill("kriva-lozinka");
  page.once("dialog", (d) => void d.accept());
  await brisanje.getByRole("button", { name: "Obriši podatke" }).click();
  await expect(brisanje.getByText("Lozinka nije ispravna.")).toBeVisible();

  const dnevnik = page.getByRole("form", { name: "Čišćenje dnevnika" });
  await dnevnik.getByLabel(/Obriši starije od/).fill("12");
  await dnevnik.getByLabel("Vaša lozinka").fill("kriva-lozinka");
  page.once("dialog", (d) => void d.accept());
  await dnevnik.getByRole("button", { name: "Očisti dnevnik" }).click();
  await expect(dnevnik.getByText("Lozinka nije ispravna.")).toBeVisible();
  await bezVodoravnogPomicanja(page);
});
