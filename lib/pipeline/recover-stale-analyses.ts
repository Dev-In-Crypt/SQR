import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { logError, logInfo } from "@/lib/logger";

export async function markStaleRunningAnalysesAsFailed(): Promise<number> {
  const staleBefore = new Date(Date.now() - config.ANALYSIS_STALE_TIMEOUT_MS);

  try {
    const stale = await prisma.analysisRequest.findMany({
      where: {
        status: "RUNNING",
        updatedAt: {
          lt: staleBefore
        }
      },
      select: { id: true }
    });

    if (stale.length === 0) {
      return 0;
    }

    const staleIds = stale.map((item) => item.id);

    const result = await prisma.analysisRequest.updateMany({
      where: { id: { in: staleIds } },
      data: {
        status: "FAILED",
        errorCode: "ANALYSIS_TIMEOUT",
        pipelineStage: null
      }
    });

    // Paid runs that hung must not eat the payment — grant retry credits.
    await prisma.payment
      .updateMany({
        where: { analysisId: { in: staleIds }, status: "SETTLED" },
        data: { status: "RETRY_CREDIT" }
      })
      .catch(() => undefined);

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
