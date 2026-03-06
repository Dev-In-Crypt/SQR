import { z } from "zod";

import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  explorerTxUrl,
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
    const payload = receiptConfirmSchema.parse(await request.json());
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

    const eventData = await readMintedEventFromTx(payload.txHash).catch(() => null);

    if (!eventData) {
      return fail(400, "MINT_EVENT_NOT_FOUND", "ReceiptMinted event not found for this transaction");
    }

    if (eventData.reportHash.toLowerCase() !== report.reportHash.toLowerCase()) {
      return fail(400, "HASH_MISMATCH", "Transaction event reportHash does not match this report");
    }

    const recoveredOwner = await recoverMintAuthorizationSigner({
      reportHash: report.reportHash,
      contractAddress: reportJson.metadata?.contractAddress ?? null,
      owner: payload.owner,
      nonce: payload.nonce,
      deadline: payload.deadline,
      signature: payload.signature
    });

    if (recoveredOwner.toLowerCase() !== payload.owner.toLowerCase()) {
      return fail(400, "INVALID_SIGNATURE", "Mint authorization signature is invalid");
    }

    if (eventData.owner.toLowerCase() !== recoveredOwner.toLowerCase()) {
      return fail(400, "OWNER_MISMATCH", "Transaction event owner does not match signed owner");
    }

    const created = await prisma.receipt.create({
      data: {
        reportId: report.id,
        reportHash: report.reportHash,
        txHash: payload.txHash,
        chainId: config.BASE_CHAIN_ID,
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
      explorerUrl: explorerTxUrl(payload.txHash, config.BASE_CHAIN_ID)
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
