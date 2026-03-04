import { ok, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getSessionContext();

    await prisma.session.update({
      where: {
        sessionId: session.sessionId
      },
      data: {
        userId: null
      }
    });

    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error, { route: "POST /api/v1/auth/logout" });
  }
}
