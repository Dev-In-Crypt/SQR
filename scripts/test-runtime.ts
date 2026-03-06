import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = {} as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function logChunk(prefix: string, chunk: Buffer): void {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    console.log(`[${prefix}] ${line}`);
  }
}

export function spawnLongRunningProcess(options: {
  prefix: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}): ChildProcess {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: cleanEnv(options.env),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32"
  });

  child.stdout?.on("data", (chunk: Buffer) => logChunk(options.prefix, chunk));
  child.stderr?.on("data", (chunk: Buffer) => logChunk(options.prefix, chunk));

  child.on("error", (error: Error) => {
    console.error(`[${options.prefix}] process error: ${String(error)}`);
  });

  return child;
}

export async function runCommand(options: {
  prefix: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: cleanEnv(options.env),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => logChunk(options.prefix, chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      logChunk(options.prefix, chunk);
    });

    child.on("error", rejectPromise);
    child.on("exit", (code: number | null) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `Command failed (${options.prefix}): ${options.command} ${options.args.join(" ")} (exit ${code})\n${stderr}`
        )
      );
    });
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  const exited = new Promise<boolean>((resolvePromise) => {
    child.once("exit", () => resolvePromise(true));
  });

  const timeout = delay(timeoutMs).then(() => false);
  return await Promise.race([exited, timeout]);
}

export async function stopProcessTree(
  child: ChildProcess | null,
  label: string,
  timeoutMs = 5_000
): Promise<void> {
  if (!child || child.exitCode !== null || !child.pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolvePromise) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.on("error", () => resolvePromise());
      killer.on("exit", () => resolvePromise());
    });

    const exited = await waitForExit(child, timeoutMs);
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, timeoutMs);
    }

    console.log(`[${label}] stopped`);
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  let exited = await waitForExit(child, timeoutMs);
  if (!exited && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    exited = await waitForExit(child, timeoutMs);
  }

  if (!exited && child.exitCode === null) {
    console.warn(`[${label}] process did not exit after SIGKILL`);
  } else {
    console.log(`[${label}] stopped`);
  }
}

export async function waitForHttp(url: string, timeoutMs = 90_000): Promise<void> {
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

    await delay(400);
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${String(lastError)}`);
}

export async function waitForJsonRpc(rpcUrl: string, timeoutMs = 45_000): Promise<void> {
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

  throw new Error(`Timed out waiting for JSON-RPC ${rpcUrl}. Last error: ${String(lastError)}`);
}

export async function removeFileIfExists(targetPath: string): Promise<void> {
  await rm(targetPath, { force: true, maxRetries: 0 });
}

export async function removeDirectoryWithRetries(
  targetPath: string,
  attempts = 6,
  waitMs = 250
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === attempts;
      const isRetriable = /EPERM|EBUSY|ENOTEMPTY/i.test(message);

      if (isLastAttempt || !isRetriable) {
        throw error;
      }

      await delay(waitMs * attempt);
    }
  }
}

async function canBindPort(port: number, host: string): Promise<boolean> {
  return await new Promise<boolean>((resolvePromise) => {
    const server = net.createServer();

    server.once("error", () => {
      resolvePromise(false);
    });

    server.listen(port, host, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

async function reserveEphemeralPort(host: string): Promise<number> {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = net.createServer();

    server.once("error", rejectPromise);

    server.listen(0, host, () => {
      const addressInfo = server.address();
      if (!addressInfo || typeof addressInfo === "string") {
        server.close(() => rejectPromise(new Error("Failed to resolve ephemeral port")));
        return;
      }

      const { port } = addressInfo;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise(port);
      });
    });
  });
}

export async function resolvePort(options: {
  envName: string;
  label: string;
  host?: string;
}): Promise<number> {
  const host = options.host || "127.0.0.1";
  const raw = process.env[options.envName];

  if (raw && raw.trim()) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
      throw new Error(`${options.envName} must be an integer between 1024 and 65535`);
    }

    const available = await canBindPort(parsed, host);
    if (!available) {
      throw new Error(
        `${options.label} port ${parsed} from ${options.envName} is already in use on ${host}`
      );
    }

    return parsed;
  }

  const ephemeral = await reserveEphemeralPort(host);
  if (ephemeral < 1024 || ephemeral > 65535) {
    throw new Error(`Resolved invalid ephemeral port ${ephemeral} for ${options.label}`);
  }

  return ephemeral;
}

export function createCleanupController(options: {
  label: string;
  cleanup: () => Promise<void>;
  exitOnSignal?: boolean;
}) {
  let settled = false;
  let running: Promise<void> | null = null;

  const run = async () => {
    if (settled && running) {
      return running;
    }

    if (!running) {
      running = (async () => {
        try {
          await options.cleanup();
        } finally {
          settled = true;
        }
      })();
    }

    return running;
  };

  const onSignal = async (signal: NodeJS.Signals) => {
    console.error(`[${options.label}] received ${signal}, starting cleanup`);
    try {
      await run();
    } finally {
      if (options.exitOnSignal !== false) {
        process.exit(signal === "SIGINT" ? 130 : 143);
      }
    }
  };

  const onUnhandledRejection = async (reason: unknown) => {
    console.error(`[${options.label}] unhandled rejection`, reason);
    await run();
    process.exit(1);
  };

  const onUncaughtException = async (error: Error) => {
    console.error(`[${options.label}] uncaught exception`, error);
    await run();
    process.exit(1);
  };

  const register = () => {
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    process.once("unhandledRejection", onUnhandledRejection);
    process.once("uncaughtException", onUncaughtException);
  };

  const unregister = () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
  };

  return {
    run,
    register,
    unregister
  };
}

export function createRunScopedDistDir(prefix: string): string {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  return `.next-test/${prefix}_${suffix}/dist`;
}

export function getRunScopeRoot(runScopedDistDir: string): string {
  return path.dirname(runScopedDistDir);
}

export async function createRunScopedTsconfig(runScopedDistDir: string): Promise<string> {
  const sourcePath = path.resolve("tsconfig.json");
  const runScopeRoot = getRunScopeRoot(runScopedDistDir);
  const runScopeName = path.basename(runScopeRoot);
  const targetPath = path.resolve(`tsconfig.${runScopeName}.json`);

  await copyFile(sourcePath, targetPath);

  return path.basename(targetPath).split(path.sep).join("/");
}

