import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ANVIL_DEPLOYER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = {} as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function withSchema(databaseUrl: string, schema: string): string {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function prefixedLogger(label: string, payload: Buffer): void {
  const text = payload.toString();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    console.log(`[integration:${label}] ${line}`);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    label: string;
  }
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: cleanEnv(options.env),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => prefixedLogger(options.label, chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      prefixedLogger(options.label, chunk);
    });

    child.on("error", rejectPromise);

    child.on("exit", (code: number | null) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `Command failed (${options.label}): ${command} ${args.join(" ")} (exit ${code})\n${stderr}`
        )
      );
    });
  });
}

async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${String(lastError)}`);
}

async function waitForJsonRpc(rpcUrl: string, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: []
        })
      });

      if (response.ok) {
        return;
      }
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for JSON-RPC at ${rpcUrl}. Last error: ${String(lastError)}`);
}

async function stopProcess(child: ChildProcess | null, label: string): Promise<void> {
  if (!child || child.killed) {
    return;
  }

  const exited = new Promise<void>((resolvePromise) => {
    child.once("exit", () => resolvePromise());
  });

  child.kill("SIGTERM");

  await Promise.race([exited, delay(5_000)]);

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
  }

  if (child.exitCode === null) {
    await Promise.race([exited, delay(5_000)]);
  }

  console.log(`[integration:${label}] stopped`);
}

function spawnLongRunning(
  label: string,
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    env: cleanEnv(env),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk: Buffer) => prefixedLogger(label, chunk));
  child.stderr?.on("data", (chunk: Buffer) => prefixedLogger(label, chunk));

  child.on("error", (error: Error) => {
    console.error(`[integration:${label}] process error: ${String(error)}`);
  });

  return child;
}

function buildChain(rpcUrl: string) {
  return defineChain({
    id: 8453,
    name: "Base",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  });
}

export default async function integrationGlobalSetup() {
  const baseDatabaseUrl = process.env.INTEGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error("DATABASE_URL (or INTEGRATION_DATABASE_URL) is required for integration tests");
  }

  const schema = `itest_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const testDatabaseUrl = withSchema(baseDatabaseUrl, schema);

  const anvilPort = Number(process.env.SQR_ANVIL_PORT || "8545");
  const appPort = Number(process.env.SQR_TEST_PORT || "3111");
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;

  const redisRequested = process.env.SQR_WITH_REDIS === "1";
  const redisUrl = redisRequested ? process.env.REDIS_URL : undefined;
  if (redisRequested && !redisUrl) {
    throw new Error("SQR_WITH_REDIS=1 requires REDIS_URL to be set");
  }

  let anvilProcess: ChildProcess | null = null;
  let nextProcess: ChildProcess | null = null;
  let workerProcess: ChildProcess | null = null;

  try {
    await runCommand(
      process.execPath,
      [resolve(ROOT, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          DATABASE_URL: testDatabaseUrl
        },
        label: "prisma-db-push"
      }
    );

    anvilProcess = spawnLongRunning(
      "anvil",
      "anvil",
      [
        "--host",
        "127.0.0.1",
        "--port",
        String(anvilPort),
        "--chain-id",
        "8453"
      ],
      ROOT,
      process.env
    );
    await waitForJsonRpc(rpcUrl);

    await runCommand("forge", ["build"], {
      cwd: ROOT,
      env: process.env,
      label: "forge-build"
    });

    const artifactPath = resolve(ROOT, "contracts/out/ReceiptRegistry.sol/ReceiptRegistry.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
      abi: Abi;
      bytecode: { object: string };
    };

    const deployBytecode = artifact.bytecode.object as Hex;
    const chain = buildChain(rpcUrl);
    const deployer = privateKeyToAccount(ANVIL_DEPLOYER_PRIVATE_KEY);

    const walletClient = createWalletClient({
      account: deployer,
      chain,
      transport: http(rpcUrl)
    });
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl)
    });

    const deployHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: deployBytecode
    });

    const deployReceipt = await publicClient.waitForTransactionReceipt({
      hash: deployHash
    });

    const receiptContractAddress = deployReceipt.contractAddress;
    if (!receiptContractAddress) {
      throw new Error("Failed to deploy ReceiptRegistry in integration setup");
    }

    const appEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "test",
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: baseUrl,
      DATABASE_URL: testDatabaseUrl,
      BASE_CHAIN_ID: "8453",
      STAGING_BASE_CHAIN_ID: "84532",
      BASE_RPC_URL: rpcUrl,
      RECEIPT_CONTRACT_ADDRESS: receiptContractAddress,
      ENABLE_SLITHER: "true",
      OPENAI_API_KEY: "",
      REDIS_URL: redisUrl || ""
    };

    nextProcess = spawnLongRunning(
      "next",
      process.execPath,
      [
        resolve(ROOT, "node_modules/next/dist/bin/next"),
        "dev",
        "-p",
        String(appPort),
        "-H",
        "127.0.0.1"
      ],
      ROOT,
      appEnv
    );

    await waitForHttp(`${baseUrl}/api/v1/session`);

    if (redisRequested) {
      const tsxCli = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");
      workerProcess = spawnLongRunning(
        "worker",
        process.execPath,
        [tsxCli, resolve(ROOT, "scripts/worker.ts")],
        ROOT,
        appEnv
      );
      await delay(500);
    }

    process.env.SQR_TEST_BASE_URL = baseUrl;
    process.env.SQR_TEST_DATABASE_URL = testDatabaseUrl;
    process.env.SQR_TEST_SCHEMA = schema;
    process.env.SQR_TEST_RPC_URL = rpcUrl;
    process.env.SQR_TEST_CHAIN_ID = "8453";
    process.env.SQR_TEST_RECEIPT_CONTRACT = receiptContractAddress;
    process.env.SQR_TEST_MINT_PRIVATE_KEY = ANVIL_DEPLOYER_PRIVATE_KEY;
    process.env.SQR_TEST_WITH_REDIS = redisRequested ? "1" : "0";

    return async () => {
      await stopProcess(workerProcess, "worker");
      await stopProcess(nextProcess, "next");
      await stopProcess(anvilProcess, "anvil");

      const adminDatabaseUrl = withSchema(baseDatabaseUrl, "public");
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: adminDatabaseUrl
          }
        }
      });

      try {
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await prisma.$disconnect();
      }
    };
  } catch (error) {
    await stopProcess(workerProcess, "worker");
    await stopProcess(nextProcess, "next");
    await stopProcess(anvilProcess, "anvil");
    throw error;
  }
}

