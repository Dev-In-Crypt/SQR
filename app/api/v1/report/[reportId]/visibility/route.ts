import { z } from "zod";

import { fail, ok, handleRouteError, parseJsonBody } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { visibilitySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> }
) {
  try {
    const payload = visibilitySchema.parse(await parseJsonBody(request));
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
        }
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
      return fail(403, "FORBIDDEN", "Only report owner can change visibility");
    }

    await prisma.report.update({
      where: { id: report.id },
      data: {
        visibility: payload.visibility
      }
    });

    return ok({ ok: true, visibility: payload.visibility });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(400, "INVALID_PAYLOAD", error.issues.map((issue) => issue.message).join("; "));
    }

    return handleRouteError(error, {
      route: "POST /api/v1/report/:reportId/visibility"
    });
  }
}
