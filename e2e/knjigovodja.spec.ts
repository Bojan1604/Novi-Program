import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";

test("za knjigovođu: popis mjeseca i ZIP", async ({ page }) => {
  await prijaviSe(page);
  const d = new Date();
  const mjesec = d.toISOString().slice(0, 7);
  await page.goto(`/knjigovodja?mjesec=${mjesec}`);
  await expect(page.getByRole("heading", { name: /Za knjigovođu/ })).toBeVisible();
  await bezVodoravnogPomicanja(page);
  const zip = await page.request.get(`/api/knjigovodja/zip?mjesec=${mjesec}`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  expect((await zip.body()).subarray(0, 2).toString("latin1")).toBe("PK");
});
