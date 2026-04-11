import { ok, handleRouteError } from "@/lib/api";
import {
  requiredReceiptAddEthereumChainParams,
  requiredReceiptNetwork
} from "@/lib/base-network";
import { defaultAnalysisChainId, listSupportedAddressChains } from "@/lib/chains";

export const runtime = "nodejs";

export async function GET() {
  try {
    const network = requiredReceiptNetwork();
    const supportedChains = listSupportedAddressChains();

    return ok({
      analysis: {
        defaultChainId: defaultAnalysisChainId(),
        supportedChains: supportedChains.map((chain) => ({
          chainId: chain.chainId,
          chainHex: chain.chainHex,
          label: chain.requiredNetworkLabel,
          chainName: chain.chainName,
          nativeCurrency: chain.nativeCurrency,
          explorerBaseUrl: chain.blockExplorerUrl
        })),
        reviewModes: [
          { value: "DEFI_PAYFI", label: "DeFi / PayFi Review Mode" },
          { value: "STANDARD", label: "Standard Review Mode" }
        ]
      },
      receipt: {
        requiredChainId: network.chainId,
        requiredChainHex: network.chainHex,
        requiredNetworkName: network.requiredNetworkName,
        requiredNetworkLabel: network.requiredNetworkLabel,
        addEthereumChain: requiredReceiptAddEthereumChainParams()
      }
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/config" });
  }
}
