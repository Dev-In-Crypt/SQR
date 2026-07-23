import { defineConfig } from "@playwright/test";

const baseURL = process.env.SQR_E2E_BASE_URL || "http://127.0.0.1:3121";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  // CI retries paper over dev-mode timing races (anon session creation, see
  // repo task on concurrent /api/v1/session) without hiding them: retried
  // tests are reported as "flaky" in the Playwright report, hard failures
  // still fail the job.
  retries: process.env.CI ? 2 : 0,
  timeout: 180_000,
  expect: {
    timeout: 20_000
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "output/playwright/html-report",
        open: "never"
      }
    ]
  ],
  outputDir: "output/playwright/artifacts",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    }
  }
});
