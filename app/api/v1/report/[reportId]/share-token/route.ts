import { fail, ok, handleRouteError } from "@/lib/api";
import { isReportOwner } from "@/lib/acl";
import { config } from "@/lib/config";
import { randomToken, hashPrivateToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
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
      return fail(403, "FORBIDDEN", "Only owner can create private share link");
    }

    const token = randomToken();
    const tokenHash = hashPrivateToken(token);

    await prisma.report.update({
      where: { id: report.id },
      data: {
        privateTokenHash: tokenHash,
        visibility: "PRIVATE"
      }
    });

    const relativePath = `/r/${report.id}?token=${token}`;

    return ok({
      token,
      path: relativePath,
      url: `${config.NEXT_PUBLIC_APP_URL}${relativePath}`
    });
  } catch (error) {
    return handleRouteError(error, {
      route: "POST /api/v1/report/:reportId/share-token"
    });
  }
}
