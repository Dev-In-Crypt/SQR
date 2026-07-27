import { ok, handleRouteError } from "@/lib/api";
import {
  analysisNetworks,
  requiredReceiptAddEthereumChainParams,
  requiredReceiptNetwork
} from "@/lib/base-network";

export const runtime = "nodejs";

export async function GET() {
  try {
    const network = requiredReceiptNetwork();

    return ok({
      receipt: {
        requiredChainId: network.chainId,
        requiredChainHex: network.chainHex,
        requiredNetworkName: network.requiredNetworkName,
        requiredNetworkLabel: network.requiredNetworkLabel,
        addEthereumChain: requiredReceiptAddEthereumChainParams()
      },
      analysisNetworks: analysisNetworks()
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/config" });
  }
}
