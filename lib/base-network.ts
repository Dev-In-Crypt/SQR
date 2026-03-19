import { ApiError } from "@/lib/errors";
import { config } from "@/lib/config";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const POLKADOT_HUB_TESTNET_CHAIN_ID = 420420417;
export const POLKADOT_HUB_MAINNET_CHAIN_ID = 420420419;

interface ReceiptNetworkMetadata {
  chainId: number;
  chainHex: `0x${string}`;
  chainName: string;
  requiredNetworkName: string;
  requiredNetworkLabel: string;
  blockExplorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

interface AnalysisNetworkMetadata {
  chainId: number;
  chainHex: `0x${string}`;
  chainName: string;
  label: string;
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

function metadataForChainId(chainId: number): ReceiptNetworkMetadata {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0x2105",
      chainName: "Base",
      requiredNetworkName: "Base",
      requiredNetworkLabel: "Base",
      blockExplorerUrl: "https://basescan.org",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18
      }
    };
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return {
      chainId,
      chainHex: "0x14a34",
      chainName: "Base Sepolia",
      requiredNetworkName: "Base Sepolia",
      requiredNetworkLabel: "Base Sepolia",
      blockExplorerUrl: "https://sepolia.basescan.org",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18
      }
    };
  }

  if (chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID) {
    return {
      chainId,
      chainHex: `0x${chainId.toString(16)}`,
      chainName: "Polkadot Hub Testnet",
      requiredNetworkName: "Polkadot Hub Testnet",
      requiredNetworkLabel: "Polkadot Hub Testnet",
      blockExplorerUrl: config.POLKADOT_HUB_TESTNET_EXPLORER_URL,
      nativeCurrency: {
        name: "Paseo",
        symbol: "PAS",
        decimals: 18
      }
    };
  }

  if (chainId === config.POLKADOT_HUB_MAINNET_CHAIN_ID) {
    return {
      chainId,
      chainHex: `0x${chainId.toString(16)}`,
      chainName: "Polkadot Hub",
      requiredNetworkName: "Polkadot Hub",
      requiredNetworkLabel: "Polkadot Hub",
      blockExplorerUrl: config.POLKADOT_HUB_MAINNET_EXPLORER_URL,
      nativeCurrency: {
        name: "DOT",
        symbol: "DOT",
        decimals: 18
      }
    };
  }

  throw new ApiError(
    500,
    "UNSUPPORTED_RECEIPT_CHAIN",
    `Unsupported receipt chainId ${chainId}. Supported chains are Base mainnet/sepolia and configured Polkadot Hub networks.`
  );
}

function rpcUrlForChainId(chainId: number): string | null {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return config.BASE_MAINNET_RPC_URL || config.BASE_RPC_URL || null;
  }

  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return config.BASE_SEPOLIA_RPC_URL || config.BASE_RPC_URL || null;
  }

  if (chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID) {
    return config.POLKADOT_HUB_TESTNET_RPC_URL || null;
  }

  if (chainId === config.POLKADOT_HUB_MAINNET_CHAIN_ID) {
    return config.POLKADOT_HUB_MAINNET_RPC_URL || null;
  }

  return config.BASE_RPC_URL || null;
}

export function requiredReceiptChainId(): number {
  if (config.RECEIPT_DEFAULT_CHAIN_ID !== undefined) {
    return config.RECEIPT_DEFAULT_CHAIN_ID;
  }

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

export function receiptNetworkByChainId(chainId: number): ReceiptNetworkMetadata {
  return metadataForChainId(chainId);
}

export function receiptContractAddressByChainId(chainId: number): string | null {
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) {
    return config.RECEIPT_CONTRACT_ADDRESS || null;
  }

  if (chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID) {
    return config.POLKADOT_HUB_TESTNET_RECEIPT_CONTRACT_ADDRESS || null;
  }

  if (chainId === config.POLKADOT_HUB_MAINNET_CHAIN_ID) {
    return config.POLKADOT_HUB_MAINNET_RECEIPT_CONTRACT_ADDRESS || null;
  }

  return null;
}

export function isReceiptChainSupported(chainId: number): boolean {
  try {
    metadataForChainId(chainId);
    return true;
  } catch {
    return false;
  }
}

export function enabledReceiptChainIds(): number[] {
  const chainIds = [BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID];

  if (config.polkadotHubReceiptEnabled || config.polkadotHubEnabled) {
    chainIds.push(config.POLKADOT_HUB_TESTNET_CHAIN_ID, config.POLKADOT_HUB_MAINNET_CHAIN_ID);
  }

  return chainIds;
}

export function enabledAnalysisChainIds(): number[] {
  const chainIds = [BASE_MAINNET_CHAIN_ID];

  if (config.polkadotHubEnabled) {
    chainIds.push(config.POLKADOT_HUB_MAINNET_CHAIN_ID, config.POLKADOT_HUB_TESTNET_CHAIN_ID);
  }

  return chainIds;
}

export function isPolkadotHubChainId(chainId: number): boolean {
  return chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID || chainId === config.POLKADOT_HUB_MAINNET_CHAIN_ID;
}

function analysisLabelForChainId(chainId: number): string {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return "Base";
  }

  if (chainId === config.POLKADOT_HUB_MAINNET_CHAIN_ID) {
    return "Polkadot Hub";
  }

  if (chainId === config.POLKADOT_HUB_TESTNET_CHAIN_ID) {
    return "Polkadot Hub Testnet";
  }

  return metadataForChainId(chainId).requiredNetworkLabel;
}

export function enabledAnalysisNetworks(): AnalysisNetworkMetadata[] {
  return enabledAnalysisChainIds().map((chainId) => {
    const metadata = metadataForChainId(chainId);
    return {
      chainId: metadata.chainId,
      chainHex: metadata.chainHex,
      chainName: metadata.chainName,
      label: analysisLabelForChainId(chainId),
      blockExplorerUrl: metadata.blockExplorerUrl
    };
  });
}

export function enabledReceiptNetworks() {
  return enabledReceiptChainIds().flatMap((chainId) => {
    const contractAddress = receiptContractAddressByChainId(chainId);
    const rpcUrl = rpcUrlForChainId(chainId);

    if (!rpcUrl) {
      return [];
    }

    const metadata = metadataForChainId(chainId);
    return [
      {
        ...metadata,
        rpcUrl,
        contractAddress
      }
    ];
  });
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
