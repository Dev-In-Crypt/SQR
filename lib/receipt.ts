import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  zeroAddress
} from "viem";

import { config } from "@/lib/config";
import { ApiError } from "@/lib/errors";
import { hashCanonical } from "@/lib/hash";
import {
  buildMintAuthorizationRpcTypedData,
  buildMintAuthorizationTypedData,
  mintAuthorizationTypes,
  receiptMintedEvent,
  receiptRegistryAbi,
  type MintAuthorizationMessage
} from "@/lib/receipt-shared";

export { receiptRegistryAbi };

function configuredReceiptContract(): Address {
  const value = config.RECEIPT_CONTRACT_ADDRESS;
  if (!value) {
    throw new ApiError(503, "RECEIPT_UNAVAILABLE", "Receipt contract address is not configured");
  }

  if (!isAddress(value)) {
    throw new ApiError(500, "INVALID_RECEIPT_CONTRACT", "Configured receipt contract address is invalid");
  }

  return value;
}

function configuredRpcUrl(): string {
  if (!config.BASE_RPC_URL) {
    throw new ApiError(503, "RECEIPT_RPC_UNAVAILABLE", "Base RPC URL is not configured");
  }

  return config.BASE_RPC_URL;
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

export function analyzerVersionHash(): Hex {
  return hashCanonical({ analyzerVersion: config.ANALYZER_VERSION }) as Hex;
}

export async function readOwnerMintNonce(owner: string): Promise<bigint> {
  if (!isAddress(owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  const rpcUrl = configuredRpcUrl();
  const receiptContract = configuredReceiptContract();

  const client = createPublicClient({
    chain: chainForRpc(),
    transport: http(rpcUrl)
  });

  return client.readContract({
    address: receiptContract,
    abi: receiptRegistryAbi,
    functionName: "nonces",
    args: [owner as Address]
  });
}

export async function prepareMintAuthorization(params: {
  reportHash: string;
  contractAddress?: string | null;
  owner: string;
  ttlSeconds?: number;
}): Promise<{
  typedData: ReturnType<typeof buildMintAuthorizationRpcTypedData>;
  call: {
    to: Address;
    chainId: number;
    functionName: "mintWithSig";
    args: {
      reportHash: Hex;
      contractAddress: Address;
      analyzerVersionHash: Hex;
      owner: Address;
      nonce: string;
      deadline: string;
    };
  };
}> {
  const receiptContract = configuredReceiptContract();

  if (!isAddress(params.owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  const owner = params.owner as Address;
  const nonce = await readOwnerMintNonce(owner);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 600));

  const message: MintAuthorizationMessage = {
    reportHash: params.reportHash as Hex,
    contractAddress: (params.contractAddress || zeroAddress) as Address,
    analyzerVersionHash: analyzerVersionHash(),
    owner,
    nonce,
    deadline
  };

  const typedData = buildMintAuthorizationRpcTypedData({
    chainId: config.BASE_CHAIN_ID,
    verifyingContract: receiptContract,
    message
  });

  return {
    typedData,
    call: {
      to: receiptContract,
      chainId: config.BASE_CHAIN_ID,
      functionName: "mintWithSig",
      args: {
        reportHash: message.reportHash,
        contractAddress: message.contractAddress,
        analyzerVersionHash: message.analyzerVersionHash,
        owner: message.owner,
        nonce: message.nonce.toString(),
        deadline: message.deadline.toString()
      }
    }
  };
}

export async function recoverMintAuthorizationSigner(params: {
  reportHash: string;
  contractAddress?: string | null;
  owner: string;
  nonce: string;
  deadline: string;
  signature: string;
}): Promise<Address> {
  const receiptContract = configuredReceiptContract();

  if (!isAddress(params.owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  if (!params.signature.startsWith("0x")) {
    throw new ApiError(400, "INVALID_SIGNATURE", "Signature must be hex prefixed");
  }

  const typedData = buildMintAuthorizationTypedData({
    chainId: config.BASE_CHAIN_ID,
    verifyingContract: receiptContract,
    message: {
      reportHash: params.reportHash as Hex,
      contractAddress: ((params.contractAddress || zeroAddress) as Address),
      analyzerVersionHash: analyzerVersionHash(),
      owner: params.owner as Address,
      nonce: BigInt(params.nonce),
      deadline: BigInt(params.deadline)
    }
  });

  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: mintAuthorizationTypes,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature: params.signature as Hex
  });
}

export async function readMintedEventFromTx(txHash: string): Promise<{
  reportHash: string;
  contractAddress: string;
  owner: string;
  minter: string;
  timestamp: Date;
  receiptId: string;
} | null> {
  if (!config.BASE_RPC_URL || !config.RECEIPT_CONTRACT_ADDRESS) {
    return null;
  }

  const client = createPublicClient({
    chain: chainForRpc(),
    transport: http(config.BASE_RPC_URL)
  });

  const txReceipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  const expectedContract = config.RECEIPT_CONTRACT_ADDRESS.toLowerCase();

  for (const log of txReceipt.logs) {
    if (log.address.toLowerCase() !== expectedContract) {
      continue;
    }

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
        minter: decoded.args.minter,
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
