import { defineConfig } from "@playwright/test";

const baseURL = process.env.SQR_E2E_BASE_URL || "http://127.0.0.1:3121";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 12_000
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
    video: "off"
  }
});
