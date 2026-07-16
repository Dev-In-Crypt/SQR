import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  createSession,
  prismaForTests,
  uniqueCodeSnippet,
  waitForAnalysisTerminal
} from "./setup/helpers";

async function postQuick(session: ReturnType<typeof createSession>, body: unknown) {
  return session.postJson<{ analysisId?: string; mode?: string; error?: { code: string } }>(
    "/api/v1/analysis/quick",
    body
  );
}

describe("API integration - quick scan", () => {
  const prisma = prismaForTests();

  it("runs a static-only quick scan without a wallet and produces no AI findings", async () => {
    const session = createSession({ ip: "203.0.113.70" });

    const { status, body } = await postQuick(session, {
      inputType: "PASTE_CODE",
      code: uniqueCodeSnippet("QuickPaste"),
      chainId: 8453
    });

    expect(status).toBe(202);
    expect(body.analysisId).toBeTruthy();

    const terminal = await waitForAnalysisTerminal(session, body.analysisId!);
    expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(terminal.status);
    expect(terminal.reportId).toBeTruthy();

    const analysis = await prisma.analysisRequest.findUnique({ where: { id: body.analysisId! } });
    expect(analysis!.mode).toBe("QUICK_SCAN");

    const report = await prisma.report.findUnique({ where: { analysisId: body.analysisId! } });
    const reportJson = report!.reportJson as { aiAuditFindings?: unknown[] };
    expect(reportJson.aiAuditFindings ?? []).toEqual([]);
  });

  it("allows BASE_ADDRESS quick scan without wallet where the full route requires login", async () => {
    const address = "0x00000000000000000000000000000000000000a1";

    const fullSession = createSession({ ip: "203.0.113.71" });
    const full = await fullSession.postJson<{ error?: { code: string } }>("/api/v1/analysis", {
      inputType: "BASE_ADDRESS",
      address,
      chainId: 8453
    });
    expect(full.status).toBe(401);
    expect(full.body.error?.code).toBe("WALLET_REQUIRED");

    const quickSession = createSession({ ip: "203.0.113.72" });
    const quick = await postQuick(quickSession, {
      inputType: "BASE_ADDRESS",
      address,
      chainId: 8453
    });
    // Quick scan accepts the request (202); source may be unverified in tests,
    // which is a terminal FAILED rather than an auth rejection.
    expect(quick.status).toBe(202);
    expect(quick.body.analysisId).toBeTruthy();
  });

  it("enforces the quick-scan daily bucket limit", async () => {
    const session = createSession({ ip: "203.0.113.73" });

    let throttled = false;
    for (let i = 0; i < 15 && !throttled; i += 1) {
      const { status, body } = await postQuick(session, {
        inputType: "PASTE_CODE",
        code: uniqueCodeSnippet(`QuickLimit${i}`),
        chainId: 8453
      });
      if (status === 429) {
        throttled = true;
        expect(body.error?.code).toBe("RATE_LIMITED");
      }
    }

    expect(throttled).toBe(true);
  });

  it("a quick-scan row does not satisfy the paid route's reuse check", async () => {
    const session = createSession({ ip: "203.0.113.74" });
    const code = uniqueCodeSnippet("QuickNoReuse");

    const quick = await postQuick(session, { inputType: "PASTE_CODE", code, chainId: 8453 });
    expect(quick.status).toBe(202);
    await waitForAnalysisTerminal(session, quick.body.analysisId!);

    // The paid route (payments enabled in tests) must NOT return 409 for the
    // same input just because a quick-scan report exists — it should proceed
    // to a 402 payment challenge instead.
    const paid = await session.request("/api/v1/analysis/paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputType: "PASTE_CODE", code, chainId: 8453 })
    });

    expect(paid.status).toBe(402);
  });

  it("prefers an existing FULL report over creating a quick scan", async () => {
    const session = createSession({ ip: "203.0.113.75" });
    await session.getJson("/api/v1/session");

    const account = privateKeyToAccount(generatePrivateKey());
    void account;

    const code = uniqueCodeSnippet("QuickPrefersFull");
    const full = await session.postJson<{ analysisId?: string }>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code,
      chainId: 8453
    });
    expect(full.status).toBe(202);
    await waitForAnalysisTerminal(session, full.body.analysisId!);

    const quick = await postQuick(session, { inputType: "PASTE_CODE", code, chainId: 8453 });
    expect(quick.status).toBe(202);
    expect(quick.body.analysisId).toBe(full.body.analysisId);
  });
});
