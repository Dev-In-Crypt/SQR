import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { prepareMintTransaction } from "@/lib/receipt";
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

    const owner = isReportOwner(report, {
      userId: session.userId,
      sessionId: session.sessionId
    });

    if (!owner) {
      return fail(403, "FORBIDDEN", "Only owner can mint receipt");
    }

    if (report.receipt) {
      return ok({
        existing: true,
        receipt: report.receipt
      });
    }

    const reportJson = report.reportJson as {
      metadata?: { contractAddress?: string };
    };

    const tx = prepareMintTransaction({
      reportHash: report.reportHash,
      contractAddress: reportJson.metadata?.contractAddress ?? null
    });

    return ok({
      existing: false,
      tx
    });
  } catch (error) {
    return handleRouteError(error, {
      route: "POST /api/v1/receipt/:reportId/prepare"
    });
  }
}
