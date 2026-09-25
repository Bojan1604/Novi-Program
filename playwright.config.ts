import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * npm run test:e2e — testovi u pregledniku nad izgrađenim programom (npm run build prije)
 * i testnom bazom. Računalo (1440 px) i mobitel (390 px).
 */
const PORT = 3200;
const lokalniChromium = "/opt/pw-browsers/chromium";
const executablePath = process.env["PW_CHROMIUM"] ?? (existsSync(lokalniChromium) ? lokalniChromium : undefined);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/priprema.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "racunalo", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "mobitel",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/zdravlje`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: process.env["DATABASE_URL_TEST"] ?? "" },
  },
});
