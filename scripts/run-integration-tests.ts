import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { stopProcessTree } from "./test-runtime";

const redisEnabled = process.argv.includes("--redis");

const vitestCli = resolve("node_modules/vitest/vitest.mjs");
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public";

const child = spawn(process.execPath, [vitestCli, "run", "--config", "vitest.integration.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SQR_WITH_REDIS: redisEnabled ? "1" : "0",
    DATABASE_URL: process.env.DATABASE_URL || defaultDatabaseUrl
  }
});

let shuttingDown = false;

const onSignal = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  await stopProcessTree(child, "integration:vitest-wrapper");
  process.exit(signal === "SIGINT" ? 130 : 143);
};

const sigintHandler = () => {
  void onSignal("SIGINT");
};
const sigtermHandler = () => {
  void onSignal("SIGTERM");
};

process.once("SIGINT", sigintHandler);
process.once("SIGTERM", sigtermHandler);

child.on("exit", (code) => {
  process.off("SIGINT", sigintHandler);
  process.off("SIGTERM", sigtermHandler);
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.off("SIGINT", sigintHandler);
  process.off("SIGTERM", sigtermHandler);
  process.exit(1);
});
