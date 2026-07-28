import { describe, expect, it } from "vitest";

import { createSession, waitForAnalysisTerminal } from "./setup/helpers";

// Sentinel address the SQR_TEST_SOURCE_STUB (lib/source/fetch-verified.ts)
// treats as a verified BASE_ADDRESS contract, independent of the deploy-drift
// baseline capture which reads real bytecode from the shared anvil RPC.
const SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000001";
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const json = (await response.json()) as { result?: unknown; error?: unknown };
  if (json.error) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

function addressPadded(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

// Builds a syntactically valid 20-byte (40 hex char) test address from a short
// suffix, so there is no manual hex-counting to get wrong.
function testAddress(suffix: string): string {
  return `0x${suffix.padStart(40, "0")}`;
}

describe("API integration - deploy drift (BASE_ADDRESS pipeline wiring)", () => {
  const rpcUrl = process.env.SQR_TEST_RPC_URL as string;

  it("captures a proxy baseline at analysis time and the drift route detects an upgrade", async () => {
    expect(rpcUrl).toBeTruthy();

    // Give the sentinel address real bytecode and point its EIP-1967 slot at an
    // implementation, simulating a verified proxy contract on the analysis chain.
    const implA = testAddress("a111");
    const implB = testAddress("a222");
    await rpcCall(rpcUrl, "anvil_setCode", [SENTINEL_ADDRESS, "0x6001600155"]);
    await rpcCall(rpcUrl, "anvil_setCode", [implA, "0x6002600255"]);
    await rpcCall(rpcUrl, "anvil_setCode", [implB, "0x6003600355"]);
    await rpcCall(rpcUrl, "anvil_setStorageAt", [
      SENTINEL_ADDRESS,
      EIP1967_IMPLEMENTATION_SLOT,
      addressPadded(implA)
    ]);

    const session = createSession({ ip: "203.0.113.201" });
    const create = await session.postJson<{ analysisId?: string }>("/api/v1/analysis/quick", {
      inputType: "BASE_ADDRESS",
      address: SENTINEL_ADDRESS,
      chainId: 8453
    });
    expect(create.status).toBe(202);

    const terminal = await waitForAnalysisTerminal(session, create.body.analysisId!);
    expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(terminal.status);
    expect(terminal.reportId).toBeTruthy();

    const reportUrl = terminal.privateToken
      ? `/api/v1/report/${terminal.reportId}/drift?token=${encodeURIComponent(terminal.privateToken)}`
      : `/api/v1/report/${terminal.reportId}/drift`;

    const before = await session.getJson<{
      available: boolean;
      checked?: boolean;
      drifted?: boolean;
      baseline?: { isProxy: boolean; implementationAddress: string };
    }>(reportUrl);

    expect(before.status).toBe(200);
    expect(before.body.available).toBe(true);
    expect(before.body.checked).toBe(true);
    expect(before.body.baseline?.isProxy).toBe(true);
    expect(before.body.baseline?.implementationAddress?.toLowerCase()).toBe(implA.toLowerCase());
    expect(before.body.drifted).toBe(false);

    // Simulate a proxy upgrade after the review.
    await rpcCall(rpcUrl, "anvil_setStorageAt", [
      SENTINEL_ADDRESS,
      EIP1967_IMPLEMENTATION_SLOT,
      addressPadded(implB)
    ]);

    const after = await session.getJson<{
      available: boolean;
      checked?: boolean;
      drifted?: boolean;
      reason?: string;
      current?: { implementationAddress: string };
    }>(reportUrl);

    expect(after.status).toBe(200);
    expect(after.body.drifted).toBe(true);
    expect(after.body.reason).toBe("IMPLEMENTATION_CHANGED");
    expect(after.body.current?.implementationAddress?.toLowerCase()).toBe(implB.toLowerCase());
  });

  it("reports available:false for a PASTE_CODE report (no baseline to capture)", async () => {
    const session = createSession({ ip: "203.0.113.202" });
    const create = await session.postJson<{ analysisId?: string }>("/api/v1/analysis/quick", {
      inputType: "PASTE_CODE",
      code: [
        "// SPDX-License-Identifier: MIT",
        "pragma solidity ^0.8.20;",
        "contract DriftPasteProbe { uint256 public x; }"
      ].join("\n"),
      chainId: 8453
    });
    expect(create.status).toBe(202);

    const terminal = await waitForAnalysisTerminal(session, create.body.analysisId!);
    expect(terminal.reportId).toBeTruthy();

    const url = terminal.privateToken
      ? `/api/v1/report/${terminal.reportId}/drift?token=${encodeURIComponent(terminal.privateToken)}`
      : `/api/v1/report/${terminal.reportId}/drift`;
    const response = await session.getJson<{ available: boolean; reason?: string }>(url);

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(false);
    expect(response.body.reason).toBe("NO_BASELINE_CAPTURED");
  });
});
