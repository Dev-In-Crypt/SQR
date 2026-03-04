import { loadEnvConfig } from "@next/env";

import { logError, logInfo } from "@/lib/logger";

loadEnvConfig(process.cwd());

async function main() {
  const { startAnalysisWorker } = await import("@/lib/queue");

  const concurrency = Number(process.env.WORKER_CONCURRENCY || "2");
  const worker = startAnalysisWorker(concurrency);

  const shutdown = async () => {
    logInfo("Worker shutting down");
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
