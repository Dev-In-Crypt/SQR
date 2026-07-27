import { afterEach, describe, expect, it, vi } from "vitest";

import { networkLabelForChainId, analysisNetworks } from "@/lib/base-network";
import { enforceAddressChain } from "@/lib/source";
import { ApiError } from "@/lib/errors";

describe("chain registry labels", () => {
  it("labels every supported chain and falls back safely", () => {
    expect(networkLabelForChainId(8453)).toBe("Base");
    expect(networkLabelForChainId(84532)).toBe("Base Sepolia");
    expect(networkLabelForChainId(42161)).toBe("Arbitrum One");
    expect(networkLabelForChainId(421614)).toBe("Arbitrum Sepolia");
    expect(networkLabelForChainId(999999)).toBe("Chain 999999");
  });
});

describe("enforceAddressChain (Arbitrum disabled by default)", () => {
  it("accepts Base chains", () => {
    expect(() => enforceAddressChain(8453)).not.toThrow();
    expect(() => enforceAddressChain(84532)).not.toThrow();
  });

  it("rejects Arbitrum when the flag is off", () => {
    expect(() => enforceAddressChain(42161)).toThrow(ApiError);
  });

  it("rejects unknown chains", () => {
    expect(() => enforceAddressChain(1)).toThrow(ApiError);
  });

  it("lists only Base by default", () => {
    expect(analysisNetworks()).toEqual([{ chainId: 8453, label: "Base" }]);
  });
});

describe("enforceAddressChain (Arbitrum enabled)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts Arbitrum One and lists it once enabled", async () => {
    vi.stubEnv("ENABLE_ARBITRUM", "true");
    vi.stubEnv("APP_ENV", "local");
    vi.resetModules();

    const { enforceAddressChain: enforce } = await import("@/lib/source");
    const { analysisNetworks: networks } = await import("@/lib/base-network");

    expect(() => enforce(42161)).not.toThrow();
    expect(() => enforce(421614)).not.toThrow();
    expect(() => enforce(8453)).not.toThrow();
    expect(() => enforce(1)).toThrow();
    expect(networks()).toEqual([
      { chainId: 8453, label: "Base" },
      { chainId: 42161, label: "Arbitrum One" }
    ]);
  });
});
