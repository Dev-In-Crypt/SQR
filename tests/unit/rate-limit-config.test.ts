import { describe, expect, it } from "vitest";

import { buildConfig } from "@/lib/config";

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test"
};

describe("rate limit and reuse window config", () => {
  it("applies conservative defaults", () => {
    const config = buildConfig(baseEnv);

    expect(config.RATE_LIMIT_ANON_PER_DAY).toBe(3);
    expect(config.RATE_LIMIT_WALLET_PER_DAY).toBe(10);
    expect(config.RATE_LIMIT_AUTH_IP_PER_DAY).toBe(10);
    expect(config.ANALYSIS_REUSE_WINDOW_MINUTES).toBe(1440);
  });

  it("reads overrides from the environment", () => {
    const config = buildConfig({
      ...baseEnv,
      RATE_LIMIT_ANON_PER_DAY: "7",
      RATE_LIMIT_WALLET_PER_DAY: "25",
      RATE_LIMIT_AUTH_IP_PER_DAY: "40",
      ANALYSIS_REUSE_WINDOW_MINUTES: "60"
    });

    expect(config.RATE_LIMIT_ANON_PER_DAY).toBe(7);
    expect(config.RATE_LIMIT_WALLET_PER_DAY).toBe(25);
    expect(config.RATE_LIMIT_AUTH_IP_PER_DAY).toBe(40);
    expect(config.ANALYSIS_REUSE_WINDOW_MINUTES).toBe(60);
  });

  it("rejects negative limits", () => {
    expect(() =>
      buildConfig({
        ...baseEnv,
        RATE_LIMIT_ANON_PER_DAY: "-1"
      })
    ).toThrow(/RATE_LIMIT_ANON_PER_DAY/);
  });
});
