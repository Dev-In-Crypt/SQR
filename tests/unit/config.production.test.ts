import { describe, expect, it } from "vitest";

import { buildConfig } from "@/lib/config";

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_ENV: "production",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public",
  NEXT_PUBLIC_APP_URL: "https://example.com",
  PRIVATE_LINK_SECRET: "12345678901234567890123456789012"
};

describe("production config hardening", () => {
  it("requires receipt contract address in production", () => {
    expect(() =>
      buildConfig({
        ...baseEnv,
        BASE_MAINNET_RPC_URL: "https://mainnet.base.org"
      })
    ).toThrow(/RECEIPT_CONTRACT_ADDRESS is required/i);
  });

  it("requires mainnet RPC in production", () => {
    expect(() =>
      buildConfig({
        ...baseEnv,
        RECEIPT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001"
      })
    ).toThrow(/BASE_MAINNET_RPC_URL/i);
  });

  it("rejects default private link secret in production", () => {
    expect(() =>
      buildConfig({
        ...baseEnv,
        BASE_MAINNET_RPC_URL: "https://mainnet.base.org",
        RECEIPT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
        PRIVATE_LINK_SECRET: "dev-secret-change-me"
      })
    ).toThrow(/PRIVATE_LINK_SECRET/i);
  });

  it("accepts valid production configuration", () => {
    const config = buildConfig({
      ...baseEnv,
      BASE_MAINNET_RPC_URL: "https://mainnet.base.org",
      RECEIPT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001"
    });

    expect(config.APP_ENV).toBe("production");
    expect(config.RECEIPT_CONTRACT_ADDRESS).toBe("0x0000000000000000000000000000000000000001");
  });
});

