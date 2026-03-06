import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: false,
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "html"],
      exclude: [
        "**/*.d.ts",
        "**/*.config.*",
        ".next/**",
        ".next-test/**",
        "contracts/**",
        "coverage/**",
        "node_modules/**",
        "output/**",
        "scripts/**",
        "tests/**"
      ],
      thresholds: {
        lines: 60
      }
    }
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, ".")
    }
  }
});
