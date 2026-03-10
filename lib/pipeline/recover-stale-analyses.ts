import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { logError, logInfo } from "@/lib/logger";

export async function markStaleRunningAnalysesAsFailed(): Promise<number> {
  const staleBefore = new Date(Date.now() - config.ANALYSIS_STALE_TIMEOUT_MS);

  try {
    const result = await prisma.analysisRequest.updateMany({
      where: {
        status: "RUNNING",
        updatedAt: {
          lt: staleBefore
        }
      },
      data: {
        status: "FAILED",
        errorCode: "ANALYSIS_TIMEOUT",
        pipelineStage: null
      }
    });

    if (result.count > 0) {
      logInfo("Recovered stale running analyses", {
        recoveredCount: result.count,
        staleTimeoutMs: config.ANALYSIS_STALE_TIMEOUT_MS
      });
    }

    return result.count;
  } catch (error) {
    logError("Failed stale analysis recovery sweep", {
      message: error instanceof Error ? error.message : String(error),
      staleTimeoutMs: config.ANALYSIS_STALE_TIMEOUT_MS
    });
    return 0;
  }
}
