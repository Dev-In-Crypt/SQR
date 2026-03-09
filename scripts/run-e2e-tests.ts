import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  cleanEnv,
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
} from "./test-runtime";

const ROOT = process.cwd();
const PLAYWRIGHT_CLI = resolve(ROOT, "node_modules/@playwright/test/cli.js");

const ANVIL_DEPLOYER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function withSchema(databaseUrl: string, schema: string): string {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
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
  const baseDirectDatabaseUrl =
    process.env.E2E_DATABASE_URL_DIRECT || process.env.DATABASE_URL_DIRECT || baseDatabaseUrl;

  const schema = `e2e_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const testDatabaseUrl = withSchema(baseDatabaseUrl, schema);
  const testDirectDatabaseUrl = withSchema(baseDirectDatabaseUrl, schema);

  const appPort = await resolvePort({
    envName: "SQR_E2E_PORT",
    label: "E2E app"
  });
  const anvilPort = await resolvePort({
    envName: "SQR_E2E_ANVIL_PORT",
    label: "E2E anvil"
  });

  const baseUrl = `http://127.0.0.1:${appPort}`;
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;
  const runScopedDistDir = createRunScopedDistDir("e2e");
  const runScopeRoot = getRunScopeRoot(runScopedDistDir);
  const runScopedTsconfig = await createRunScopedTsconfig(runScopedDistDir);

  let anvilProcess: ChildProcess | null = null;
  let appProcess: ChildProcess | null = null;

  const cleanupController = createCleanupController({
    label: "e2e",
    cleanup: async () => {
      await stopProcessTree(appProcess, "e2e:next");
      await stopProcessTree(anvilProcess, "e2e:anvil");

      const adminDbUrl = withSchema(baseDirectDatabaseUrl, "public");
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

      try {
        await removeDirectoryWithRetries(resolve(ROOT, runScopeRoot));
      } catch (error) {
        console.warn(`[e2e] failed to remove ${runScopeRoot}: ${String(error)}`);
      }

      try {
        await removeFileIfExists(resolve(ROOT, runScopedTsconfig));
      } catch (error) {
        console.warn(`[e2e] failed to remove ${runScopedTsconfig}: ${String(error)}`);
      }
    }
  });

  cleanupController.register();

  try {
    console.log(`[e2e] using app port ${appPort}, anvil port ${anvilPort}`);

    await runCommand({
      prefix: "e2e:prisma",
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
      prefix: "e2e:anvil",
      command: "anvil",
      args: ["--host", "127.0.0.1", "--port", String(anvilPort), "--chain-id", "8453"],
      cwd: ROOT,
      env: process.env
    });

    await waitForJsonRpc(rpcUrl);

    await runCommand({
      prefix: "e2e:forge",
      command: "forge",
      args: ["build"],
      cwd: ROOT,
      env: process.env
    });

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
      DATABASE_URL_DIRECT: testDirectDatabaseUrl,
      BASE_CHAIN_ID: "8453",
      STAGING_BASE_CHAIN_ID: "84532",
      BASE_RPC_URL: rpcUrl,
      BASE_MAINNET_RPC_URL: rpcUrl,
      BASE_SEPOLIA_RPC_URL: rpcUrl,
      RECEIPT_CONTRACT_ADDRESS: deployReceipt.contractAddress,
      ENABLE_SLITHER: "true",
      OPENAI_API_KEY: "",
      REDIS_URL: "",
      SQR_NEXT_DIST_DIR: runScopedDistDir,
      SQR_NEXT_TSCONFIG: runScopedTsconfig
    };

    appProcess = spawnLongRunningProcess({
      prefix: "e2e:next",
      command: process.execPath,
      args: [resolve(ROOT, "node_modules/next/dist/bin/next"), "dev", "-p", String(appPort), "-H", "127.0.0.1"],
      cwd: ROOT,
      env: appEnv
    });

    await waitForHttp(`${baseUrl}/api/v1/session`);

    const playwrightEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_DIRECT: testDirectDatabaseUrl,
      SQR_E2E_BASE_URL: baseUrl,
      SQR_TEST_RPC_URL: rpcUrl,
      SQR_TEST_CHAIN_ID: "8453",
      SQR_TEST_MINT_PRIVATE_KEY: ANVIL_DEPLOYER_PRIVATE_KEY
    };

    const exitCode = await runPlaywright(playwrightEnv, process.argv.slice(2));
    process.exitCode = exitCode;
  } finally {
    cleanupController.unregister();
    await cleanupController.run();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});


