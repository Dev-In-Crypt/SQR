import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";

import { config } from "@/lib/config";
import { logError, logInfo } from "@/lib/logger";

const ANALYSIS_QUEUE = "analysis-jobs";

type AnalysisJobPayload = {
  analysisId: string;
};

function buildBullConnection(): ConnectionOptions | null {
  if (!config.REDIS_URL) {
    return null;
  }

  const url = new URL(config.REDIS_URL);
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || "6379"),
    maxRetriesPerRequest: null
  };

  if (url.username) {
    connection.username = decodeURIComponent(url.username);
  }

  if (url.password) {
    connection.password = decodeURIComponent(url.password);
  }

  if (url.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

const bullConnection = buildBullConnection();

const queue = bullConnection
  ? new Queue(ANALYSIS_QUEUE, {
      connection: bullConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1500
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000
        },
        removeOnFail: {
          age: 24 * 60 * 60,
          count: 1000
        }
      }
    })
  : null;

export async function enqueueAnalysisJob(analysisId: string): Promise<void> {
  if (!queue) {
    const { processAnalysisById } = await import("@/lib/pipeline/process-analysis");
    setImmediate(() => {
      processAnalysisById(analysisId).catch((error) => {
        logError("Inline analysis processing failed", {
          analysisId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    });
    return;
  }

  await queue.add("analyze", { analysisId }, { jobId: analysisId });
}

export function startAnalysisWorker(concurrency = 2): Worker {
  if (!bullConnection) {
    throw new Error("Redis is required to start BullMQ worker");
  }

  const worker = new Worker(
    ANALYSIS_QUEUE,
    async (job: Job) => {
      const payload = job.data as AnalysisJobPayload;
      const { processAnalysisById } = await import("@/lib/pipeline/process-analysis");
      await processAnalysisById(payload.analysisId);
    },
    {
      connection: bullConnection,
      concurrency
    }
  );

  worker.on("ready", () => {
    logInfo("Analysis worker ready", { queue: ANALYSIS_QUEUE, concurrency });
  });

  worker.on("failed", (job, error) => {
    logError("Analysis worker job failed", {
      analysisId: (job?.data as AnalysisJobPayload | undefined)?.analysisId,
      error: error.message
    });
  });

  return worker;
}
