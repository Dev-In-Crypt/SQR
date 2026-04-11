import { z } from "zod";

import { fail, ok, handleRouteError, parseJsonBody } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { requiredReceiptChainId } from "@/lib/base-network";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import {
  explorerTxUrl,
  hasTransactionReceiptOnRequiredChain,
  readMintedEventFromTx,
  recoverMintAuthorizationSigner
} from "@/lib/receipt";
import { getSessionContext } from "@/lib/session";
import { receiptConfirmSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const payload = receiptConfirmSchema.parse(await parseJsonBody(request));
    const { reportId } = await context.params;
    const session = await getSessionContext();

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        analysis: {
          select: {
            requesterUserId: true,
            requesterSessionId: true
          }
        },
        receipt: true
      }
    });

    if (!report) {
      return fail(404, "NOT_FOUND", "Report not found");
    }

    const owner = isReportOwner(report, {
      userId: session.userId,
      sessionId: session.sessionId
    });

    if (!owner) {
      return fail(403, "FORBIDDEN", "Only owner can confirm receipt");
    }

    if (!session.walletAddress) {
      return fail(401, "WALLET_REQUIRED", "Wallet login is required for receipt confirmation");
    }

    if (session.walletAddress.toLowerCase() !== payload.owner.toLowerCase()) {
      return fail(403, "OWNER_MISMATCH", "Signed owner must match connected wallet");
    }

    if (report.receipt) {
      return ok({
        existing: true,
        receipt: report.receipt,
        explorerUrl: explorerTxUrl(report.receipt.txHash, report.receipt.chainId)
      });
    }

    const reportJson = report.reportJson as {
      metadata?: { contractAddress?: string };
    };

    let onRequiredNetwork = false;
    try {
      onRequiredNetwork = await hasTransactionReceiptOnRequiredChain(payload.txHash);
    } catch {
      return fail(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt chain RPC is unavailable. Try again.");
    }
    if (!onRequiredNetwork) {
      return fail(400, "TX_NOT_FOUND_REQUIRED_NETWORK", "tx not found on required network");
    }

    let eventData: Awaited<ReturnType<typeof readMintedEventFromTx>> = null;
    try {
      eventData = await readMintedEventFromTx(payload.txHash);
    } catch {
      return fail(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt chain RPC is unavailable. Try again.");
    }

    if (!eventData) {
      return fail(400, "MINT_EVENT_NOT_FOUND", "ReceiptMinted event not found for this transaction");
    }

    if (eventData.reportHash.toLowerCase() !== report.reportHash.toLowerCase()) {
      return fail(400, "HASH_MISMATCH", "Transaction event reportHash does not match this report");
    }

    let recoveredOwner: string;
    try {
      recoveredOwner = await recoverMintAuthorizationSigner({
        reportHash: report.reportHash,
        contractAddress: reportJson.metadata?.contractAddress ?? null,
        owner: payload.owner,
        nonce: payload.nonce,
        deadline: payload.deadline,
        signature: payload.signature
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_SIGNATURE") {
        return fail(400, "INVALID_SIGNATURE", "Mint authorization signature is invalid");
      }

      if (error instanceof ApiError && error.status >= 500) {
        return fail(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt subsystem is temporarily unavailable.");
      }

      return fail(400, "INVALID_SIGNATURE", "Mint authorization signature is invalid");
    }

    if (recoveredOwner.toLowerCase() !== payload.owner.toLowerCase()) {
      return fail(400, "INVALID_SIGNATURE", "Mint authorization signature is invalid");
    }

    if (eventData.owner.toLowerCase() !== recoveredOwner.toLowerCase()) {
      return fail(400, "OWNER_MISMATCH", "Transaction event owner does not match signed owner");
    }

    const requiredChain = requiredReceiptChainId();

    const created = await prisma.receipt.create({
      data: {
        reportId: report.id,
        reportHash: report.reportHash,
        txHash: payload.txHash,
        chainId: requiredChain,
        contractAddress: eventData.contractAddress,
        receiptId: eventData.receiptId,
        mintedBy: eventData.minter,
        receiptOwner: eventData.owner,
        receiptMinter: eventData.minter,
        mintedAt: eventData.timestamp
      }
    });

    return ok({
      existing: false,
      receipt: created,
      explorerUrl: explorerTxUrl(payload.txHash, requiredChain)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(400, "INVALID_PAYLOAD", error.issues.map((issue) => issue.message).join("; "));
    }

    return handleRouteError(error, {
      route: "POST /api/v1/receipt/:reportId/confirm"
    });
  }
}
