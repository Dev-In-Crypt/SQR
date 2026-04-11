import { ApiError } from "@/lib/errors";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  getChainMetadata,
  HASHKEY_MAINNET_CHAIN_ID,
  HASHKEY_TESTNET_CHAIN_ID,
  type ChainMetadata
} from "@/lib/chains";
import { config } from "@/lib/config";

type BaseNetworkMetadata = Pick<
  ChainMetadata,
  "chainId" | "chainHex" | "chainName" | "requiredNetworkName" | "requiredNetworkLabel" | "blockExplorerUrl" | "nativeCurrency"
>;

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
  const metadata = getChainMetadata(chainId);
  if (!metadata) {
    throw new ApiError(500, "UNSUPPORTED_RECEIPT_CHAIN", `Unsupported receipt chainId ${chainId}.`);
  }

  return metadata;
}

function rpcUrlForChainId(chainId: number): string | null {
  if (chainId === HASHKEY_TESTNET_CHAIN_ID) {
    return config.HASHKEY_TESTNET_RPC_URL || null;
  }

  if (chainId === HASHKEY_MAINNET_CHAIN_ID) {
    return config.HASHKEY_MAINNET_RPC_URL || null;
  }

  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return config.BASE_MAINNET_RPC_URL || config.BASE_RPC_URL || null;
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return config.BASE_SEPOLIA_RPC_URL || config.BASE_RPC_URL || null;
  }

  return config.BASE_RPC_URL || null;
}

export function requiredReceiptChainId(): number {
  if (config.RECEIPT_CHAIN_ID) {
    return config.RECEIPT_CHAIN_ID;
  }

  if (getChainMetadata(config.DEFAULT_ANALYSIS_CHAIN_ID)) {
    return config.DEFAULT_ANALYSIS_CHAIN_ID;
  }

  if (config.APP_ENV === "staging") {
    return BASE_SEPOLIA_CHAIN_ID;
  }

  if (config.APP_ENV === "production") {
    return BASE_MAINNET_CHAIN_ID;
  }

  return HASHKEY_TESTNET_CHAIN_ID;
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
    nativeCurrency: metadata.nativeCurrency,
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
