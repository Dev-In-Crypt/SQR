import { ok, handleRouteError } from "@/lib/api";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSessionContext();
    return ok({
      sessionId: session.sessionId,
      userId: session.userId,
      walletAddress: session.walletAddress
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/session" });
  }
}
