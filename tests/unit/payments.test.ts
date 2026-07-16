import { describe, expect, it } from "vitest";

import { buildConfig } from "@/lib/config";
import { decodeSettlementHeader } from "@/lib/payments";

describe("payments config", () => {
  it("payments are disabled by default", () => {
    const config = buildConfig({ NODE_ENV: "test" });
    expect(config.paymentsEnabled).toBe(false);
    expect(config.PAYMENT_PRICE_USDC).toBe(5);
  });

  it("production requires a valid receiver address when payments are enabled", () => {
    expect(() =>
      buildConfig({
        NODE_ENV: "production",
        APP_ENV: "production",
        PAYMENTS_ENABLED: "true",
        RECEIPT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
        BASE_MAINNET_RPC_URL: "https://mainnet.base.org",
        PRIVATE_LINK_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef"
      })
    ).toThrow(/PAYMENT_RECEIVER_ADDRESS/);
  });

  it("production accepts payments config with a valid receiver", () => {
    const config = buildConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      PAYMENTS_ENABLED: "true",
      PAYMENT_RECEIVER_ADDRESS: "0x0000000000000000000000000000000000000002",
      RECEIPT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
      BASE_MAINNET_RPC_URL: "https://mainnet.base.org",
      PRIVATE_LINK_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef"
    });

    expect(config.paymentsEnabled).toBe(true);
  });
});

describe("settlement header decoding", () => {
  it("decodes a base64 settlement payload", () => {
    const settlement = {
      success: true,
      transaction: "0xabc",
      network: "base",
      payer: "0x1234"
    };
    const header = Buffer.from(JSON.stringify(settlement), "utf8").toString("base64");

    expect(decodeSettlementHeader(header)).toEqual(settlement);
  });

  it("returns null for malformed payloads", () => {
    expect(decodeSettlementHeader("not-base64-json")).toBeNull();
  });
});
