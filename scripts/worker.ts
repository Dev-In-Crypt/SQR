import { loadEnvConfig } from "@next/env";

import { config } from "@/lib/config";
import { logError, logInfo } from "@/lib/logger";

loadEnvConfig(process.cwd());

async function main() {
  const { startAnalysisWorker } = await import("@/lib/queue");
  const { markStaleRunningAnalysesAsFailed } = await import("@/lib/pipeline/recover-stale-analyses");

  const concurrency = Number(process.env.WORKER_CONCURRENCY || "2");
  const worker = startAnalysisWorker(concurrency);
  await markStaleRunningAnalysesAsFailed();

  const staleSweepTimer = setInterval(() => {
    void markStaleRunningAnalysesAsFailed();
  }, config.ANALYSIS_STALE_SWEEP_INTERVAL_MS);

  logInfo("Stale analysis watchdog enabled", {
    staleTimeoutMs: config.ANALYSIS_STALE_TIMEOUT_MS,
    sweepIntervalMs: config.ANALYSIS_STALE_SWEEP_INTERVAL_MS
  });

  const shutdown = async () => {
    logInfo("Worker shutting down");
    clearInterval(staleSweepTimer);
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logInfo("Worker started", { concurrency });
}

main().catch((error) => {
  logError("Worker boot failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
