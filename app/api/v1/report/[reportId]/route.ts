import { fail, ok, handleRouteError } from "@/lib/api";
import { canReadReport, isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import type { ReportPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const session = await getSessionContext();
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        analysis: {
          select: {
            requesterUserId: true,
            requesterSessionId: true,
            inputType: true,
            chainId: true
          }
        },
        findings: {
          orderBy: [{ severity: "desc" }, { confidence: "desc" }]
        },
        receipt: true
      }
    });

    if (!report) {
      return fail(404, "NOT_FOUND", "Report not found");
    }

    const viewer = {
      userId: session.userId,
      sessionId: session.sessionId
    };

    const readable = canReadReport({ report, viewer, token });
    if (!readable) {
      return fail(403, "FORBIDDEN", "This report is private");
    }

    const owner = isReportOwner(report, viewer);
    const rawReportPayload = report.reportJson as unknown as ReportPayload;
    const reportPayload: ReportPayload = {
      ...rawReportPayload,
      pvmScan: rawReportPayload?.pvmScan ?? null
    };
    const visibleReport: ReportPayload = owner
      ? reportPayload
      : {
          ...reportPayload,
          warnings: [],
          scannerErrors: [],
          partialReasons: [],
          pvmScan: reportPayload.pvmScan
            ? {
                ...reportPayload.pvmScan,
                warnings: [],
                errors: []
              }
            : null
        };
    const receipt = report.receipt
      ? {
          ...report.receipt,
          receiptOwner: report.receipt.receiptOwner || report.receipt.mintedBy,
          receiptMinter: report.receipt.receiptMinter || report.receipt.mintedBy
        }
      : null;

    return ok({
      reportId: report.id,
      visibility: report.visibility,
      reportHash: report.reportHash,
      topSeverity: report.topSeverity,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      isOwner: owner,
      report: visibleReport,
      findings: report.findings,
      receipt,
      analysis: {
        inputType: report.analysis.inputType,
        chainId: report.analysis.chainId
      }
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/report/:reportId" });
  }
}
