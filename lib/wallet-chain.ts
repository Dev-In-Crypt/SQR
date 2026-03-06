import type { AddEthereumChainParams } from "@/lib/base-network";
import type { Eip1193Provider } from "@/lib/eip1193";
import { providerErrorCode } from "@/lib/eip1193";

export type EnsureChainErrorCode =
  | "USER_REJECTED"
  | "ADD_CHAIN_FAILED"
  | "SWITCH_FAILED"
  | "CHAIN_MISMATCH";

export class EnsureChainError extends Error {
  readonly code: EnsureChainErrorCode;

  constructor(code: EnsureChainErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EnsureChainError";
    this.code = code;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function normalizeChainHex(chainHex: string): `0x${string}` {
  return chainHex.toLowerCase() as `0x${string}`;
}

export async function readWalletChainHex(provider: Eip1193Provider): Promise<`0x${string}`> {
  const response = (await provider.request({ method: "eth_chainId" })) as string;
  if (!response || typeof response !== "string") {
    throw new EnsureChainError("SWITCH_FAILED", "Wallet did not return a valid chain ID.");
  }

  return normalizeChainHex(response);
}

function toRequiredChainHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

function isUserRejected(error: unknown): boolean {
  return providerErrorCode(error) === 4001;
}

function isUnknownChain(error: unknown): boolean {
  return providerErrorCode(error) === 4902;
}

async function switchChain(provider: Eip1193Provider, chainHex: `0x${string}`): Promise<void> {
  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainHex }]
  });
}

export async function ensureChain(params: {
  provider: Eip1193Provider;
  requiredChainId: number;
  requiredNetworkLabel: string;
  addEthereumChain: AddEthereumChainParams;
}): Promise<{ chainHex: `0x${string}`; chainId: number }> {
  const requiredChainHex = toRequiredChainHex(params.requiredChainId);
  const currentChainHex = await readWalletChainHex(params.provider);

  if (currentChainHex === requiredChainHex) {
    return {
      chainHex: currentChainHex,
      chainId: params.requiredChainId
    };
  }

  try {
    await switchChain(params.provider, requiredChainHex);
  } catch (switchError) {
    if (isUnknownChain(switchError)) {
      try {
        await params.provider.request({
          method: "wallet_addEthereumChain",
          params: [params.addEthereumChain]
        });
      } catch (addError) {
        if (isUserRejected(addError)) {
          throw new EnsureChainError(
            "USER_REJECTED",
            `Mint requires ${params.requiredNetworkLabel}. Network switch was rejected.`,
            { cause: addError }
          );
        }

        throw new EnsureChainError(
          "ADD_CHAIN_FAILED",
          `Could not add ${params.requiredNetworkLabel} to wallet. Add it manually and retry.`,
          { cause: addError }
        );
      }

      try {
        await switchChain(params.provider, requiredChainHex);
      } catch (retryError) {
        if (isUserRejected(retryError)) {
          throw new EnsureChainError(
            "USER_REJECTED",
            `Mint requires ${params.requiredNetworkLabel}. Network switch was rejected.`,
            { cause: retryError }
          );
        }

        throw new EnsureChainError(
          "SWITCH_FAILED",
          `Could not switch wallet to ${params.requiredNetworkLabel}.`,
          { cause: retryError }
        );
      }
    } else if (isUserRejected(switchError)) {
      throw new EnsureChainError(
        "USER_REJECTED",
        `Mint requires ${params.requiredNetworkLabel}. Network switch was rejected.`,
        { cause: switchError }
      );
    } else {
      throw new EnsureChainError(
        "SWITCH_FAILED",
        `Could not switch wallet to ${params.requiredNetworkLabel}.`,
        { cause: switchError }
      );
    }
  }

  const finalChainHex = await readWalletChainHex(params.provider);
  if (finalChainHex !== requiredChainHex) {
    throw new EnsureChainError(
      "CHAIN_MISMATCH",
      `Wallet is still on the wrong network. Mint requires ${params.requiredNetworkLabel}.`
    );
  }

  return {
    chainHex: finalChainHex,
    chainId: params.requiredChainId
  };
}
