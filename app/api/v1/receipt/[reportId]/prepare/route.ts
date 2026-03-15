import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { prepareMintAuthorization, readMintedReceiptByHash } from "@/lib/receipt";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
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

    if (!session.walletAddress) {
      return fail(401, "WALLET_REQUIRED", "Wallet login is required for receipt minting");
    }

    const owner = isReportOwner(report, {
      userId: session.userId,
      sessionId: session.sessionId
    });

    if (!owner) {
      return fail(
        403,
        "OWNER_MISMATCH",
        "Connected wallet does not match the report owner. Switch wallet and retry."
      );
    }

    if (report.receipt) {
      return ok({
        existing: true,
        receipt: report.receipt
      });
    }

    const onchainReceipt = await readMintedReceiptByHash(report.reportHash);
    if (
      onchainReceipt.exists &&
      onchainReceipt.owner.toLowerCase() !== session.walletAddress.toLowerCase()
    ) {
      return fail(
        409,
        "OWNER_MISMATCH_ONCHAIN",
        `This report hash is already minted onchain for ${onchainReceipt.owner}. Switch to that wallet and retry.`
      );
    }

    const reportJson = report.reportJson as {
      metadata?: { contractAddress?: string };
    };

    const prepared = await prepareMintAuthorization({
      reportHash: report.reportHash,
      contractAddress: reportJson.metadata?.contractAddress ?? null,
      owner: session.walletAddress,
      ttlSeconds: 10 * 60
    });

    return ok({
      existing: false,
      typedData: prepared.typedData,
      call: prepared.call
    });
  } catch (error) {
    return handleRouteError(error, {
      route: "POST /api/v1/receipt/:reportId/prepare"
    });
  }
}
