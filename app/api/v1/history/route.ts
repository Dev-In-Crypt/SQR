import { fail, ok, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session.userId) {
      return fail(401, "UNAUTHORIZED", "Wallet login required");
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));

    const reports = await prisma.report.findMany({
      where: {
        analysis: {
          requesterUserId: session.userId
        }
      },
      include: {
        analysis: {
          select: {
            inputType: true,
            chainId: true
          }
        },
        receipt: {
          select: {
            txHash: true,
            chainId: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {})
    });

    const hasMore = reports.length > limit;
    const items = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return ok({
      items: items.map((item) => ({
        reportId: item.id,
        createdAt: item.createdAt,
        topSeverity: item.topSeverity,
        visibility: item.visibility,
        reportHash: item.reportHash,
        inputType: item.analysis.inputType,
        chainId: item.analysis.chainId,
        receipt: item.receipt
      })),
      nextCursor
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/history" });
  }
}
