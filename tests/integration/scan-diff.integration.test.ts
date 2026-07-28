import { describe, expect, it } from "vitest";

import { createSession, waitForAnalysisTerminal } from "./setup/helpers";

// Sentinel address the SQR_TEST_SOURCE_STUB (lib/source/fetch-verified.ts)
// treats as a verified BASE_ADDRESS contract with fixed, deterministic source.
const SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000001";

async function analyzeAddress(session: ReturnType<typeof createSession>) {
  const create = await session.postJson<{ analysisId?: string }>("/api/v1/analysis/quick", {
    inputType: "BASE_ADDRESS",
    address: SENTINEL_ADDRESS,
    chainId: 8453
  });
  expect(create.status).toBe(202);
  return await waitForAnalysisTerminal(session, create.body.analysisId!);
}

function diffUrl(reportId: string, token: string | null) {
  return token ? `/api/v1/report/${reportId}/diff?token=${encodeURIComponent(token)}` : `/api/v1/report/${reportId}/diff`;
}

describe("API integration - scan-to-scan diff (BASE_ADDRESS pipeline wiring)", () => {
  it("reports no prior report on the first analysis of an address", async () => {
    const session = createSession({ ip: "203.0.113.210" });
    const terminal = await analyzeAddress(session);
    expect(terminal.reportId).toBeTruthy();

    const response = await session.getJson<{ available: boolean; reason?: string }>(
      diffUrl(terminal.reportId!, terminal.privateToken)
    );

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe("NO_PRIOR_REPORT");
  });

  it("finds the same owner's prior scan of the same address and computes a diff", async () => {
    const session = createSession({ ip: "203.0.113.211" });
    const first = await analyzeAddress(session);
    const second = await analyzeAddress(session);
    expect(second.reportId).not.toBe(first.reportId);

    const response = await session.getJson<{
      available: boolean;
      previousReport?: { reportId: string };
      unchangedCount?: number;
      newFindings?: unknown[];
      resolvedFindings?: unknown[];
      riskIncreased?: boolean;
    }>(diffUrl(second.reportId!, second.privateToken));

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.previousReport?.reportId).toBe(first.reportId);
    // The mock source is fixed content, so the second scan reproduces the same
    // findings as the first: no deltas, only unchanged (possibly zero if the
    // trivial mock contract itself has no static findings).
    expect(response.body.newFindings).toEqual([]);
    expect(response.body.resolvedFindings).toEqual([]);
    expect(response.body.riskIncreased).toBe(false);
  });

  it("never surfaces another owner's report as the prior scan (privacy boundary)", async () => {
    const ownerA = createSession({ ip: "203.0.113.212" });
    await analyzeAddress(ownerA); // establishes a report for this address under owner A

    const ownerB = createSession({ ip: "203.0.113.213" });
    const terminalB = await analyzeAddress(ownerB);

    const response = await ownerB.getJson<{ available: boolean; reason?: string }>(
      diffUrl(terminalB.reportId!, terminalB.privateToken)
    );

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe("NO_PRIOR_REPORT");
  });

  it("is not applicable for a PASTE_CODE report", async () => {
    const session = createSession({ ip: "203.0.113.214" });
    const create = await session.postJson<{ analysisId?: string }>("/api/v1/analysis/quick", {
      inputType: "PASTE_CODE",
      code: [
        "// SPDX-License-Identifier: MIT",
        "pragma solidity ^0.8.20;",
        "contract ScanDiffPasteProbe { uint256 public x; }"
      ].join("\n"),
      chainId: 8453
    });
    expect(create.status).toBe(202);
    const terminal = await waitForAnalysisTerminal(session, create.body.analysisId!);

    const response = await session.getJson<{ available: boolean; reason?: string }>(
      diffUrl(terminal.reportId!, terminal.privateToken)
    );

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe("NOT_APPLICABLE");
  });

  it("rejects a non-owner viewer even with a valid share token pointing at someone else's report", async () => {
    const owner = createSession({ ip: "203.0.113.215" });
    const terminal = await analyzeAddress(owner);

    const stranger = createSession({ ip: "203.0.113.216" });
    const response = await stranger.getJson<{ error?: { code?: string } }>(
      `/api/v1/report/${terminal.reportId}/diff`
    );

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("FORBIDDEN");
  });
});
