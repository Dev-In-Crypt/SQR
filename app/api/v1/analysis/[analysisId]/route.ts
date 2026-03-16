import { fail, ok, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { peekPrivateToken } from "@/lib/request-context";
import { getSessionContext } from "@/lib/session";

function readAnalysisErrorDetail(sourceMetaJson: unknown): string | null {
  if (!sourceMetaJson || typeof sourceMetaJson !== "object") {
    return null;
  }

  const sourceMeta = sourceMetaJson as Record<string, unknown>;
  const processingError = sourceMeta.processingError;
  if (!processingError || typeof processingError !== "object") {
    return null;
  }

  const detail = (processingError as Record<string, unknown>).detail;
  if (typeof detail !== "string") {
    return null;
  }

  const trimmed = detail.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ analysisId: string }> }
) {
  try {
    const { analysisId } = await context.params;
    const session = await getSessionContext();

    const analysis = await prisma.analysisRequest.findUnique({
      where: { id: analysisId },
      include: {
        sourceBundle: {
          select: {
            sourceMetaJson: true
          }
        },
        report: {
          select: {
            id: true
          }
        }
      }
    });

    if (!analysis) {
      return fail(404, "NOT_FOUND", "Analysis not found");
    }

    const isOwner =
      (session.userId && analysis.requesterUserId === session.userId) ||
      analysis.requesterSessionId === session.sessionId;

    if (!isOwner) {
      return fail(404, "NOT_FOUND", "Analysis not found");
    }

    const privateToken =
      analysis.status === "COMPLETED" ||
      analysis.status === "DONE_WITH_WARNINGS" ||
      analysis.status === "PARTIAL"
        ? await peekPrivateToken(analysis.id)
        : null;

    return ok({
      analysisId: analysis.id,
      status: analysis.status,
      pipelineStage: analysis.pipelineStage,
      reportId: analysis.report?.id ?? null,
      errorCode: analysis.errorCode,
      errorDetail: analysis.status === "FAILED" ? readAnalysisErrorDetail(analysis.sourceBundle?.sourceMetaJson) : null,
      privateToken
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/analysis/:analysisId" });
  }
}
