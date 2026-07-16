import { z } from "zod";

import { analysisInputHash, findReusableAnalysis, intakeAnalysis } from "@/lib/analysis-intake";
import { ok, handleRouteError } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { config } from "@/lib/config";
import { enforcePublicLookupRateLimit } from "@/lib/rate-limit";
import { getClientIp, getSessionContext } from "@/lib/session";
import { createAnalysisSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Quick scan: static-only, no wallet required (a funnel, not the full product).
 * Unlike the full route, BASE_ADDRESS is allowed without wallet login — reading
 * verified source is public data and the expensive AI pipeline is skipped.
 */
export async function POST(request: Request) {
  try {
    const payloadRaw = await request.json();
    const session = await getSessionContext();
    const payload = createAnalysisSchema.parse(payloadRaw);

    // Only guard against a request wallet contradicting the authenticated one;
    // the full route's WALLET_REQUIRED gate for BASE_ADDRESS is intentionally
    // relaxed here.
    if (payload.wallet && session.walletAddress) {
      if (payload.wallet.toLowerCase() !== session.walletAddress.toLowerCase()) {
        throw new ApiError(403, "WALLET_MISMATCH", "Request wallet does not match authenticated wallet");
      }
    }

    const inputHash = analysisInputHash(payload);

    // A prior FULL report for the same input is strictly better — return it.
    const existingFull = await findReusableAnalysis({ inputHash, session });
    if (existingFull) {
      return ok({ analysisId: existingFull.id, status: "EXISTING", inputHash }, 202);
    }

    await enforcePublicLookupRateLimit({
      bucket: "quick-scan-ip",
      ip: await getClientIp(),
      limit: config.RATE_LIMIT_QUICK_SCAN_PER_DAY
    });

    const result = await intakeAnalysis({ payload, inputHash, session, mode: "QUICK_SCAN" });

    return ok(
      {
        analysisId: result.analysisId,
        status: result.status,
        inputHash: result.inputHash,
        errorCode: result.errorCode,
        mode: "QUICK_SCAN"
      },
      202
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return ok(
        {
          error: {
            code: "INVALID_PAYLOAD",
            message: error.issues.map((issue) => issue.message).join("; ")
          }
        },
        400
      );
    }

    return handleRouteError(error, { route: "POST /api/v1/analysis/quick" });
  }
}
