import { describe, expect, it } from "vitest";

import { clusterConsensusFindings } from "@/lib/llm";
import type { AIAuditFinding } from "@/lib/types";

function f(partial: Partial<AIAuditFinding> & { title: string }): AIAuditFinding {
  return {
    severity: "HIGH",
    location: "Vault.withdraw()",
    explanation: "explanation",
    evidence: "evidence",
    fixDirection: "fix",
    source: "ai",
    ...partial
  };
}

describe("clusterConsensusFindings", () => {
  it("scores a finding raised by every model as full agreement", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Reentrancy in withdraw" })],
      [f({ title: "Reentrancy vulnerability in withdraw function" })],
      [f({ title: "Withdraw is vulnerable to reentrancy attacks" })]
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out).toHaveLength(1);
    expect(out[0].modelAgreement).toBe(3);
    expect(out[0].modelsQueried).toBe(3);
  });

  it("keeps the most detailed variant as the representative", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Reentrancy in withdraw", explanation: "short" })],
      [f({ title: "Reentrancy in withdraw", explanation: "a much longer and more detailed explanation of the bug" })]
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out).toHaveLength(1);
    expect(out[0].explanation).toContain("much longer");
    expect(out[0].modelAgreement).toBe(2);
  });

  it("does not inflate agreement when one model raises two similar findings", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Reentrancy in withdraw" }), f({ title: "Reentrancy issue in withdraw path" })],
      []
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out).toHaveLength(1);
    expect(out[0].modelAgreement).toBe(1); // one distinct model, not two
  });

  it("treats different severities as distinct findings", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Reentrancy in withdraw", severity: "HIGH" })],
      [f({ title: "Reentrancy in withdraw", severity: "LOW" })]
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out).toHaveLength(2);
    expect(out.every((x) => x.modelAgreement === 1)).toBe(true);
  });

  it("drops singleton findings when minAgreement is 2", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Reentrancy in withdraw" }), f({ title: "Unrelated gas issue", location: "Token.transfer()", severity: "LOW" })],
      [f({ title: "Reentrancy in withdraw function" })]
    ];
    const out = clusterConsensusFindings(perModel, 2);
    expect(out).toHaveLength(1);
    expect(out[0].title.toLowerCase()).toContain("reentrancy");
    expect(out[0].modelAgreement).toBe(2);
  });

  it("clusters by matching location even when titles differ", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Funds can be drained", location: "Vault.withdraw()" })],
      [f({ title: "Missing checks-effects-interactions", location: "Vault.withdraw() line 12" })]
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out).toHaveLength(1);
    expect(out[0].modelAgreement).toBe(2);
  });

  it("sorts by agreement then severity", () => {
    const perModel: AIAuditFinding[][] = [
      [f({ title: "Low agreement high sev", severity: "CRITICAL", location: "A.x()" })],
      [f({ title: "High agreement", severity: "LOW", location: "B.y()" })],
      [f({ title: "High agreement dup", severity: "LOW", location: "B.y()" })]
    ];
    const out = clusterConsensusFindings(perModel, 1);
    expect(out[0].modelAgreement).toBe(2); // agreement wins over severity
    expect(out[1].severity).toBe("CRITICAL");
  });

  it("returns nothing for no findings", () => {
    expect(clusterConsensusFindings([[], [], []], 1)).toHaveLength(0);
  });
});
