import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("troškovi: grafikon, novi trošak, plaćeno pa neplaćeno", async ({ page }) => {
  const opis = `E2E struja ${test.info().project.name}`;
  await prijaviSe(page);
  await page.goto("/troskovi");
  await expect(page.getByRole("img", { name: "Troškovi po mjesecima i kategorijama" })).toBeVisible();
  await bezVodoravnogPomicanja(page);
  const novi = page.getByRole("form", { name: "Novi trošak" });
  await novi.getByLabel("Kategorija").selectOption({ label: "Režije" });
  await novi.getByLabel("Opis").fill(opis);
  await novi.getByLabel("Iznos bez PDV-a (€)").fill("123,45");
  await novi.getByRole("button", { name: "Dodaj trošak" }).click();
  await expect(novi.getByText("Trošak je upisan.")).toBeVisible();
  await page.getByTestId("troskovi").getByRole("link", { name: opis }).click();
  await expect(page.getByRole("heading", { name: opis })).toBeVisible();
  await page.getByRole("button", { name: "Označi plaćeno" }).click();
  await expect(page.getByText("plaćeno", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vrati na neplaćeno" }).click();
  await expect(page.getByText("neplaćeno", { exact: true })).toBeVisible();
  await bezVodoravnogPomicanja(page);
});
