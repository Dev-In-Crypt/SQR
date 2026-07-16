import { fail, handleRouteError } from "@/lib/api";
import { canReadReport, isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { reportToMarkdown } from "@/lib/report-export";
import { getSessionContext } from "@/lib/session";
import type { ReportPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const { reportId } = await context.params;
    const session = await getSessionContext();
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const format = (url.searchParams.get("format") || "md").toLowerCase();

    if (format !== "md") {
      return fail(400, "UNSUPPORTED_FORMAT", "Only format=md is supported");
    }

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
        }
      }
    });

    if (!report) {
      return fail(404, "NOT_FOUND", "Report not found");
    }

    const viewer = { userId: session.userId, sessionId: session.sessionId };

    if (!canReadReport({ report, viewer, token })) {
      return fail(403, "FORBIDDEN", "This report is private");
    }

    const owner = isReportOwner(report, viewer);
    const reportPayload = report.reportJson as unknown as ReportPayload;
    // Non-owners get the same stripped payload as the report API.
    const visibleReport: ReportPayload = owner
      ? reportPayload
      : { ...reportPayload, warnings: [], scannerErrors: [], partialReasons: [] };

    const markdown = reportToMarkdown({
      reportId: report.id,
      report: visibleReport,
      topSeverity: report.topSeverity,
      createdAt: report.createdAt,
      analysis: {
        inputType: report.analysis.inputType,
        chainId: report.analysis.chainId
      }
    });

    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="sqr-report-${report.id.slice(0, 8)}.md"`
      }
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/report/:reportId/export" });
  }
}
