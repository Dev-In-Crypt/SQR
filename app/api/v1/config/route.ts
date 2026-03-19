import { ok, handleRouteError } from "@/lib/api";
import {
  enabledAnalysisNetworks,
  enabledReceiptNetworks,
  isPolkadotHubChainId,
  requiredReceiptAddEthereumChainParams,
  requiredReceiptNetwork
} from "@/lib/base-network";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const network = requiredReceiptNetwork();

    return ok({
      analysis: {
        defaultChainId: config.BASE_CHAIN_ID,
        supportedNetworks: enabledAnalysisNetworks()
          .filter(
            (item) => !isPolkadotHubChainId(item.chainId) || item.chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID
          )
          .map((item) => ({
            chainId: item.chainId,
            chainHex: item.chainHex,
            name: item.chainName,
            label: item.label,
            blockExplorerUrl: item.blockExplorerUrl,
            isPolkadotHub: isPolkadotHubChainId(item.chainId)
          }))
      },
      receipt: {
        requiredChainId: network.chainId,
        requiredChainHex: network.chainHex,
        requiredNetworkName: network.requiredNetworkName,
        requiredNetworkLabel: network.requiredNetworkLabel,
        addEthereumChain: requiredReceiptAddEthereumChainParams(),
        supportedNetworks: enabledReceiptNetworks().map((item) => ({
          chainId: item.chainId,
          chainHex: item.chainHex,
          name: item.chainName,
          label: item.requiredNetworkLabel,
          blockExplorerUrl: item.blockExplorerUrl,
          addEthereumChain: {
            chainId: item.chainHex,
            chainName: item.chainName,
            nativeCurrency: item.nativeCurrency,
            rpcUrls: [item.rpcUrl],
            blockExplorerUrls: [item.blockExplorerUrl]
          }
        }))
      }
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/config" });
  }
}
