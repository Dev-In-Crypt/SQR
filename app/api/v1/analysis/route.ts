import { z } from "zod";

import {
  analysisInputHash,
  findReusableAnalysis,
  intakeAnalysis,
  validateAnalysisAccess
} from "@/lib/analysis-intake";
import { ok, handleRouteError } from "@/lib/api";
import { enforceAnalysisCreateRateLimit } from "@/lib/rate-limit";
import { getClientIp, getSessionContext } from "@/lib/session";
import { createAnalysisSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payloadRaw = await request.json();
    const session = await getSessionContext();
    const payload = createAnalysisSchema.parse(payloadRaw);

    validateAnalysisAccess(payload, session);

    const inputHash = analysisInputHash(payload);

    // Reuse before rate limiting: returning an existing report costs nothing,
    // so it should neither consume quota nor produce a 429.
    const existing = await findReusableAnalysis({ inputHash, session });
    if (existing) {
      return ok(
        {
          analysisId: existing.id,
          status: "EXISTING",
          inputHash
        },
        202
      );
    }

    await enforceAnalysisCreateRateLimit({
      ip: await getClientIp(),
      wallet: session.walletAddress
    });

    const result = await intakeAnalysis({ payload, inputHash, session });

    return ok(
      {
        analysisId: result.analysisId,
        status: result.status,
        inputHash: result.inputHash,
        errorCode: result.errorCode
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

    return handleRouteError(error, { route: "POST /api/v1/analysis" });
  }
}
