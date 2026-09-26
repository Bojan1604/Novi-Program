import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("uvoz iz starog programa: provjera primjera prikazuje izvještaj razlika bez upisa", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/uvoz");
  await expect(page.getByRole("heading", { name: "Uvoz iz starog programa" })).toBeVisible();
  await page.getByLabel("JSON datoteka starog programa").setInputFiles("docs/primjer-uvoza.json");
  await page.getByRole("button", { name: "Provjeri" }).click();
  const iz = page.getByTestId("izvjestaj-uvoza");
  await expect(iz).toContainText("Provjera je prošla");
  await expect(page.getByTestId("po-godinama")).toContainText("2025");
  await expect(page.getByTestId("po-godinama")).toContainText("1.191,25 €");
  await expect(iz).toContainText("42/PP1/1 (2025.)");
  await expect(page.getByRole("button", { name: "Uvezi" })).toBeEnabled();
  await bezVodoravnogPomicanja(page);

  await page
    .getByLabel("JSON datoteka starog programa")
    .setInputFiles({ name: "krivo.json", mimeType: "application/json", buffer: Buffer.from("{nije json") });
  await page.getByRole("button", { name: "Provjeri" }).click();
  await expect(page.getByText("Datoteka nije ispravan JSON.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Uvezi" })).toBeDisabled();
});
