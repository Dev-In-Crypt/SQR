import { Prisma, type AnalysisMode } from "@prisma/client";
import type { z } from "zod";

import { ApiError } from "@/lib/errors";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { assertAnalysisQueueReady, enqueueAnalysisJob } from "@/lib/queue";
import type { SessionContext } from "@/lib/session";
import { computeInputHash, sourceBundleFromAddress, sourceBundleFromPaste } from "@/lib/source";
import type { createAnalysisSchema } from "@/lib/validation";

export type AnalysisPayload = z.infer<typeof createAnalysisSchema>;

const NON_FATAL_SOURCE_ERROR_CODES = new Set([
  "SOURCE_UNVERIFIED",
  "BASESCAN_INVALID_API_KEY",
  "BASESCAN_RATE_LIMIT",
  "BASESCAN_TIMEOUT",
  "BASESCAN_MALFORMED_JSON",
  "BASESCAN_V1_DEPRECATED",
  "BASESCAN_NOTOK",
  "BASESCAN_HTTP_429",
  "BASESCAN_HTTP_503"
]);

export function validateAnalysisAccess(payload: AnalysisPayload, session: SessionContext): void {
  if (payload.wallet && session.walletAddress) {
    if (payload.wallet.toLowerCase() !== session.walletAddress.toLowerCase()) {
      throw new ApiError(403, "WALLET_MISMATCH", "Request wallet does not match authenticated wallet");
    }
  }

  if (payload.inputType === "BASE_ADDRESS" && !session.userId) {
    throw new ApiError(401, "WALLET_REQUIRED", "Wallet login is required for Base address analysis");
  }
}

export function analysisInputHash(payload: AnalysisPayload): string {
  return computeInputHash({
    inputType: payload.inputType,
    chainId: payload.chainId,
    code: payload.code,
    address: payload.address
  });
}

function requesterConstraintFor(session: SessionContext) {
  return session.userId
    ? { requesterUserId: session.userId }
    : { requesterSessionId: session.sessionId };
}

/**
 * In-flight and partial runs dedupe on a short window (stale sweeper handles hung
 * jobs); successful reports are reused for ANALYSIS_REUSE_WINDOW_MINUTES to avoid
 * re-running the full pipeline (and LLM spend) on identical input.
 *
 * Only FULL analyses are reusable: a static-only QUICK_SCAN must never satisfy a
 * full or paid request for the same input (they are different products).
 */
export async function findReusableAnalysis(params: {
  inputHash: string;
  session: SessionContext;
}): Promise<{ id: string } | null> {
  const inFlightWindowStart = new Date(Date.now() - 10 * 60 * 1000);
  const reuseWindowStart = new Date(Date.now() - config.ANALYSIS_REUSE_WINDOW_MINUTES * 60 * 1000);

  return prisma.analysisRequest.findFirst({
    where: {
      inputHash: params.inputHash,
      mode: "FULL",
      ...requesterConstraintFor(params.session),
      OR: [
        {
          status: { in: ["QUEUED", "RUNNING", "PARTIAL"] },
          createdAt: { gte: inFlightWindowStart }
        },
        {
          status: { in: ["COMPLETED", "DONE_WITH_WARNINGS"] },
          createdAt: { gte: reuseWindowStart }
        }
      ]
    },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
}

export type AnalysisIntakeResult = {
  analysisId: string;
  status: "QUEUED" | "FAILED";
  inputHash: string;
  errorCode: string | null;
};

/**
 * Creates an AnalysisRequest (with its source bundle) and enqueues the pipeline.
 * Rate limiting and reuse checks are the caller's responsibility.
 */
export async function intakeAnalysis(params: {
  payload: AnalysisPayload;
  inputHash: string;
  session: SessionContext;
  mode?: AnalysisMode;
}): Promise<AnalysisIntakeResult> {
  const { payload, inputHash, session } = params;
  const mode: AnalysisMode = params.mode ?? "FULL";

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
      mode,
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

  return {
    analysisId: analysis.id,
    status: failCode ? "FAILED" : "QUEUED",
    inputHash,
    errorCode: failCode
  };
}
