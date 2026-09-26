import { expect, test } from "@playwright/test";
import { bezVodoravnogPomicanja, prijaviSe } from "./pomoc";
import { E2E } from "./podaci";

const projekt = () => test.info().project.name.toUpperCase();

test("međuskladišnica: skeniraj, izdaj, uređaj je u drugom skladištu s dokumentom u povijesti", async ({ page }) => {
  const serijski = `E2E-MSK-${projekt()}`;
  await prijaviSe(page);
  await page.goto("/skladisni");
  await page.getByRole("link", { name: "Međuskladišnica" }).click();
  await expect(page.getByRole("heading", { name: /Novi dokument/ })).toBeVisible();
  await bezVodoravnogPomicanja(page);
  await page.getByLabel("U skladište").selectOption({ label: "E2E Split" });
  const polje = page.getByLabel("Serijski broj", { exact: true });
  await polje.fill(serijski.toLowerCase());
  await polje.press("Enter");
  await polje.fill("NEPOSTOJI-77");
  await polje.press("Enter");
  const popis = page.getByTestId("uredaji-dokumenta");
  await expect(popis.locator("li", { hasText: serijski })).toContainText("Na skladištu");
  await expect(page.getByText("Nisu u programu: NEPOSTOJI-77")).toBeVisible();
  await expect(page.getByRole("button", { name: "Izdaj međuskladišnica" })).toBeDisabled();
  await page.getByRole("button", { name: "Ukloni NEPOSTOJI-77" }).click();
  await page.getByRole("button", { name: "Izdaj međuskladišnica" }).click();
  await expect(page.getByRole("heading", { name: /Međuskladišnica MSK-\d+\/\d{4}/ })).toBeVisible();
  await expect(page.getByText("u: E2E Split")).toBeVisible();
  await page.getByTestId("uredaji-dokumenta").getByRole("link", { name: serijski }).click();
  await expect(page.getByText("E2E Split").first()).toBeVisible();
  await expect(page.getByTestId("povijest")).toContainText(/Međuskladišnica MSK-/);
});

test("izlaz: čeka odobrenje, podnositelj ne može odobriti, drugi korisnik odobri → otpisan", async ({ page }) => {
  const serijski = `E2E-IZL-${projekt()}`;
  await prijaviSe(page);
  await page.goto("/skladisni/nova?vrsta=IZLAZ");
  await page.getByLabel("Razlog izlaza").selectOption("Oštećen");
  const polje = page.getByLabel("Serijski broj", { exact: true });
  await polje.fill(serijski);
  await polje.press("Enter");
  await expect(page.getByTestId("uredaji-dokumenta")).toContainText("Na skladištu");
  await page.getByRole("button", { name: "Pošalji na odobrenje" }).click();
  await expect(page.getByRole("heading", { name: /Izlaz IZL-/ })).toBeVisible();
  await expect(page.getByText("Čeka odobrenje").first()).toBeVisible();
  await expect(page.getByText("Vlastiti zahtjev ne možete odobriti")).toBeVisible();
  await expect(page.getByRole("button", { name: "Odobri" })).toHaveCount(0);
  const adresa = page.url();

  await page.getByRole("button", { name: "Odjava" }).click();
  await prijaviSe(page, E2E.voditelj.email);
  await page.goto("/odobrenja");
  await bezVodoravnogPomicanja(page);
  await expect(
    page
      .getByTestId("odobrenja")
      .getByRole("link", { name: /Izlaz IZL-.*Oštećen/ })
      .first(),
  ).toBeVisible();
  await page.goto(adresa);
  await page.getByRole("button", { name: "Odobri" }).click();
  await expect(page.getByText(/Odobrio Vesna Voditelj/)).toBeVisible();
  await expect(page.getByTestId("uredaji-dokumenta")).toContainText("Otpisan");
});
