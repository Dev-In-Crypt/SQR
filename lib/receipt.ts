import {
  TransactionReceiptNotFoundError,
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

import {
  ARBITRUM_ONE_CHAIN_ID,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  explorerBaseUrlForChainId,
  receiptNetworkByChainId,
  receiptNetworkForChain,
  requiredReceiptChainId,
  requiredReceiptNetwork,
  requiredReceiptRpcUrl
} from "@/lib/base-network";
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

// The ReceiptRegistry is deployed per-chain: Base uses RECEIPT_CONTRACT_ADDRESS,
// Arbitrum uses ARBITRUM_RECEIPT_CONTRACT_ADDRESS. A report is anchored on the
// chain it was analyzed on, so all receipt operations are parameterized by chainId.
function receiptContractForChain(chainId: number): Address {
  const isArbitrum = chainId === ARBITRUM_ONE_CHAIN_ID || chainId === ARBITRUM_SEPOLIA_CHAIN_ID;
  const value = isArbitrum ? config.ARBITRUM_RECEIPT_CONTRACT_ADDRESS : config.RECEIPT_CONTRACT_ADDRESS;

  if (!value) {
    throw new ApiError(503, "RECEIPT_UNAVAILABLE", `Receipt contract is not configured for chain ${chainId}`);
  }

  if (!isAddress(value)) {
    throw new ApiError(500, "INVALID_RECEIPT_CONTRACT", "Configured receipt contract address is invalid");
  }

  return value;
}

function chainContextFor(chainId: number) {
  const network = receiptNetworkForChain(chainId);

  return {
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    chain: defineChain({
      id: network.chainId,
      name: network.chainName,
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [network.rpcUrl]
        }
      }
    })
  };
}

function chainClientFor(chainId: number) {
  const context = chainContextFor(chainId);

  return createPublicClient({
    chain: context.chain,
    transport: http(context.rpcUrl)
  });
}

function isReceiptNotFoundError(error: unknown): boolean {
  if (error instanceof TransactionReceiptNotFoundError) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("transaction receipt") && message.includes("could not be found");
}

export function analyzerVersionHash(): Hex {
  return hashCanonical({ analyzerVersion: config.ANALYZER_VERSION }) as Hex;
}

export type ReceiptSubsystemHealth = {
  configured: boolean;
  ok: boolean;
  code?: string;
  checkedAt: string;
};

const RECEIPT_HEALTH_SENTINEL_HASH = `0x${"00".repeat(31)}01` as Hex;
const RECEIPT_HEALTH_OK_TTL_MS = 5 * 60 * 1000;
const RECEIPT_HEALTH_FAIL_TTL_MS = 30 * 1000;

let receiptHealthCache: { value: ReceiptSubsystemHealth; expiresAt: number } | null = null;

/**
 * Probes the configured ReceiptRegistry with a sentinel hash. A clean
 * "not found" proves the contract answers getByHash on the required chain;
 * RECEIPT_CONTRACT_UNAVAILABLE indicates a deterministic misconfiguration
 * (wrong address/chain), RECEIPT_CHAIN_UNAVAILABLE a transient RPC problem.
 * Results are cached so health polling does not hammer the RPC.
 */
export async function receiptSubsystemHealth(): Promise<ReceiptSubsystemHealth> {
  if (receiptHealthCache && receiptHealthCache.expiresAt > Date.now()) {
    return receiptHealthCache.value;
  }

  let value: ReceiptSubsystemHealth;

  if (!config.RECEIPT_CONTRACT_ADDRESS) {
    value = { configured: false, ok: true, checkedAt: new Date().toISOString() };
  } else {
    try {
      await readMintedReceiptByHash(RECEIPT_HEALTH_SENTINEL_HASH);
      value = { configured: true, ok: true, checkedAt: new Date().toISOString() };
    } catch (error) {
      value = {
        configured: true,
        ok: false,
        code: error instanceof ApiError ? error.code : "RECEIPT_HEALTH_ERROR",
        checkedAt: new Date().toISOString()
      };
    }
  }

  receiptHealthCache = {
    value,
    expiresAt: Date.now() + (value.ok ? RECEIPT_HEALTH_OK_TTL_MS : RECEIPT_HEALTH_FAIL_TTL_MS)
  };

  return value;
}

export async function readOwnerMintNonce(
  owner: string,
  chainId: number = requiredReceiptChainId()
): Promise<bigint> {
  if (!isAddress(owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  const receiptContract = receiptContractForChain(chainId);
  const client = chainClientFor(chainId);

  try {
    return await client.readContract({
      address: receiptContract,
      abi: receiptRegistryAbi,
      functionName: "nonces",
      args: [owner as Address]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (
      message.includes("returned no data") ||
      message.includes("does not have the function") ||
      message.includes("address is not a contract")
    ) {
      throw new ApiError(
        503,
        "RECEIPT_CONTRACT_UNAVAILABLE",
        "Receipt contract is unavailable on the required network. Please try again later."
      );
    }

    if (
      message.includes("fetch failed") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("http request failed")
    ) {
      throw new ApiError(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt chain RPC is unavailable. Try again.");
    }

    throw new ApiError(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt subsystem is temporarily unavailable.");
  }
}

export async function prepareMintAuthorization(params: {
  reportHash: string;
  contractAddress?: string | null;
  owner: string;
  ttlSeconds?: number;
  chainId?: number;
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
  const chainId = params.chainId ?? requiredReceiptChainId();
  const receiptContract = receiptContractForChain(chainId);

  if (!isAddress(params.owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  const owner = params.owner as Address;
  const nonce = await readOwnerMintNonce(owner, chainId);
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
    chainId,
    verifyingContract: receiptContract,
    message
  });

  return {
    typedData,
    call: {
      to: receiptContract,
      chainId,
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

export async function readMintedReceiptByHash(
  reportHash: string,
  chainId: number = requiredReceiptChainId()
): Promise<
  | { exists: false }
  | {
      exists: true;
      receiptId: string;
      owner: string;
      contractAddress: string;
      analyzerVersionHash: string;
      timestamp: Date;
    }
> {
  const receiptContract = receiptContractForChain(chainId);
  const client = chainClientFor(chainId);

  try {
    const result = await client.readContract({
      address: receiptContract,
      abi: receiptRegistryAbi,
      functionName: "getByHash",
      args: [reportHash as Hex]
    });

    return {
      exists: true,
      receiptId: result[0].toString(),
      owner: result[1],
      contractAddress: result[2],
      analyzerVersionHash: result[3],
      timestamp: new Date(Number(result[4]) * 1000)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (message.includes("receipt_not_found")) {
      return { exists: false };
    }

    if (
      message.includes("returned no data") ||
      message.includes("does not have the function") ||
      message.includes("address is not a contract")
    ) {
      throw new ApiError(
        503,
        "RECEIPT_CONTRACT_UNAVAILABLE",
        "Receipt contract is unavailable on the required network. Please try again later."
      );
    }

    if (
      message.includes("fetch failed") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("http request failed")
    ) {
      throw new ApiError(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt chain RPC is unavailable. Try again.");
    }

    throw new ApiError(503, "RECEIPT_CHAIN_UNAVAILABLE", "Receipt subsystem is temporarily unavailable.");
  }
}

/** Chains that have a configured ReceiptRegistry, in lookup order (Base first). */
export function configuredReceiptChains(): number[] {
  const chains: number[] = [];
  if (config.RECEIPT_CONTRACT_ADDRESS) {
    chains.push(requiredReceiptChainId());
  }
  if (config.arbitrumEnabled && config.ARBITRUM_RECEIPT_CONTRACT_ADDRESS) {
    chains.push(ARBITRUM_ONE_CHAIN_ID);
  }
  return chains;
}

/**
 * A report hash is chain-agnostic but its receipt lives on the analysis chain.
 * Verification by hash alone probes each configured registry and returns the
 * chain where the receipt is anchored (or null). Per-chain RPC/contract errors
 * are swallowed so one unavailable chain does not mask a hit on another.
 */
export async function findMintedReceiptAnyChain(reportHash: string): Promise<{
  chainId: number;
  receipt: Extract<Awaited<ReturnType<typeof readMintedReceiptByHash>>, { exists: true }>;
} | null> {
  for (const chainId of configuredReceiptChains()) {
    try {
      const receipt = await readMintedReceiptByHash(reportHash, chainId);
      if (receipt.exists) {
        return { chainId, receipt };
      }
    } catch {
      // Try the next chain.
    }
  }
  return null;
}

export async function recoverMintAuthorizationSigner(params: {
  reportHash: string;
  contractAddress?: string | null;
  owner: string;
  nonce: string;
  deadline: string;
  signature: string;
  chainId?: number;
}): Promise<Address> {
  const chainId = params.chainId ?? requiredReceiptChainId();
  const receiptContract = receiptContractForChain(chainId);

  if (!isAddress(params.owner)) {
    throw new ApiError(400, "INVALID_OWNER", "Owner address is invalid");
  }

  if (!params.signature.startsWith("0x")) {
    throw new ApiError(400, "INVALID_SIGNATURE", "Signature must be hex prefixed");
  }

  const typedData = buildMintAuthorizationTypedData({
    chainId,
    verifyingContract: receiptContract,
    message: {
      reportHash: params.reportHash as Hex,
      contractAddress: (params.contractAddress || zeroAddress) as Address,
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

export async function hasTransactionReceiptOnRequiredChain(
  txHash: string,
  chainId: number = requiredReceiptChainId()
): Promise<boolean> {
  const client = chainClientFor(chainId);

  try {
    await client.getTransactionReceipt({ hash: txHash as Hex });
    return true;
  } catch (error) {
    if (isReceiptNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

export async function readMintedEventFromTx(
  txHash: string,
  chainId: number = requiredReceiptChainId()
): Promise<{
  reportHash: string;
  contractAddress: string;
  owner: string;
  minter: string;
  timestamp: Date;
  receiptId: string;
} | null> {
  const client = chainClientFor(chainId);
  const expectedContract = receiptContractForChain(chainId).toLowerCase();

  let txReceipt;
  try {
    txReceipt = await client.getTransactionReceipt({ hash: txHash as Hex });
  } catch (error) {
    if (isReceiptNotFoundError(error)) {
      return null;
    }

    throw error;
  }

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
  const network = receiptNetworkByChainId(chainId);
  return `${explorerBaseUrlForChainId(network.chainId)}/tx/${txHash}`;
}

export function requiredReceiptChainRpcUrl(): string {
  return requiredReceiptRpcUrl();
}
