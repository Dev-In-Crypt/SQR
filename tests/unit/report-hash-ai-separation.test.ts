import { describe, expect, it } from "vitest";

import { buildReport } from "@/lib/report";
import type { Finding, SourceBundle } from "@/lib/types";

function sampleBundle(): SourceBundle {
  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files: [
      {
        path: "PastedSnippet.sol",
        content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { uint256 public x; }"
      }
    ],
    lineCount: 3,
    isVerifiedSource: false,
    sourceMeta: {
      sourceProvider: "paste"
    },
    sourceHash: "0xhash"
  };
}

function sampleFinding(): Finding {
  return {
    id: "f1",
    title: "Reentrancy pattern",
    severity: "MEDIUM",
    evidence: [{ filePath: "PastedSnippet.sol", line: 3, excerpt: "call(...)" }],
    whyItMatters: "External call pattern may allow reentrancy if state updates are delayed.",
    fixDirection: "Apply checks-effects-interactions and consider reentrancy guard.",
    confidence: 80,
    needsManualCheck: false,
    fingerprint: "fp1"
  };
}

describe("report hash excludes AI outputs", () => {
  it("keeps reportHash stable when aiAuditFindings differ", async () => {
    const common = {
      findings: [sampleFinding()],
      warnings: ["MISSING_PRAGMA"],
      scannerErrors: [],
      partialReasons: [],
      sourceBundle: sampleBundle()
    };

    const first = await buildReport({
      ...common,
      aiAuditFindings: []
    });

    const second = await buildReport({
      ...common,
      aiAuditFindings: [
        {
          severity: "LOW",
          title: "Input validation can be stricter",
          location: "function set(uint256 value)",
          explanation: "Input bounds are not validated.",
          evidence: "Function accepts unbounded value and writes it directly.",
          fixDirection: "Add explicit bounds checks where business logic requires.",
          source: "ai"
        }
      ]
    });

    expect(first.report.reportHash).toBe(second.report.reportHash);
    expect(typeof second.report.scannerSummary).toBe("string");
    expect(second.report.executiveSummary).toBe(second.report.scannerSummary);
    expect(second.report.aiAuditFindings.length).toBe(1);
  });
});
