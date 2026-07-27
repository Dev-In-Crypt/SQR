import { ApiError } from "@/lib/errors";
import { config } from "@/lib/config";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const ARBITRUM_ONE_CHAIN_ID = 42161;
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;

interface BaseNetworkMetadata {
  chainId: number;
  chainHex: `0x${string}`;
  chainName: string;
  requiredNetworkName: string;
  requiredNetworkLabel: string;
  blockExplorerUrl: string;
}

export interface AddEthereumChainParams {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

function metadataForChainId(chainId: number): BaseNetworkMetadata {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0x2105",
      chainName: "Base",
      requiredNetworkName: "Base",
      requiredNetworkLabel: "Base Mainnet",
      blockExplorerUrl: "https://basescan.org"
    };
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0x14a34",
      chainName: "Base Sepolia",
      requiredNetworkName: "Base Sepolia",
      requiredNetworkLabel: "Base Sepolia",
      blockExplorerUrl: "https://sepolia.basescan.org"
    };
  }

  if (chainId === ARBITRUM_ONE_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0xa4b1",
      chainName: "Arbitrum One",
      requiredNetworkName: "Arbitrum One",
      requiredNetworkLabel: "Arbitrum One",
      blockExplorerUrl: "https://arbiscan.io"
    };
  }

  if (chainId === ARBITRUM_SEPOLIA_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0x66eee",
      chainName: "Arbitrum Sepolia",
      requiredNetworkName: "Arbitrum Sepolia",
      requiredNetworkLabel: "Arbitrum Sepolia",
      blockExplorerUrl: "https://sepolia.arbiscan.io"
    };
  }

  throw new ApiError(
    500,
    "UNSUPPORTED_RECEIPT_CHAIN",
    `Unsupported chainId ${chainId}. Supported: Base (8453/84532), Arbitrum (42161/421614).`
  );
}

function rpcUrlForChainId(chainId: number): string | null {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return config.BASE_MAINNET_RPC_URL || config.BASE_RPC_URL || null;
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return config.BASE_SEPOLIA_RPC_URL || config.BASE_RPC_URL || null;
  }

  if (chainId === ARBITRUM_ONE_CHAIN_ID) {
    return config.ARBITRUM_RPC_URL || null;
  }

  if (chainId === ARBITRUM_SEPOLIA_CHAIN_ID) {
    return config.ARBITRUM_SEPOLIA_RPC_URL || config.ARBITRUM_RPC_URL || null;
  }

  return config.BASE_RPC_URL || null;
}

/** Networks the user may pick for analysis. Base always; Arbitrum when enabled. */
export function analysisNetworks(): Array<{ chainId: number; label: string }> {
  const networks = [{ chainId: BASE_MAINNET_CHAIN_ID, label: "Base" }];
  if (config.arbitrumEnabled) {
    networks.push({ chainId: ARBITRUM_ONE_CHAIN_ID, label: "Arbitrum One" });
  }
  return networks;
}

/** Human label for a chainId, safe for any chain (no throw). */
export function networkLabelForChainId(chainId: number): string {
  try {
    return metadataForChainId(chainId).chainName;
  } catch {
    return `Chain ${chainId}`;
  }
}

export function requiredReceiptChainId(): number {
  if (config.APP_ENV === "staging") {
    return BASE_SEPOLIA_CHAIN_ID;
  }

  if (config.APP_ENV === "production") {
    return BASE_MAINNET_CHAIN_ID;
  }

  return config.BASE_CHAIN_ID;
}

export function requiredReceiptRpcUrl(): string {
  const chainId = requiredReceiptChainId();
  const url = rpcUrlForChainId(chainId);

  if (!url) {
    throw new ApiError(
      503,
      "RECEIPT_RPC_UNAVAILABLE",
      `RPC URL is not configured for required receipt chain ${chainId}`
    );
  }

  return url;
}

export function receiptNetworkByChainId(chainId: number): BaseNetworkMetadata {
  return metadataForChainId(chainId);
}

export function requiredReceiptNetwork() {
  const chainId = requiredReceiptChainId();
  const metadata = metadataForChainId(chainId);
  const rpcUrl = requiredReceiptRpcUrl();

  return {
    ...metadata,
    rpcUrl
  };
}

export function addEthereumChainParamsForChain(chainId: number, rpcUrl: string): AddEthereumChainParams {
  const metadata = metadataForChainId(chainId);

  return {
    chainId: metadata.chainHex,
    chainName: metadata.chainName,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: [rpcUrl],
    blockExplorerUrls: [metadata.blockExplorerUrl]
  };
}

export function requiredReceiptAddEthereumChainParams(): AddEthereumChainParams {
  const required = requiredReceiptNetwork();
  return addEthereumChainParamsForChain(required.chainId, required.rpcUrl);
}

export function explorerBaseUrlForChainId(chainId: number): string {
  return metadataForChainId(chainId).blockExplorerUrl;
}
