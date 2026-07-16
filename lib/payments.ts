import { facilitator as cdpFacilitator } from "@coinbase/x402";

import { BASE_MAINNET_CHAIN_ID, requiredReceiptChainId } from "@/lib/base-network";
import { config } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { logError, logInfo, logWarn } from "@/lib/logger";
import type { SessionContext } from "@/lib/session";

export type PaymentOutcome = "CONSUMED" | "RETRY_CREDIT";

/** x402 v1 network identifier for the chain analyses/receipts run on. */
export function paymentNetwork(): "base" | "base-sepolia" {
  return requiredReceiptChainId() === BASE_MAINNET_CHAIN_ID ? "base" : "base-sepolia";
}

export function paymentPriceString(): string {
  return `$${config.PAYMENT_PRICE_USDC.toFixed(2)}`;
}

export function paymentAmountMicroUsdc(): bigint {
  return BigInt(Math.round(config.PAYMENT_PRICE_USDC * 1_000_000));
}

export function paymentReceiver(): `0x${string}` {
  const value = config.PAYMENT_RECEIVER_ADDRESS;
  if (!value || !value.startsWith("0x")) {
    throw new ApiError(503, "PAYMENTS_UNAVAILABLE", "Payment receiver address is not configured");
  }
  return value as `0x${string}`;
}

/**
 * Mainnet settlement goes through the CDP facilitator (requires CDP_API_KEY_ID /
 * CDP_API_KEY_SECRET in the environment). On testnet we return undefined so the
 * SDK falls back to the free x402.org facilitator (Base Sepolia only).
 *
 * Typed as unknown because @coinbase/x402 ships the v2 FacilitatorConfig type
 * while x402-next@1.x expects the structurally identical legacy type; the
 * single call site casts to the parameter type it needs.
 */
export function paymentFacilitator(): unknown {
  return paymentNetwork() === "base" ? cdpFacilitator : undefined;
}

/** Decoded x402 v1 settlement (X-PAYMENT-RESPONSE header payload). */
export type SettlementInfo = {
  success?: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
};

export function decodeSettlementHeader(headerValue: string): SettlementInfo | null {
  try {
    return JSON.parse(Buffer.from(headerValue, "base64").toString("utf8")) as SettlementInfo;
  } catch {
    return null;
  }
}

export async function recordSettledPayment(params: {
  settlement: SettlementInfo;
  analysisId: string | null;
  session: SessionContext;
}): Promise<void> {
  const { settlement, analysisId, session } = params;

  try {
    await prisma.payment.create({
      data: {
        payer: (settlement.payer ?? "unknown").toLowerCase(),
        amountMicroUsdc: paymentAmountMicroUsdc(),
        chainId: requiredReceiptChainId(),
        txHash: settlement.transaction ?? null,
        facilitatorRef: settlement.network ?? null,
        status: "SETTLED",
        analysisId,
        requesterUserId: session.userId,
        requesterSessionId: session.userId ? null : session.sessionId
      }
    });

    logInfo("Paid analysis settled", {
      analysisId,
      payer: settlement.payer,
      txHash: settlement.transaction
    });
  } catch (error) {
    // The payment settled onchain; a bookkeeping failure must not fail the response.
    logError("Failed to record settled payment", {
      analysisId,
      txHash: settlement.transaction,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function requesterWhere(session: SessionContext) {
  return session.userId
    ? { requesterUserId: session.userId }
    : { requesterSessionId: session.sessionId };
}

/** Oldest available retry credit for this requester, if any. */
export async function findRetryCredit(session: SessionContext): Promise<{ id: string } | null> {
  return prisma.payment.findFirst({
    where: { ...requesterWhere(session), status: "RETRY_CREDIT" },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
}

/** Consumes a retry credit by pointing it at the replacement analysis. */
export async function consumeRetryCredit(paymentId: string, newAnalysisId: string): Promise<void> {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "SETTLED", analysisId: newAnalysisId }
  });
}

/**
 * Called from the pipeline when an analysis reaches a terminal state. A paid
 * analysis that FAILED grants a retry credit instead of eating the payment;
 * success (including PARTIAL/warnings) consumes it. No-op for unpaid analyses.
 */
export async function markPaymentOutcomeForAnalysis(
  analysisId: string,
  outcome: PaymentOutcome
): Promise<void> {
  try {
    const updated = await prisma.payment.updateMany({
      where: { analysisId, status: "SETTLED" },
      data: { status: outcome }
    });

    if (updated.count > 0) {
      logInfo("Payment outcome recorded", { analysisId, outcome });
    }
  } catch (error) {
    logWarn("Failed to record payment outcome", {
      analysisId,
      outcome,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
