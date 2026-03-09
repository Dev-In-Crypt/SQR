import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stopProcessTree } from "./test-runtime";

const redisEnabled = process.argv.includes("--redis");

const vitestCli = resolve("node_modules/vitest/vitest.mjs");
const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public";

function readEnvValueFromDotEnv(targetKey: string): string | undefined {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (key !== targetKey) {
      continue;
    }
    return trimmed.slice(separator + 1).trim();
  }

  return undefined;
}

const resolvedDatabaseUrl = process.env.DATABASE_URL || readEnvValueFromDotEnv("DATABASE_URL") || defaultDatabaseUrl;
const resolvedDatabaseDirectUrl =
  process.env.DATABASE_URL_DIRECT ||
  readEnvValueFromDotEnv("DATABASE_URL_DIRECT") ||
  process.env.INTEGRATION_DATABASE_URL_DIRECT ||
  process.env.INTEGRATION_DATABASE_URL ||
  resolvedDatabaseUrl;

const child = spawn(process.execPath, [vitestCli, "run", "--config", "vitest.integration.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SQR_WITH_REDIS: redisEnabled ? "1" : "0",
    DATABASE_URL: resolvedDatabaseUrl,
    DATABASE_URL_DIRECT: resolvedDatabaseDirectUrl
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
