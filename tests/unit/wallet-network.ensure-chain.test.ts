import { describe, expect, it } from "vitest";

import type { Eip1193Provider } from "@/lib/eip1193";
import { ensureChain } from "@/lib/wallet-chain";

type RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

function addEthereumChainParams() {
  return {
    chainId: "0x2105" as const,
    chainName: "Base",
    nativeCurrency: {
      name: "Ether" as const,
      symbol: "ETH" as const,
      decimals: 18
    },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"]
  };
}

function mockProvider(handler: (args: RequestArgs) => Promise<unknown>): Eip1193Provider {
  return {
    request(args) {
      return handler(args as RequestArgs);
    }
  };
}

describe("wallet ensureChain", () => {
  it("switches when current chain is wrong", async () => {
    let currentChain = "0x1";
    const calls: string[] = [];

    const provider = mockProvider(async ({ method, params }) => {
      calls.push(method);

      if (method === "eth_chainId") {
        return currentChain;
      }

      if (method === "wallet_switchEthereumChain") {
        currentChain = ((params as Array<{ chainId: string }>)[0]?.chainId || "").toLowerCase();
        return null;
      }

      throw new Error(`Unexpected method ${method}`);
    });

    const result = await ensureChain({
      provider,
      requiredChainId: 8453,
      requiredNetworkLabel: "Base",
      addEthereumChain: addEthereumChainParams()
    });

    expect(result.chainHex).toBe("0x2105");
    expect(calls).toEqual(["eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
  });

  it("adds then switches when switch returns 4902", async () => {
    let currentChain = "0x1";
    let switchCalls = 0;
    const calls: string[] = [];

    const provider = mockProvider(async ({ method, params }) => {
      calls.push(method);

      if (method === "eth_chainId") {
        return currentChain;
      }

      if (method === "wallet_switchEthereumChain") {
        switchCalls += 1;
        if (switchCalls === 1) {
          throw { code: 4902 };
        }

        currentChain = ((params as Array<{ chainId: string }>)[0]?.chainId || "").toLowerCase();
        return null;
      }

      if (method === "wallet_addEthereumChain") {
        return null;
      }

      throw new Error(`Unexpected method ${method}`);
    });

    const result = await ensureChain({
      provider,
      requiredChainId: 8453,
      requiredNetworkLabel: "Base",
      addEthereumChain: addEthereumChainParams()
    });

    expect(result.chainHex).toBe("0x2105");
    expect(calls).toEqual([
      "eth_chainId",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId"
    ]);
  });

  it("throws USER_REJECTED on switch rejection (4001)", async () => {
    const provider = mockProvider(async ({ method }) => {
      if (method === "eth_chainId") {
        return "0x1";
      }

      if (method === "wallet_switchEthereumChain") {
        throw { code: 4001 };
      }

      throw new Error(`Unexpected method ${method}`);
    });

    await expect(
      ensureChain({
        provider,
        requiredChainId: 8453,
        requiredNetworkLabel: "Base",
        addEthereumChain: addEthereumChainParams()
      })
    ).rejects.toMatchObject({
      code: "USER_REJECTED"
    });
  });

  it("throws CHAIN_MISMATCH when chain remains wrong after switch", async () => {
    const provider = mockProvider(async ({ method }) => {
      if (method === "eth_chainId") {
        return "0x1";
      }

      if (method === "wallet_switchEthereumChain") {
        return null;
      }

      throw new Error(`Unexpected method ${method}`);
    });

    await expect(
      ensureChain({
        provider,
        requiredChainId: 8453,
        requiredNetworkLabel: "Base",
        addEthereumChain: addEthereumChainParams()
      })
    ).rejects.toMatchObject({
      code: "CHAIN_MISMATCH"
    });
  });
});


