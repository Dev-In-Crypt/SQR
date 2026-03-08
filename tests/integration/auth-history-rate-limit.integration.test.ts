import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import {
  authenticateWallet,
  createPasteAnalysisAndWait,
  createSession,
  uniqueCodeSnippet
} from "./setup/helpers";

describe("API integration - auth, history, and rate limiting", () => {
  it("nonce can be used once and replay is denied", async () => {
    const session = createSession({ ip: "203.0.113.30" });
    const account = privateKeyToAccount(
      "0x8b3a350cf5c34c9194ca2f9d8f62f6b7f2e7f0cf2f7d231e4f6a9f4f8c1f8f26" as Hex
    );

    const nonceResp = await session.postJson<{
      nonce?: string;
      message?: string;
      error?: { code: string; message: string };
    }>("/api/v1/auth/nonce", {
      wallet: account.address
    });

    expect(nonceResp.status).toBe(200);
    expect(nonceResp.body.nonce).toBeTruthy();
    expect(nonceResp.body.message).toBeTruthy();

    const signature = await account.signMessage({
      message: nonceResp.body.message || ""
    });

    const verify1 = await session.postJson<{
      ok?: boolean;
      error?: { code: string; message: string };
    }>("/api/v1/auth/verify", {
      wallet: account.address,
      nonce: nonceResp.body.nonce,
      signature
    });

    expect(verify1.status).toBe(200);
    expect(verify1.body.ok).toBe(true);

    const verify2 = await session.postJson<{
      ok?: boolean;
      error?: { code: string; message: string };
    }>("/api/v1/auth/verify", {
      wallet: account.address,
      nonce: nonceResp.body.nonce,
      signature
    });

    expect(verify2.status).toBe(401);
    expect(verify2.body.error?.code).toBe("INVALID_NONCE");
  });

  it("history endpoint is wallet-scoped", async () => {
    const walletASession = createSession({ ip: "203.0.113.31" });
    const walletBSession = createSession({ ip: "203.0.113.32" });

    await authenticateWallet(walletASession);
    await authenticateWallet(walletBSession);

    const a1 = await createPasteAnalysisAndWait(walletASession, uniqueCodeSnippet("HistoryA"));
    const a2 = await createPasteAnalysisAndWait(walletASession, uniqueCodeSnippet("HistoryA2"));
    const b1 = await createPasteAnalysisAndWait(walletBSession, uniqueCodeSnippet("HistoryB"));

    const historyA = await walletASession.getJson<{
      items?: Array<{ reportId: string }>;
      error?: { code: string; message: string };
    }>("/api/v1/history?limit=50");

    const historyB = await walletBSession.getJson<{
      items?: Array<{ reportId: string }>;
      error?: { code: string; message: string };
    }>("/api/v1/history?limit=50");

    expect(historyA.status).toBe(200);
    expect(historyB.status).toBe(200);

    const aReportIds = new Set((historyA.body.items || []).map((item) => item.reportId));
    const bReportIds = new Set((historyB.body.items || []).map((item) => item.reportId));

    expect(aReportIds.has(a1.reportId)).toBe(true);
    expect(aReportIds.has(a2.reportId)).toBe(true);
    expect(aReportIds.has(b1.reportId)).toBe(false);

    expect(bReportIds.has(b1.reportId)).toBe(true);
    expect(bReportIds.has(a1.reportId)).toBe(false);
  });

  it("bursts from the same anonymous IP are throttled with stable error format", async () => {
    const session = createSession({ ip: "203.0.113.33" });

    let throttledResponse: { code?: string; message?: string } | null = null;

    for (let i = 0; i < 40; i += 1) {
      const response = await session.postJson<{
        analysisId?: string;
        error?: { code: string; message: string };
      }>("/api/v1/analysis", {
        inputType: "PASTE_CODE",
        code: "",
        chainId: 8453
      });

      if (response.status === 429) {
        throttledResponse = response.body.error || null;
        break;
      }
    }

    expect(throttledResponse).not.toBeNull();
    expect(throttledResponse?.code).toBe("RATE_LIMITED");
    expect(typeof throttledResponse?.message).toBe("string");
  });

  it("bursts from the same wallet are throttled deterministically", async () => {
    const session = createSession({ ip: "203.0.113.34" });
    await authenticateWallet(session);

    let throttledResponse: { code?: string; message?: string } | null = null;

    for (let i = 0; i < 40; i += 1) {
      const response = await session.postJson<{
        analysisId?: string;
        error?: { code: string; message: string };
      }>("/api/v1/analysis", {
        inputType: "PASTE_CODE",
        code: "",
        chainId: 8453
      });

      if (response.status === 429) {
        throttledResponse = response.body.error || null;
        break;
      }
    }

    expect(throttledResponse).not.toBeNull();
    expect(throttledResponse?.code).toBe("RATE_LIMITED");
    expect(typeof throttledResponse?.message).toBe("string");
  });

  it("mixed wallet/IP burst patterns still return stable throttling responses", async () => {
    const walletASession = createSession({ ip: "203.0.113.35" });
    const walletBSession = createSession({ ip: "203.0.113.35" });

    await authenticateWallet(walletASession);
    await authenticateWallet(walletBSession);

    let seenThrottle = false;

    for (let i = 0; i < 50; i += 1) {
      const session = i % 2 === 0 ? walletASession : walletBSession;
      const response = await session.postJson<{
        analysisId?: string;
        error?: { code: string; message: string };
      }>("/api/v1/analysis", {
        inputType: "PASTE_CODE",
        code: "",
        chainId: 8453
      });

      if (response.status === 429) {
        seenThrottle = true;
        expect(response.body.error?.code).toBe("RATE_LIMITED");
        expect(typeof response.body.error?.message).toBe("string");
        break;
      }
    }

    expect(seenThrottle).toBe(true);
  });
});
