import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("inventura: skeniraj policu, zaključi, manjak i višak", async ({ page }) => {
  const p = test.info().project.name.toUpperCase();
  await prijaviSe(page);
  await page.goto("/inventure");
  await bezVodoravnogPomicanja(page);
  await page.getByLabel("Skladište").selectOption({ label: `E2E Polica ${p}` });
  await page.getByRole("button", { name: "Započni inventuru" }).click();
  await expect(page.getByRole("heading", { name: /Inventura INV-/ })).toBeVisible();
  const brojevi = page.getByTestId("brojevi-inventure");
  await expect(brojevi).toContainText("U programu (skladište)2");

  const polje = page.getByLabel("Serijski broj", { exact: true });
  for (const s of [`E2E-INV-${p}-1`, "E2E-UR-001", `E2E-INV-${p}-1`]) {
    await polje.fill(s);
    await polje.press("Enter");
  }
  const zadnje = page.getByTestId("zadnje-skenirano");
  await expect(zadnje.locator("li", { hasText: "E2E-UR-001" })).toContainText("U programu: Na skladištu");
  await expect(zadnje.locator("li", { hasText: `E2E-INV-${p}-1` })).toContainText("skenirano 2×");
  await expect(brojevi).toContainText("Od toga pronađeno1");
  await bezVodoravnogPomicanja(page);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Zaključi inventuru" }).click();
  await expect(page.getByText("zaključena").first()).toBeVisible();
  await expect(brojevi).toContainText("Pronađeno1");
  await expect(brojevi).toContainText("Manjak1");
  await expect(brojevi).toContainText("Višak1");
  await expect(page.getByTestId("stavke-inventure").locator("li", { hasText: `E2E-INV-${p}-2` })).toContainText("Manjak");
  await expect(page.getByRole("heading", { name: "Skeniranje" })).toHaveCount(0);
});
