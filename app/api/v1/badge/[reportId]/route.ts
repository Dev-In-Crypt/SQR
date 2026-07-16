import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BadgeVariant = {
  statusText: string;
  statusColor: string;
};

const VARIANTS: Record<"anchored" | "screened" | "unknown", BadgeVariant> = {
  anchored: { statusText: "screened · receipt onchain", statusColor: "#1f7a4d" },
  screened: { statusText: "screened", statusColor: "#2f6feb" },
  unknown: { statusText: "not found", statusColor: "#6b7280" }
};

function renderBadge(variant: BadgeVariant): string {
  const label = "SQR";
  const labelWidth = 40;
  const statusWidth = variant.statusText.length * 6.6 + 20;
  const totalWidth = Math.round(labelWidth + statusWidth);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${variant.statusText}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".08"/></linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#1c1c1e"/>
    <rect x="${labelWidth}" width="${Math.round(statusWidth)}" height="20" fill="${variant.statusColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + statusWidth / 2}" y="14">${variant.statusText}</text>
  </g>
</svg>`;
}

function svgResponse(body: string, cacheSeconds: number): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}`
    }
  });
}

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await context.params;

  if (!UUID_PATTERN.test(reportId)) {
    return svgResponse(renderBadge(VARIANTS.unknown), 3600);
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, receipt: { select: { id: true } } }
    });

    if (!report) {
      return svgResponse(renderBadge(VARIANTS.unknown), 3600);
    }

    return svgResponse(renderBadge(report.receipt ? VARIANTS.anchored : VARIANTS.screened), 300);
  } catch {
    return svgResponse(renderBadge(VARIANTS.unknown), 60);
  }
}
