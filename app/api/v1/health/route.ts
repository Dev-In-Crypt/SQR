import { ok } from "@/lib/api";
import { config } from "@/lib/config";
import { analysisQueueReadiness, isAnalysisQueueEnabled } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  const queue = await analysisQueueReadiness();
  const queueEnabled = isAnalysisQueueEnabled();
  const ready = queue.ready;

  return ok(
    {
      ok: ready,
      appEnv: config.APP_ENV,
      queue: {
        enabled: queueEnabled,
        mode: queue.mode,
        workerCount: queue.workerCount,
        ready: queue.ready
      }
    },
    ready ? 200 : 503
  );
}

