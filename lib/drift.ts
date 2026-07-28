import { createPublicClient, defineChain, http, keccak256, type Address, type Hex } from "viem";

import { receiptNetworkForChain } from "@/lib/base-network";
import { config } from "@/lib/config";
import type { DeployDriftBaseline, DeployDriftCheck } from "@/lib/types";

// EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1.
// Covers the dominant modern proxy standards (OpenZeppelin Transparent, UUPS).
// Beacon proxies (EIP-1967 beacon slot) and pre-1967 legacy proxy layouts are a
// known gap for this first version.
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const ZERO_SLOT = `0x${"0".repeat(64)}` as Hex;

function chainClientFor(chainId: number) {
  const network = receiptNetworkForChain(chainId);
  const chain = defineChain({
    id: network.chainId,
    name: network.chainName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [network.rpcUrl] } }
  });
  return createPublicClient({ chain, transport: http(network.rpcUrl) });
}

function addressFromSlot(slot: Hex): Address | null {
  if (slot === ZERO_SLOT) {
    return null;
  }
  // The address occupies the low 20 bytes (40 hex chars) of the 32-byte slot.
  return `0x${slot.slice(-40)}` as Address;
}

async function fingerprint(client: ReturnType<typeof chainClientFor>, address: Address) {
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") {
    return { exists: false as const, bytecodeHash: null };
  }
  return { exists: true as const, bytecodeHash: keccak256(bytecode) };
}

/**
 * Captures a fingerprint of a verified contract at analysis time: its own
 * bytecode hash, and — if it's an EIP-1967 proxy — the implementation address
 * and the implementation's bytecode hash. Read-only, best-effort: any RPC
 * failure resolves to null rather than throwing, so a drift-baseline outage
 * never fails the analysis it's attached to.
 */
export async function captureDeployDriftBaseline(params: {
  chainId: number;
  contractAddress: string;
}): Promise<DeployDriftBaseline | null> {
  try {
    const client = chainClientFor(params.chainId);
    const address = params.contractAddress as Address;

    const own = await fingerprint(client, address);
    if (!own.exists) {
      return null;
    }

    const implSlot = await client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT });
    const implementationAddress = implSlot ? addressFromSlot(implSlot as Hex) : null;

    let implementationBytecodeHash: string | null = null;
    if (implementationAddress) {
      const impl = await fingerprint(client, implementationAddress);
      implementationBytecodeHash = impl.bytecodeHash;
    }

    return {
      chainId: params.chainId,
      contractAddress: params.contractAddress,
      bytecodeHash: own.bytecodeHash!,
      isProxy: implementationAddress !== null,
      implementationAddress,
      implementationBytecodeHash,
      capturedAt: new Date().toISOString()
    };
  } catch {
    // Best-effort: no baseline is a degraded feature, not a pipeline failure.
    return null;
  }
}

/**
 * Re-fetches the current onchain state for a captured baseline and compares.
 * Drift is: the proxy's implementation changed, a non-proxy's own bytecode
 * changed, or the proxy/non-proxy status itself flipped since the baseline.
 */
export async function checkDeployDrift(baseline: DeployDriftBaseline): Promise<DeployDriftCheck> {
  const client = chainClientFor(baseline.chainId);
  const address = baseline.contractAddress as Address;

  const own = await fingerprint(client, address);
  if (!own.exists) {
    return {
      checkedAt: new Date().toISOString(),
      drifted: true,
      reason: "CONTRACT_NOT_FOUND",
      current: { bytecodeHash: null, isProxy: false, implementationAddress: null }
    };
  }

  const implSlot = await client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT });
  const implementationAddress = implSlot ? addressFromSlot(implSlot as Hex) : null;

  if (baseline.isProxy && implementationAddress) {
    const drifted = implementationAddress.toLowerCase() !== baseline.implementationAddress?.toLowerCase();
    return {
      checkedAt: new Date().toISOString(),
      drifted,
      reason: drifted ? "IMPLEMENTATION_CHANGED" : null,
      current: { bytecodeHash: own.bytecodeHash, isProxy: true, implementationAddress }
    };
  }

  if (baseline.isProxy !== (implementationAddress !== null)) {
    return {
      checkedAt: new Date().toISOString(),
      drifted: true,
      reason: "PROXY_STATUS_CHANGED",
      current: { bytecodeHash: own.bytecodeHash, isProxy: implementationAddress !== null, implementationAddress }
    };
  }

  const drifted = own.bytecodeHash !== baseline.bytecodeHash;
  return {
    checkedAt: new Date().toISOString(),
    drifted,
    reason: drifted ? "BYTECODE_CHANGED" : null,
    current: { bytecodeHash: own.bytecodeHash, isProxy: false, implementationAddress: null }
  };
}

export function deployDriftEnabled(): boolean {
  return config.deployDriftEnabled;
}
