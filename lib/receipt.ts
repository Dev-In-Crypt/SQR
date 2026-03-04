import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  http,
  parseAbi,
  parseAbiItem,
  zeroAddress
} from "viem";

import { config } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { hashCanonical } from "@/lib/hash";

export const receiptRegistryAbi = parseAbi([
  "function mint(bytes32 reportHash, address contractAddress, bytes32 analyzerVersionHash) returns (uint256 receiptId, bool newlyMinted)",
  "function getByHash(bytes32 reportHash) view returns (uint256 receiptId, address owner, address contractAddress, bytes32 analyzerVersionHash, uint256 timestamp)",
  "event ReceiptMinted(bytes32 indexed reportHash, address indexed contractAddress, bytes32 analyzerVersionHash, address owner, uint256 timestamp, uint256 receiptId)"
]);

const receiptMintedEvent = parseAbiItem(
  "event ReceiptMinted(bytes32 indexed reportHash, address indexed contractAddress, bytes32 analyzerVersionHash, address owner, uint256 timestamp, uint256 receiptId)"
);

export function analyzerVersionHash(): `0x${string}` {
  return hashCanonical({ analyzerVersion: config.ANALYZER_VERSION }) as `0x${string}`;
}

export function prepareMintTransaction(params: {
  reportHash: string;
  contractAddress?: string | null;
}): {
  to: `0x${string}`;
  data: `0x${string}`;
  chainId: number;
  args: {
    reportHash: `0x${string}`;
    contractAddress: `0x${string}`;
    analyzerVersionHash: `0x${string}`;
  };
} {
  if (!config.RECEIPT_CONTRACT_ADDRESS) {
    throw new ApiError(503, "RECEIPT_UNAVAILABLE", "Receipt contract address is not configured");
  }

  const argReportHash = params.reportHash as `0x${string}`;
  const argContractAddress = (params.contractAddress || zeroAddress) as `0x${string}`;
  const argAnalyzerVersionHash = analyzerVersionHash();

  const data = encodeFunctionData({
    abi: receiptRegistryAbi,
    functionName: "mint",
    args: [argReportHash, argContractAddress, argAnalyzerVersionHash]
  });

  return {
    to: config.RECEIPT_CONTRACT_ADDRESS as `0x${string}`,
    data,
    chainId: config.BASE_CHAIN_ID,
    args: {
      reportHash: argReportHash,
      contractAddress: argContractAddress,
      analyzerVersionHash: argAnalyzerVersionHash
    }
  };
}

function chainForRpc() {
  return defineChain({
    id: config.BASE_CHAIN_ID,
    name: "Base",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [config.BASE_RPC_URL || ""]
      }
    }
  });
}

export async function readMintedEventFromTx(txHash: string): Promise<{
  reportHash: string;
  contractAddress: string;
  owner: string;
  timestamp: Date;
  receiptId: string;
} | null> {
  if (!config.BASE_RPC_URL) {
    return null;
  }

  const client = createPublicClient({
    chain: chainForRpc(),
    transport: http(config.BASE_RPC_URL)
  });

  const txReceipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

  for (const log of txReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [receiptMintedEvent],
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName !== "ReceiptMinted") {
        continue;
      }

      return {
        reportHash: decoded.args.reportHash,
        contractAddress: decoded.args.contractAddress,
        owner: decoded.args.owner,
        timestamp: new Date(Number(decoded.args.timestamp) * 1000),
        receiptId: decoded.args.receiptId.toString()
      };
    } catch {
      // Ignore unrelated logs.
    }
  }

  return null;
}

export function explorerTxUrl(txHash: string, chainId: number): string {
  if (chainId === config.STAGING_BASE_CHAIN_ID) {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }

  return `https://basescan.org/tx/${txHash}`;
}
