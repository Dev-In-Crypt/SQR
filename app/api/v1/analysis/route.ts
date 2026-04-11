import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ok, handleRouteError, parseJsonBody } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { assertAnalysisQueueReady, enqueueAnalysisJob } from "@/lib/queue";
import { enforceAnalysisCreateRateLimit } from "@/lib/rate-limit";
import { getClientIp, getSessionContext } from "@/lib/session";
import { computeInputHash, sourceBundleFromAddress, sourceBundleFromPaste } from "@/lib/source";
import { createAnalysisSchema } from "@/lib/validation";

export const runtime = "nodejs";

const NON_FATAL_SOURCE_ERROR_CODES = new Set([
  "SOURCE_UNVERIFIED",
  "BASESCAN_INVALID_API_KEY",
  "BASESCAN_RATE_LIMIT",
  "BASESCAN_TIMEOUT",
  "BASESCAN_MALFORMED_JSON",
  "BASESCAN_V1_DEPRECATED",
  "BASESCAN_NOTOK",
  "BASESCAN_HTTP_429",
  "BASESCAN_HTTP_503",
  "BLOCKSCOUT_RATE_LIMIT",
  "BLOCKSCOUT_TIMEOUT",
  "BLOCKSCOUT_MALFORMED_JSON",
  "BLOCKSCOUT_NOTOK",
  "BLOCKSCOUT_HTTP_429",
  "BLOCKSCOUT_HTTP_503"
]);

export async function POST(request: Request) {
  try {
    const payloadRaw = await parseJsonBody(request);
    const session = await getSessionContext();

    await enforceAnalysisCreateRateLimit({
      ip: await getClientIp(),
      wallet: session.walletAddress
    });

    const payload = createAnalysisSchema.parse(payloadRaw);

    if (payload.wallet && session.walletAddress) {
      if (payload.wallet.toLowerCase() !== session.walletAddress.toLowerCase()) {
        throw new ApiError(403, "WALLET_MISMATCH", "Request wallet does not match authenticated wallet");
      }
    }

    if (payload.inputType === "BASE_ADDRESS" && !session.userId) {
      throw new ApiError(401, "WALLET_REQUIRED", "Wallet login is required for verified address analysis");
    }

    const inputHash = computeInputHash({
      inputType: payload.inputType,
      chainId: payload.chainId,
      reviewMode: payload.reviewMode,
      code: payload.code,
      address: payload.address
    });

    const requesterConstraint = session.userId
      ? { requesterUserId: session.userId }
      : { requesterSessionId: session.sessionId };

    const windowStart = new Date(Date.now() - 10 * 60 * 1000);
    const existing = await prisma.analysisRequest.findFirst({
      where: {
        inputHash,
        createdAt: {
          gte: windowStart
        },
        ...requesterConstraint,
        status: {
          in: ["QUEUED", "RUNNING", "COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

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

    let sourceBundle:
      | Awaited<ReturnType<typeof sourceBundleFromPaste>>
      | Awaited<ReturnType<typeof sourceBundleFromAddress>>
      | null = null;

    let failCode: string | null = null;

    try {
      sourceBundle =
        payload.inputType === "PASTE_CODE"
          ? await sourceBundleFromPaste({ code: payload.code!, chainId: payload.chainId })
          : await sourceBundleFromAddress({ address: payload.address!, chainId: payload.chainId });
    } catch (error) {
      if (error instanceof ApiError && NON_FATAL_SOURCE_ERROR_CODES.has(error.code)) {
        failCode = error.code;
      } else {
        throw error;
      }
    }

    if (!failCode) {
      await assertAnalysisQueueReady();
    }

    const analysis = await prisma.analysisRequest.create({
      data: {
        inputType: payload.inputType,
        chainId: payload.chainId,
        inputHash,
        sourceHash: sourceBundle?.sourceHash,
        status: failCode ? "FAILED" : "QUEUED",
        errorCode: failCode,
        requesterUserId: session.userId,
        requesterSessionId: session.sessionId
      }
    });

    if (sourceBundle) {
      await prisma.sourceBundle.create({
        data: {
          analysisId: analysis.id,
          sourceJson: sourceBundle as unknown as Prisma.InputJsonValue,
          sourceMetaJson: {
            ...(sourceBundle.sourceMeta as Record<string, unknown>),
            reviewMode: payload.reviewMode
          } as Prisma.InputJsonValue,
          lineCount: sourceBundle.lineCount,
          isVerifiedSource: sourceBundle.isVerifiedSource
        }
      });
    }

    if (!failCode) {
      await enqueueAnalysisJob(analysis.id);
    }

    return ok(
      {
        analysisId: analysis.id,
        status: failCode ? "FAILED" : "QUEUED",
        inputHash,
        errorCode: failCode
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
