import { z } from "zod";

import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { explorerTxUrl, readMintedEventFromTx } from "@/lib/receipt";
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

    if (report.receipt) {
      return ok({
        existing: true,
        receipt: report.receipt,
        explorerUrl: explorerTxUrl(report.receipt.txHash, report.receipt.chainId)
      });
    }

    const eventData = await readMintedEventFromTx(payload.txHash).catch(() => null);

    if (eventData && eventData.reportHash.toLowerCase() !== report.reportHash.toLowerCase()) {
      return fail(400, "HASH_MISMATCH", "Transaction event reportHash does not match this report");
    }

    const reportJson = report.reportJson as {
      metadata?: { contractAddress?: string };
    };

    const created = await prisma.receipt.create({
      data: {
        reportId: report.id,
        reportHash: report.reportHash,
        txHash: payload.txHash,
        chainId: config.BASE_CHAIN_ID,
        contractAddress:
          eventData?.contractAddress || reportJson.metadata?.contractAddress || "0x0000000000000000000000000000000000000000",
        receiptId: eventData?.receiptId || "0",
        mintedBy: eventData?.owner || session.walletAddress || "0x0000000000000000000000000000000000000000",
        mintedAt: eventData?.timestamp || new Date()
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
