import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { type ChildProcess } from "node:child_process";

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

import {
  createCleanupController,
  createRunScopedDistDir,
  createRunScopedTsconfig,
  getRunScopeRoot,
  removeDirectoryWithRetries,
  removeFileIfExists,
  resolvePort,
  runCommand,
  spawnLongRunningProcess,
  stopProcessTree,
  waitForHttp,
  waitForJsonRpc
} from "../../../scripts/test-runtime";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const ANVIL_DEPLOYER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function withSchema(databaseUrl: string, schema: string): string {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
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

  const baseDirectDatabaseUrl =
    process.env.INTEGRATION_DATABASE_URL_DIRECT || process.env.DATABASE_URL_DIRECT || baseDatabaseUrl;

  const schema = `itest_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const testDatabaseUrl = withSchema(baseDatabaseUrl, schema);
  const testDirectDatabaseUrl = withSchema(baseDirectDatabaseUrl, schema);

  const anvilPort = await resolvePort({
    envName: "SQR_ANVIL_PORT",
    label: "Integration anvil"
  });
  const appPort = await resolvePort({
    envName: "SQR_TEST_PORT",
    label: "Integration app"
  });

  const baseUrl = `http://127.0.0.1:${appPort}`;
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;
  const runScopedDistDir = createRunScopedDistDir("integration");
  const runScopeRoot = getRunScopeRoot(runScopedDistDir);
  const runScopedTsconfig = await createRunScopedTsconfig(runScopedDistDir);

  const redisRequested = process.env.SQR_WITH_REDIS === "1";
  const redisUrl = redisRequested ? process.env.REDIS_URL : undefined;
  if (redisRequested && !redisUrl) {
    throw new Error("SQR_WITH_REDIS=1 requires REDIS_URL to be set");
  }

  console.log(`[integration] using app port ${appPort}, anvil port ${anvilPort}`);

  let anvilProcess: ChildProcess | null = null;
  let nextProcess: ChildProcess | null = null;
  let workerProcess: ChildProcess | null = null;

  const cleanupController = createCleanupController({
    label: "integration",
    cleanup: async () => {
      await stopProcessTree(workerProcess, "integration:worker");
      await stopProcessTree(nextProcess, "integration:next");
      await stopProcessTree(anvilProcess, "integration:anvil");

      const adminDatabaseUrl = withSchema(baseDirectDatabaseUrl, "public");
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

      try {
        await removeDirectoryWithRetries(resolve(ROOT, runScopeRoot));
      } catch (error) {
        console.warn(`[integration] failed to remove ${runScopeRoot}: ${String(error)}`);
      }

      try {
        await removeFileIfExists(resolve(ROOT, runScopedTsconfig));
      } catch (error) {
        console.warn(`[integration] failed to remove ${runScopedTsconfig}: ${String(error)}`);
      }
    }
  });

  cleanupController.register();

  try {
    await runCommand({
      prefix: "integration:prisma-db-push",
      command: process.execPath,
      args: [resolve(ROOT, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"],
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DATABASE_URL_DIRECT: testDirectDatabaseUrl
      }
    });

    anvilProcess = spawnLongRunningProcess({
      prefix: "integration:anvil",
      command: "anvil",
      args: ["--host", "127.0.0.1", "--port", String(anvilPort), "--chain-id", "8453"],
      cwd: ROOT,
      env: process.env
    });
    await waitForJsonRpc(rpcUrl);

    await runCommand({
      prefix: "integration:forge-build",
      command: "forge",
      args: ["build"],
      cwd: ROOT,
      env: process.env
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
      DATABASE_URL_DIRECT: testDirectDatabaseUrl,
      BASE_CHAIN_ID: "8453",
      STAGING_BASE_CHAIN_ID: "84532",
      BASE_RPC_URL: rpcUrl,
      BASE_MAINNET_RPC_URL: rpcUrl,
      BASE_SEPOLIA_RPC_URL: rpcUrl,
      RECEIPT_CONTRACT_ADDRESS: receiptContractAddress,
      ENABLE_SLITHER: "true",
      SQR_TEST_SOURCE_STUB: "1",
      SQR_TEST_BASESCAN_MAX_ATTEMPTS: "3",
      SQR_TEST_BASESCAN_TOTAL_TIMEOUT_MS: "1500",
      OPENAI_API_KEY: "",
      REDIS_URL: redisUrl || "",
      ANALYSIS_QUEUE_NAME: `analysis-jobs-${schema}`,
      SQR_NEXT_DIST_DIR: runScopedDistDir,
      SQR_NEXT_TSCONFIG: runScopedTsconfig
    };

    await runCommand({
      prefix: "integration:next-build",
      command: process.execPath,
      args: [resolve(ROOT, "node_modules/next/dist/bin/next"), "build"],
      cwd: ROOT,
      env: appEnv
    });

    nextProcess = spawnLongRunningProcess({
      prefix: "integration:next",
      command: process.execPath,
      args: [resolve(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(appPort), "-H", "127.0.0.1"],
      cwd: ROOT,
      env: appEnv
    });

    await waitForHttp(`${baseUrl}/api/v1/session`);

    if (redisRequested) {
      const tsxCli = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");
      workerProcess = spawnLongRunningProcess({
        prefix: "integration:worker",
        command: process.execPath,
        args: [tsxCli, resolve(ROOT, "scripts/worker.ts")],
        cwd: ROOT,
        env: appEnv
      });
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
    process.env.SQR_TEST_SOURCE_STUB = "1";

    return async () => {
      cleanupController.unregister();
      await cleanupController.run();
    };
  } catch (error) {
    cleanupController.unregister();
    await cleanupController.run();
    throw error;
  }
}
