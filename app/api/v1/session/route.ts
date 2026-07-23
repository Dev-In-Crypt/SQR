import { ok, handleRouteError } from "@/lib/api";
import { getOptionalSessionContext } from "@/lib/session";

export const runtime = "nodejs";

// Read-only: reports the current session without creating one. Cookieless
// first-visit reads return nulls; a session is minted by the first
// state-changing request (analysis submit, auth) so concurrent page-load
// fetches can never race to set different session cookies.
export async function GET() {
  try {
    const session = await getOptionalSessionContext();
    return ok({
      sessionId: session?.sessionId ?? null,
      userId: session?.userId ?? null,
      walletAddress: session?.walletAddress ?? null
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/session" });
  }
}
