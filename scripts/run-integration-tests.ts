import { spawn } from "node:child_process";
import { resolve } from "node:path";

const redisEnabled = process.argv.includes("--redis");

const vitestCli = resolve("node_modules/vitest/vitest.mjs");
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public";

const child = spawn(
  process.execPath,
  [vitestCli, "run", "--config", "vitest.integration.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SQR_WITH_REDIS: redisEnabled ? "1" : "0",
      DATABASE_URL: process.env.DATABASE_URL || defaultDatabaseUrl
    }
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
