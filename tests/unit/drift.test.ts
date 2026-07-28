import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  getBytecode: vi.fn(),
  getStorageAt: vi.fn()
};

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => mockClient
  };
});

vi.mock("@/lib/base-network", () => ({
  receiptNetworkForChain: (chainId: number) => ({
    chainId,
    chainName: "Test",
    rpcUrl: "http://127.0.0.1:0"
  })
}));

const { captureDeployDriftBaseline, checkDeployDrift } = await import("@/lib/drift");

const ZERO_SLOT = `0x${"0".repeat(64)}` as const;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const IMPL_A = "0x2222222222222222222222222222222222222222";
const IMPL_B = "0x3333333333333333333333333333333333333333";

function slotFor(address: string) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureDeployDriftBaseline", () => {
  it("returns null when the address has no code", async () => {
    mockClient.getBytecode.mockResolvedValue(undefined);
    const baseline = await captureDeployDriftBaseline({ chainId: 8453, contractAddress: CONTRACT });
    expect(baseline).toBeNull();
  });

  it("captures a non-proxy baseline", async () => {
    mockClient.getBytecode.mockResolvedValue("0x6001");
    mockClient.getStorageAt.mockResolvedValue(ZERO_SLOT);

    const baseline = await captureDeployDriftBaseline({ chainId: 8453, contractAddress: CONTRACT });
    expect(baseline).not.toBeNull();
    expect(baseline!.isProxy).toBe(false);
    expect(baseline!.implementationAddress).toBeNull();
    expect(baseline!.bytecodeHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("captures a proxy baseline with the implementation fingerprint", async () => {
    mockClient.getBytecode.mockImplementation(async ({ address }: { address: string }) =>
      address.toLowerCase() === IMPL_A.toLowerCase() ? "0xaaaa" : "0x6001"
    );
    mockClient.getStorageAt.mockResolvedValue(slotFor(IMPL_A));

    const baseline = await captureDeployDriftBaseline({ chainId: 8453, contractAddress: CONTRACT });
    expect(baseline!.isProxy).toBe(true);
    expect(baseline!.implementationAddress?.toLowerCase()).toBe(IMPL_A.toLowerCase());
    expect(baseline!.implementationBytecodeHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("resolves to null instead of throwing on RPC failure", async () => {
    mockClient.getBytecode.mockRejectedValue(new Error("RPC down"));
    const baseline = await captureDeployDriftBaseline({ chainId: 8453, contractAddress: CONTRACT });
    expect(baseline).toBeNull();
  });
});

describe("checkDeployDrift", () => {
  it("reports no drift when the implementation is unchanged", async () => {
    mockClient.getBytecode.mockResolvedValue("0x6001");
    mockClient.getStorageAt.mockResolvedValue(slotFor(IMPL_A));

    const baseline = {
      chainId: 8453,
      contractAddress: CONTRACT,
      bytecodeHash: "0xown",
      isProxy: true,
      implementationAddress: IMPL_A,
      implementationBytecodeHash: "0xhash",
      capturedAt: new Date().toISOString()
    };

    const check = await checkDeployDrift(baseline);
    expect(check.drifted).toBe(false);
    expect(check.reason).toBeNull();
  });

  it("flags IMPLEMENTATION_CHANGED when the proxy points elsewhere", async () => {
    mockClient.getBytecode.mockResolvedValue("0x6001");
    mockClient.getStorageAt.mockResolvedValue(slotFor(IMPL_B));

    const baseline = {
      chainId: 8453,
      contractAddress: CONTRACT,
      bytecodeHash: "0xown",
      isProxy: true,
      implementationAddress: IMPL_A,
      implementationBytecodeHash: "0xhash",
      capturedAt: new Date().toISOString()
    };

    const check = await checkDeployDrift(baseline);
    expect(check.drifted).toBe(true);
    expect(check.reason).toBe("IMPLEMENTATION_CHANGED");
    expect(check.current.implementationAddress?.toLowerCase()).toBe(IMPL_B.toLowerCase());
  });

  it("flags BYTECODE_CHANGED for a non-proxy whose code changed", async () => {
    mockClient.getBytecode.mockResolvedValue("0xdifferent");
    mockClient.getStorageAt.mockResolvedValue(ZERO_SLOT);

    const baseline = {
      chainId: 8453,
      contractAddress: CONTRACT,
      bytecodeHash: "0xoriginalhash",
      isProxy: false,
      implementationAddress: null,
      implementationBytecodeHash: null,
      capturedAt: new Date().toISOString()
    };

    const check = await checkDeployDrift(baseline);
    expect(check.drifted).toBe(true);
    expect(check.reason).toBe("BYTECODE_CHANGED");
  });

  it("flags PROXY_STATUS_CHANGED when a non-proxy becomes a proxy", async () => {
    mockClient.getBytecode.mockResolvedValue("0x6001");
    mockClient.getStorageAt.mockResolvedValue(slotFor(IMPL_A));

    const baseline = {
      chainId: 8453,
      contractAddress: CONTRACT,
      bytecodeHash: "0xown",
      isProxy: false,
      implementationAddress: null,
      implementationBytecodeHash: null,
      capturedAt: new Date().toISOString()
    };

    const check = await checkDeployDrift(baseline);
    expect(check.drifted).toBe(true);
    expect(check.reason).toBe("PROXY_STATUS_CHANGED");
  });

  it("flags CONTRACT_NOT_FOUND when the address has no code anymore", async () => {
    mockClient.getBytecode.mockResolvedValue(undefined);

    const baseline = {
      chainId: 8453,
      contractAddress: CONTRACT,
      bytecodeHash: "0xown",
      isProxy: false,
      implementationAddress: null,
      implementationBytecodeHash: null,
      capturedAt: new Date().toISOString()
    };

    const check = await checkDeployDrift(baseline);
    expect(check.drifted).toBe(true);
    expect(check.reason).toBe("CONTRACT_NOT_FOUND");
  });
});
