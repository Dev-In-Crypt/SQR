import { Prisma } from "@prisma/client";

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
    const severity = url.searchParams.get("severity") || undefined;
    const visibility = url.searchParams.get("visibility") || undefined;
    const inputType = url.searchParams.get("inputType") || undefined;
    const hasReceipt = url.searchParams.get("hasReceipt") || undefined;
    const query = url.searchParams.get("query")?.trim() || undefined;
    const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";

    const where: Prisma.ReportWhereInput = {
      analysis: {
        requesterUserId: session.userId,
        ...(inputType ? { inputType: inputType as "PASTE_CODE" | "BASE_ADDRESS" } : {})
      },
      ...(severity ? { topSeverity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" } : {}),
      ...(visibility ? { visibility: visibility as "PRIVATE" | "PUBLIC" } : {}),
      ...(hasReceipt === "true"
        ? { receipt: { isNot: null } }
        : hasReceipt === "false"
          ? { receipt: null }
          : {}),
      ...(query
        ? {
            OR: [
              { reportHash: { contains: query, mode: "insensitive" } },
              { id: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const reports = await prisma.report.findMany({
      where,
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
      orderBy:
        sort === "oldest"
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
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
