import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.integration.test.ts"],
    exclude: ["tests/unit/**/*.test.ts"],
    globalSetup: ["tests/integration/setup/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
      shuffle: false
    }
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, ".")
    }
  }
});
