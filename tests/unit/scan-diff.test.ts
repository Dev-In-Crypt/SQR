import { describe, expect, it } from "vitest";

import { diffFindings, type DiffableFinding } from "@/lib/scan-diff";

function f(title: string, severity: DiffableFinding["severity"], filePath = "Vault.sol"): DiffableFinding {
  return { title, severity, filePath };
}

describe("diffFindings", () => {
  it("has no deltas when both scans are identical", () => {
    const findings = [f("reentrancy-eth", "HIGH"), f("tx-origin", "LOW")];
    const result = diffFindings(findings, findings);
    expect(result.newFindings).toHaveLength(0);
    expect(result.resolvedFindings).toHaveLength(0);
    expect(result.severityChanges).toHaveLength(0);
    expect(result.unchangedCount).toBe(2);
    expect(result.riskIncreased).toBe(false);
  });

  it("flags a new HIGH finding as increased risk", () => {
    const previous = [f("tx-origin", "LOW")];
    const current = [f("tx-origin", "LOW"), f("reentrancy-eth", "HIGH")];
    const result = diffFindings(previous, current);
    expect(result.newFindings).toHaveLength(1);
    expect(result.newFindings[0].title).toBe("reentrancy-eth");
    expect(result.unchangedCount).toBe(1);
    expect(result.riskIncreased).toBe(true);
  });

  it("does not flag increased risk for a new LOW finding", () => {
    const previous = [f("tx-origin", "LOW")];
    const current = [f("tx-origin", "LOW"), f("missing-zero-check", "LOW")];
    const result = diffFindings(previous, current);
    expect(result.newFindings).toHaveLength(1);
    expect(result.riskIncreased).toBe(false);
  });

  it("reports a resolved finding when it disappears", () => {
    const previous = [f("reentrancy-eth", "HIGH"), f("tx-origin", "LOW")];
    const current = [f("tx-origin", "LOW")];
    const result = diffFindings(previous, current);
    expect(result.resolvedFindings).toHaveLength(1);
    expect(result.resolvedFindings[0].title).toBe("reentrancy-eth");
    expect(result.newFindings).toHaveLength(0);
    // Resolving a HIGH does not itself count as increased risk.
    expect(result.riskIncreased).toBe(false);
  });

  it("flags a severity escalation for the same finding", () => {
    const previous = [f("weak-prng", "MEDIUM")];
    const current = [f("weak-prng", "HIGH")];
    const result = diffFindings(previous, current);
    expect(result.severityChanges).toHaveLength(1);
    expect(result.severityChanges[0].previousSeverity).toBe("MEDIUM");
    expect(result.severityChanges[0].severity).toBe("HIGH");
    expect(result.riskIncreased).toBe(true);
  });

  it("does not flag a severity de-escalation as increased risk", () => {
    const previous = [f("weak-prng", "HIGH")];
    const current = [f("weak-prng", "MEDIUM")];
    const result = diffFindings(previous, current);
    expect(result.severityChanges).toHaveLength(1);
    expect(result.riskIncreased).toBe(false);
  });

  it("matches duplicate (title, filePath) pairs positionally, not as a single bucket", () => {
    // Same detector fires twice in the same file in both scans — line numbers
    // differ (code shifted), but both instances persist: should read as
    // unchanged x2, not resolved+new.
    const previous = [f("unchecked-lowlevel", "MEDIUM"), f("unchecked-lowlevel", "MEDIUM")];
    const current = [f("unchecked-lowlevel", "MEDIUM"), f("unchecked-lowlevel", "MEDIUM")];
    const result = diffFindings(previous, current);
    expect(result.unchangedCount).toBe(2);
    expect(result.newFindings).toHaveLength(0);
    expect(result.resolvedFindings).toHaveLength(0);
  });

  it("treats the same title in different files as distinct findings", () => {
    const previous = [f("tx-origin", "LOW", "A.sol")];
    const current = [f("tx-origin", "LOW", "B.sol")];
    const result = diffFindings(previous, current);
    expect(result.newFindings).toHaveLength(1);
    expect(result.resolvedFindings).toHaveLength(1);
    expect(result.unchangedCount).toBe(0);
  });

  it("computes topSeverity/previousTopSeverity across empty and non-empty sets", () => {
    const result = diffFindings([], [f("reentrancy-eth", "CRITICAL")]);
    expect(result.previousTopSeverity).toBe("INFO");
    expect(result.topSeverity).toBe("CRITICAL");
    expect(result.riskIncreased).toBe(true);
  });

  it("handles both scans being empty", () => {
    const result = diffFindings([], []);
    expect(result.riskIncreased).toBe(false);
    expect(result.topSeverity).toBe("INFO");
    expect(result.previousTopSeverity).toBe("INFO");
  });
});
