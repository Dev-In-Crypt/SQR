import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { analysisQueueReadiness, isAnalysisQueueEnabled } from "@/lib/queue";
import { receiptSubsystemHealth } from "@/lib/receipt";

export const runtime = "nodejs";

// Transient RPC problems degrade the receipt section without failing overall
// health; a deterministic misconfiguration (wrong contract/chain) fails it so
// deploy verification catches the regression.
const RECEIPT_TRANSIENT_CODES = new Set(["RECEIPT_CHAIN_UNAVAILABLE"]);

// Every user-facing flow goes through Postgres; health must reflect that. This
// caught nothing for months until the Neon compute quota outage (2026-07-23)
// where /api/v1/health reported ok:true while every DB-backed route returned
// INTERNAL_ERROR.
async function databaseHealth(): Promise<{ ok: boolean; code?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof Error && error.message.includes("quota") ? "DB_QUOTA_EXCEEDED" : "DB_UNAVAILABLE"
    };
  }
}

export async function GET() {
  const queue = await analysisQueueReadiness();
  const queueEnabled = isAnalysisQueueEnabled();
  const receipt = await receiptSubsystemHealth();
  const database = await databaseHealth();

  const receiptReady = receipt.ok || RECEIPT_TRANSIENT_CODES.has(receipt.code ?? "");
  const ready = queue.ready && receiptReady && database.ok;

  return ok(
    {
      ok: ready,
      appEnv: config.APP_ENV,
      database,
      queue: {
        enabled: queueEnabled,
        mode: queue.mode,
        workerCount: queue.workerCount,
        ready: queue.ready
      },
      receipt
    },
    ready ? 200 : 503
  );
}
