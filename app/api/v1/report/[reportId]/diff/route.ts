import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { diffFindings, type DiffableFinding } from "@/lib/scan-diff";
import { getSessionContext } from "@/lib/session";
import type { ReportPayload } from "@/lib/types";

export const runtime = "nodejs";

interface FindingRow {
  title: string;
  severity: string;
  locationJson: unknown;
}

function toDiffable(findings: FindingRow[]): DiffableFinding[] {
  return findings.map((finding) => ({
    title: finding.title,
    severity: finding.severity as DiffableFinding["severity"],
    filePath:
      finding.locationJson && typeof finding.locationJson === "object" && "filePath" in finding.locationJson
        ? ((finding.locationJson as { filePath?: string }).filePath ?? null)
        : null
  }));
}

// Scan-to-scan diff: compares this report's findings against the requester's
// most recent PRIOR report for the same verified contract address on the same
// chain — the case where re-analyzing an address later (e.g. after a
// deploy-drift alert, or routine re-review) surfaces what changed. DB-only, no
// RPC, so unlike /drift this is cheap enough to compute eagerly. Owner-only:
// it reveals the existence and finding details of a separate report, which is
// only safe because the search is scoped to the SAME requester identity as
// the current report's owner.
export async function GET(
  request: Request,
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
            requesterSessionId: true,
            chainId: true,
            inputType: true
          }
        },
        findings: { select: { title: true, severity: true, locationJson: true } }
      }
    });

    if (!report) {
      return fail(404, "NOT_FOUND", "Report not found");
    }

    const viewer = { userId: session.userId, sessionId: session.sessionId };
    if (!isReportOwner(report, viewer)) {
      return fail(403, "FORBIDDEN", "Only the report owner can view the scan diff");
    }

    const reportPayload = report.reportJson as unknown as ReportPayload;
    const contractAddress = reportPayload.metadata.contractAddress;

    if (report.analysis.inputType !== "BASE_ADDRESS" || !contractAddress) {
      return ok({ available: false, reason: "NOT_APPLICABLE" });
    }

    const { requesterUserId, requesterSessionId } = report.analysis;

    const candidates = await prisma.report.findMany({
      where: {
        id: { not: report.id },
        createdAt: { lt: report.createdAt },
        analysis: {
          chainId: report.analysis.chainId,
          inputType: "BASE_ADDRESS",
          ...(requesterUserId
            ? { requesterUserId }
            : { requesterSessionId })
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        topSeverity: true,
        reportJson: true,
        findings: { select: { title: true, severity: true, locationJson: true } }
      }
    });

    const previous = candidates.find((candidate) => {
      const payload = candidate.reportJson as unknown as ReportPayload;
      return payload.metadata.contractAddress?.toLowerCase() === contractAddress.toLowerCase();
    });

    if (!previous) {
      return ok({ available: false, reason: "NO_PRIOR_REPORT" });
    }

    const diff = diffFindings(toDiffable(previous.findings), toDiffable(report.findings));

    return ok({
      available: true,
      previousReport: {
        reportId: previous.id,
        createdAt: previous.createdAt,
        topSeverity: previous.topSeverity
      },
      ...diff
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/report/:reportId/diff" });
  }
}
