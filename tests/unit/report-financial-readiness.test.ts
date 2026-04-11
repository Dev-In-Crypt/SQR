import { describe, expect, it } from "vitest";

import { buildReport } from "@/lib/report";
import type { Finding, SourceBundle } from "@/lib/types";

function bundleFromSource(source: string): SourceBundle {
  return {
    inputType: "PASTE_CODE",
    chainId: 133,
    files: [
      {
        path: "Contract.sol",
        content: source
      }
    ],
    lineCount: source.split("\n").length,
    isVerifiedSource: false,
    sourceMeta: {
      sourceProvider: "paste"
    },
    sourceHash: "0xreadiness"
  };
}

function finding(params: { title: string; severity: Finding["severity"]; why: string; fix: string }): Finding {
  return {
    id: `id-${params.title}`,
    title: params.title,
    severity: params.severity,
    evidence: [{ filePath: "Contract.sol", line: 1, excerpt: params.title }],
    whyItMatters: params.why,
    fixDirection: params.fix,
    confidence: 85,
    needsManualCheck: false,
    fingerprint: `fp-${params.title}`
  };
}

describe("financial review integration readiness", () => {
  it("marks low-signal contract as GREEN", async () => {
    const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MinimalTreasury {
  uint256 public balance;
  function deposit() external payable { balance += msg.value; }
}`;

    const result = await buildReport({
      findings: [],
      warnings: [],
      scannerErrors: [],
      partialReasons: [],
      sourceBundle: bundleFromSource(source),
      reviewMode: "DEFI_PAYFI",
      aiAuditFindings: []
    });

    expect(result.report.financialReview?.integrationReadiness.status).toBe("GREEN");
    expect(result.report.financialReview?.integrationReadiness.confidenceScore).toBeGreaterThanOrEqual(60);
  });

  it("marks upgrade-admin profile as AMBER", async () => {
    const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract UpgradeController {
  address public owner;
  address public implementation;
  modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
  function upgrade(address newImpl) external onlyOwner { implementation = newImpl; }
}`;

    const result = await buildReport({
      findings: [],
      warnings: [],
      scannerErrors: [],
      partialReasons: [],
      sourceBundle: bundleFromSource(source),
      reviewMode: "DEFI_PAYFI",
      aiAuditFindings: []
    });

    expect(result.report.financialReview?.integrationReadiness.status).toBe("AMBER");
    expect((result.report.financialReview?.observedControls || []).length).toBeGreaterThan(0);
    expect(result.report.financialReview?.sections.some((section) => section.riskLevel === "MEDIUM")).toBe(true);
  });

  it("marks high-severity privilege/fund findings as RED", async () => {
    const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract CustodyVault {
  address public owner;
  function sweep(address token, address to) external { /* simulated */ }
}`;

    const findings = [
      finding({
        title: "Owner can transfer funds without timelock",
        severity: "HIGH",
        why: "Privileged owner transfer path can move user assets immediately.",
        fix: "Add timelock, multi-sig approval, and withdrawal limits for admin actions."
      }),
      finding({
        title: "Oracle dependency has no freshness guard",
        severity: "MEDIUM",
        why: "Stale oracle dependency may break settlement assumptions.",
        fix: "Validate heartbeat and updatedAt bounds before settlement."
      })
    ];

    const result = await buildReport({
      findings,
      warnings: [],
      scannerErrors: [],
      partialReasons: [],
      sourceBundle: bundleFromSource(source),
      reviewMode: "DEFI_PAYFI",
      aiAuditFindings: []
    });

    expect(result.report.financialReview?.integrationReadiness.status).toBe("RED");
    expect(result.report.financialReview?.integrationReadiness.rationale.length).toBeGreaterThan(1);
  });
});
