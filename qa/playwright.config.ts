import { defineConfig, devices } from "@playwright/test";

/**
 * QA checks against a running Propfolio (the UAT server, or a local copy).
 *
 *   QA_BASE_URL=https://… QA_EMAIL=… QA_PASSWORD=… pnpm qa            # everything
 *   … pnpm qa --grep @smoke                                           # read-only checks only
 *
 * Use a dedicated QA Admin account. Credentials come from the environment only.
 */
const baseURL = process.env.QA_BASE_URL;
if (!baseURL) throw new Error("Set QA_BASE_URL, e.g. https://139-59-104-149.sslip.io");

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { outputFolder: "../qa-report", open: "never" }]],
  outputDir: "../qa-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
});
