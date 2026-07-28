import { fail, ok, handleRouteError } from "@/lib/api";
import { canReadReport } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { checkDeployDrift, deployDriftEnabled } from "@/lib/drift";
import { enforcePublicLookupRateLimit } from "@/lib/rate-limit";
import { getClientIp, getSessionContext } from "@/lib/session";
import type { ReportPayload } from "@/lib/types";

export const runtime = "nodejs";

// On-demand deploy-drift check: re-fetches onchain state for a verified-address
// report and compares it to the baseline captured at analysis time. Read-only
// and non-mutating, so it follows the same visibility rule as the report GET
// (owner, PUBLIC, or a valid share token) rather than the stricter owner-only
// gate used by mutating receipt routes. Rate-limited because each call makes
// live RPC requests.
export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await context.params;
    const session = await getSessionContext();
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!deployDriftEnabled()) {
      return fail(404, "DEPLOY_DRIFT_DISABLED", "Deploy-drift monitoring is not enabled");
    }

    await enforcePublicLookupRateLimit({ bucket: "drift-check", ip: await getClientIp() });

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        analysis: { select: { requesterUserId: true, requesterSessionId: true } }
      }
    });

    if (!report) {
      return fail(404, "NOT_FOUND", "Report not found");
    }

    const viewer = { userId: session.userId, sessionId: session.sessionId };
    if (!canReadReport({ report, viewer, token })) {
      return fail(403, "FORBIDDEN", "This report is private");
    }

    const reportPayload = report.reportJson as unknown as ReportPayload;
    const baseline = reportPayload.deployDriftBaseline;

    if (!baseline) {
      return ok({
        available: false,
        reason: "NO_BASELINE_CAPTURED"
      });
    }

    const baselineSummary = {
      chainId: baseline.chainId,
      contractAddress: baseline.contractAddress,
      isProxy: baseline.isProxy,
      implementationAddress: baseline.implementationAddress,
      capturedAt: baseline.capturedAt
    };

    // A failed RPC check must not read as "no drift" — that would mask a real
    // upgrade behind a transient outage. Surface it as a distinct unchecked state.
    try {
      const check = await checkDeployDrift(baseline);
      return ok({ available: true, checked: true, baseline: baselineSummary, ...check });
    } catch {
      return ok({
        available: true,
        checked: false,
        reason: "RPC_UNAVAILABLE",
        baseline: baselineSummary
      });
    }
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/report/:reportId/drift" });
  }
}
