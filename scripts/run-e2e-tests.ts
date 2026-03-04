import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

const ROOT = process.cwd();
const PLAYWRIGHT_CLI = resolve(ROOT, "node_modules/@playwright/test/cli.js");

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

function logOutput(label: string, chunk: Buffer): void {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    console.log(`[e2e:${label}] ${line}`);
  }
}

function spawnLongRunning(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): ChildProcess {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: cleanEnv(env),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk: Buffer) => logOutput(label, chunk));
  child.stderr?.on("data", (chunk: Buffer) => logOutput(label, chunk));

  return child;
}

async function runCommand(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: cleanEnv(env),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => logOutput(label, chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      logOutput(label, chunk);
    });

    child.on("error", rejectPromise);
    child.on("exit", (code: number | null) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Command failed (${label}) with exit ${code}: ${stderr}`));
    });
  });
}

async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await delay(400);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForRpc(rpcUrl: string): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < 45_000) {
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
    } catch {
      // keep polling
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for JSON-RPC ${rpcUrl}`);
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed) {
    return;
  }

  const exited = new Promise<void>((resolvePromise) => {
    child.once("exit", () => resolvePromise());
  });

  child.kill("SIGTERM");
  await Promise.race([exited, delay(4_000)]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(4_000)]);
  }
}

function chainForRpc(rpcUrl: string) {
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

async function runPlaywright(env: NodeJS.ProcessEnv, passthroughArgs: string[]): Promise<number> {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [PLAYWRIGHT_CLI, "test", ...passthroughArgs], {
      cwd: ROOT,
      env: cleanEnv(env),
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code: number | null) => resolvePromise(code ?? 1));
  });
}

async function main() {
  const baseDatabaseUrl =
    process.env.E2E_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public";

  const schema = `e2e_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const testDatabaseUrl = withSchema(baseDatabaseUrl, schema);

  const appPort = Number(process.env.SQR_E2E_PORT || "3121");
  const anvilPort = Number(process.env.SQR_E2E_ANVIL_PORT || "8645");
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;

  let anvilProcess: ChildProcess | null = null;
  let appProcess: ChildProcess | null = null;

  try {
    await runCommand(
      "prisma",
      process.execPath,
      [resolve(ROOT, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"],
      {
        ...process.env,
        DATABASE_URL: testDatabaseUrl
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
      process.env
    );

    await waitForRpc(rpcUrl);

    await runCommand("forge", "forge", ["build"], process.env);

    const artifact = JSON.parse(
      await readFile(resolve(ROOT, "contracts/out/ReceiptRegistry.sol/ReceiptRegistry.json"), "utf8")
    ) as {
      abi: Abi;
      bytecode: { object: string };
    };

    const chain = chainForRpc(rpcUrl);
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
      bytecode: artifact.bytecode.object as Hex
    });
    const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

    if (!deployReceipt.contractAddress) {
      throw new Error("Failed to deploy ReceiptRegistry for e2e tests");
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
      RECEIPT_CONTRACT_ADDRESS: deployReceipt.contractAddress,
      ENABLE_SLITHER: "true",
      OPENAI_API_KEY: "",
      REDIS_URL: ""
    };

    appProcess = spawnLongRunning(
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
      appEnv
    );

    await waitForHttp(`${baseUrl}/api/v1/session`);

    const playwrightEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      SQR_E2E_BASE_URL: baseUrl,
      SQR_TEST_RPC_URL: rpcUrl,
      SQR_TEST_CHAIN_ID: "8453",
      SQR_TEST_MINT_PRIVATE_KEY: ANVIL_DEPLOYER_PRIVATE_KEY
    };

    const exitCode = await runPlaywright(playwrightEnv, process.argv.slice(2));
    process.exitCode = exitCode;
  } finally {
    await stopProcess(appProcess);
    await stopProcess(anvilProcess);

    const adminDbUrl = withSchema(baseDatabaseUrl, "public");
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: adminDbUrl
        }
      }
    });

    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
