import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ok, handleRouteError } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { enqueueAnalysisJob } from "@/lib/queue";
import { enforceAnalysisCreateRateLimit } from "@/lib/rate-limit";
import { getClientIp, getSessionContext } from "@/lib/session";
import { computeInputHash, sourceBundleFromAddress, sourceBundleFromPaste } from "@/lib/source";
import { createAnalysisSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payloadRaw = await request.json();
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
      throw new ApiError(401, "WALLET_REQUIRED", "Wallet login is required for Base address analysis");
    }

    const inputHash = computeInputHash({
      inputType: payload.inputType,
      chainId: payload.chainId,
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
      if (error instanceof ApiError && error.code === "SOURCE_UNVERIFIED") {
        failCode = error.code;
      } else {
        throw error;
      }
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
          sourceMetaJson: sourceBundle.sourceMeta as Prisma.InputJsonValue,
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
