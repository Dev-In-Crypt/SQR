import { config } from "@/lib/config";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const HASHKEY_TESTNET_CHAIN_ID = 133;
export const HASHKEY_MAINNET_CHAIN_ID = 177;

export type SourceApiKind = "ETHERSCAN_V2" | "BLOCKSCOUT_API";

export interface ChainMetadata {
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
  sourceApiKind: SourceApiKind;
  sourceApiUrl: string;
  sourceApiKey?: string;
}

function toChainHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as `0x${string}`;
}

const CHAIN_CATALOG: ChainMetadata[] = [
  {
    chainId: BASE_MAINNET_CHAIN_ID,
    chainHex: toChainHex(BASE_MAINNET_CHAIN_ID),
    chainName: "Base",
    requiredNetworkName: "Base",
    requiredNetworkLabel: "Base Mainnet",
    blockExplorerUrl: "https://basescan.org",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    sourceApiKind: "ETHERSCAN_V2",
    sourceApiUrl: config.BASESCAN_API_URL,
    sourceApiKey: config.BASESCAN_API_KEY
  },
  {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    chainHex: toChainHex(BASE_SEPOLIA_CHAIN_ID),
    chainName: "Base Sepolia",
    requiredNetworkName: "Base Sepolia",
    requiredNetworkLabel: "Base Sepolia",
    blockExplorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    sourceApiKind: "ETHERSCAN_V2",
    sourceApiUrl: config.BASESCAN_API_URL,
    sourceApiKey: config.BASESCAN_API_KEY
  },
  {
    chainId: HASHKEY_TESTNET_CHAIN_ID,
    chainHex: toChainHex(HASHKEY_TESTNET_CHAIN_ID),
    chainName: "HashKey Chain Testnet",
    requiredNetworkName: "HashKey Chain Testnet",
    requiredNetworkLabel: "HashKey Testnet",
    blockExplorerUrl: "https://testnet-explorer.hsk.xyz",
    nativeCurrency: {
      name: "HashKey",
      symbol: "HSK",
      decimals: 18
    },
    sourceApiKind: "BLOCKSCOUT_API",
    sourceApiUrl: config.HASHKEY_TESTNET_EXPLORER_API_URL
  },
  {
    chainId: HASHKEY_MAINNET_CHAIN_ID,
    chainHex: toChainHex(HASHKEY_MAINNET_CHAIN_ID),
    chainName: "HashKey Chain",
    requiredNetworkName: "HashKey Chain",
    requiredNetworkLabel: "HashKey Mainnet",
    blockExplorerUrl: "https://hashkey.blockscout.com",
    nativeCurrency: {
      name: "HashKey",
      symbol: "HSK",
      decimals: 18
    },
    sourceApiKind: "BLOCKSCOUT_API",
    sourceApiUrl: config.HASHKEY_MAINNET_EXPLORER_API_URL
  }
];

export function getChainMetadata(chainId: number): ChainMetadata | null {
  const known = CHAIN_CATALOG.find((item) => item.chainId === chainId);
  if (!known) {
    return null;
  }

  if (known.chainId === HASHKEY_MAINNET_CHAIN_ID && !config.HASHKEY_MAINNET_ENABLED) {
    return null;
  }

  return known;
}

export function listSupportedAddressChains(): ChainMetadata[] {
  const supportedIds = new Set<number>([
    config.BASE_CHAIN_ID,
    HASHKEY_TESTNET_CHAIN_ID
  ]);

  return CHAIN_CATALOG.filter((item) => supportedIds.has(item.chainId)).filter((item) => getChainMetadata(item.chainId));
}

export function defaultAnalysisChainId(): number {
  const configured = getChainMetadata(config.DEFAULT_ANALYSIS_CHAIN_ID);
  if (configured) {
    return configured.chainId;
  }

  const hashKeyTestnet = getChainMetadata(HASHKEY_TESTNET_CHAIN_ID);
  if (hashKeyTestnet) {
    return hashKeyTestnet.chainId;
  }

  return config.BASE_CHAIN_ID;
}
