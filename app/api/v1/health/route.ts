import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { analysisQueueReadiness, isAnalysisQueueEnabled } from "@/lib/queue";
import { receiptSubsystemHealth } from "@/lib/receipt";

export const runtime = "nodejs";

// Transient RPC problems degrade the receipt section without failing overall
// health; a deterministic misconfiguration (wrong contract/chain) fails it so
// deploy verification catches the regression.
const RECEIPT_TRANSIENT_CODES = new Set(["RECEIPT_CHAIN_UNAVAILABLE"]);

export async function GET() {
  const queue = await analysisQueueReadiness();
  const queueEnabled = isAnalysisQueueEnabled();
  const receipt = await receiptSubsystemHealth();

  const receiptReady = receipt.ok || RECEIPT_TRANSIENT_CODES.has(receipt.code ?? "");
  const ready = queue.ready && receiptReady;

  return ok(
    {
      ok: ready,
      appEnv: config.APP_ENV,
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
