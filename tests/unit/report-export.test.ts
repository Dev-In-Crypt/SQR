import { describe, expect, it } from "vitest";

import { reportToMarkdown } from "@/lib/report-export";
import type { ReportPayload } from "@/lib/types";

function makeReport(overrides?: Partial<ReportPayload>): ReportPayload {
  return {
    executiveSummary: "One medium-severity issue found.",
    scannerSummary: "scanner summary",
    findings: [
      {
        id: "f-1",
        title: "Reentrancy risk",
        severity: "HIGH",
        evidence: [{ filePath: "Bank.sol", line: 20, excerpt: "target.call{value: amount}(\"\");" }],
        whyItMatters: "External call before state update enables reentrancy.",
        fixDirection: "Apply checks-effects-interactions.",
        confidence: 90,
        needsManualCheck: false,
        fingerprint: "fp-1"
      },
      {
        id: "f-2",
        title: "Low severity note",
        severity: "LOW",
        evidence: [],
        whyItMatters: "Minor.",
        fixDirection: "Optional.",
        confidence: 40,
        needsManualCheck: true,
        fingerprint: "fp-2"
      }
    ],
    aiAuditFindings: [
      {
        severity: "MEDIUM",
        title: "Unchecked return value",
        location: "Bank.sol:31",
        explanation: "Return value of low-level call ignored.",
        evidence: "bool ok = target.call(data);",
        fixDirection: "Check the boolean.",
        source: "ai"
      }
    ],
    metadata: {
      analyzerVersion: "0.1.0",
      rulesetVersion: "0.1.0",
      generatedAt: "2026-07-16T00:00:00.000Z",
      inputType: "PASTE_CODE",
      chainId: 8453,
      sourceHash: "0xsource"
    },
    warnings: ["a warning"],
    scannerErrors: [],
    partialReasons: [],
    reportHash: "0xreporthash",
    ...overrides
  };
}

describe("reportToMarkdown", () => {
  const base = {
    reportId: "report-123",
    topSeverity: "HIGH" as const,
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    analysis: { inputType: "PASTE_CODE" as const, chainId: 8453 }
  };

  it("renders headers, metadata and severity-ordered findings", () => {
    const md = reportToMarkdown({ ...base, report: makeReport() });

    expect(md).toContain("# Security Review Memo");
    expect(md).toContain("Report ID: `report-123`");
    expect(md).toContain("| Report hash | `0xreporthash` |");
    expect(md).toContain("## Executive summary");
    expect(md).toContain("### HIGH (1)");
    expect(md).toContain("### LOW (1)");
    // HIGH group must precede LOW group.
    expect(md.indexOf("### HIGH")).toBeLessThan(md.indexOf("### LOW"));
    // Evidence fenced as solidity with file:line comment.
    expect(md).toContain("```solidity");
    expect(md).toContain("// Bank.sol:20");
  });

  it("includes AI findings and coverage notes for owner payloads", () => {
    const md = reportToMarkdown({ ...base, report: makeReport() });
    expect(md).toContain("## AI-assisted audit findings");
    expect(md).toContain("Unchecked return value");
    expect(md).toContain("## Coverage notes");
    expect(md).toContain("- Warning: a warning");
  });

  it("omits coverage notes when the payload is stripped (non-owner)", () => {
    const md = reportToMarkdown({
      ...base,
      report: makeReport({ warnings: [], scannerErrors: [], partialReasons: [] })
    });
    expect(md).not.toContain("## Coverage notes");
  });
});
