import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("nadzorna ploča: kartice s brojevima vode na filtrirane popise", async ({ page }) => {
  await prijaviSe(page);
  await page.goto("/");
  const kartice = page.getByTestId("kartice-nadzorne");
  await expect(kartice.locator('[data-kartica="prihod"]')).toBeVisible();
  await expect(kartice.locator('[data-kartica="skladiste"]')).toBeVisible();
  await bezVodoravnogPomicanja(page);
  const broj = await kartice.locator('[data-kartica="skladiste"] [data-vrijednost]').getAttribute("data-vrijednost");
  await kartice.locator('[data-kartica="skladiste"]').click();
  await expect(page).toHaveURL(/\/uredaji\?stanje=NA_SKLADISTU/);
  expect(Number(broj)).toBeGreaterThan(0);
});
