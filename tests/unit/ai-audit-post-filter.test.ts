import { describe, expect, it } from "vitest";

import { filterAIAuditFindings } from "@/lib/ai-audit-post-filter";
import type { AIAuditFinding } from "@/lib/types";

function makeFinding(overrides: Partial<AIAuditFinding>): AIAuditFinding {
  return {
    severity: "MEDIUM",
    title: "Base finding",
    location: "function run()",
    explanation: "Concrete issue supported by code.",
    evidence: "require(msg.sender == owner);",
    fixDirection: "Apply minimal corrective change.",
    source: "ai",
    ...overrides
  };
}

describe("AI audit post-filter", () => {
  it("drops false-positive reentrancy findings without concrete path", () => {
    const findings = [
      makeFinding({
        severity: "HIGH",
        title: "Reentrancy vulnerability",
        explanation:
          "State is updated before the external call and the function uses a nonReentrant guard, so this is mitigated.",
        evidence: "balances[msg.sender] -= amount; nonReentrant; target.call(data);",
        fixDirection: "No immediate fix required."
      })
    ];

    expect(filterAIAuditFindings(findings)).toEqual([]);
  });

  it("drops optional hardening findings", () => {
    const findings = [
      makeFinding({
        severity: "LOW",
        title: "Optional hardening",
        explanation: "r should be non-zero and constructor should emit event for clarity.",
        evidence: "constructor() { owner = msg.sender; }",
        fixDirection: "Could be improved with extra checks and documentation."
      })
    ];

    expect(filterAIAuditFindings(findings)).toEqual([]);
  });

  it("drops contradictory findings where title and evidence conflict", () => {
    const findings = [
      makeFinding({
        severity: "HIGH",
        title: "Missing access control on admin function",
        explanation: "Function lacks access control.",
        evidence: "require(msg.sender == owner, \"only owner\");",
        fixDirection: "Add access control."
      })
    ];

    expect(filterAIAuditFindings(findings)).toEqual([]);
  });

  it("keeps real escrow/accounting findings with direct evidence", () => {
    const finding = makeFinding({
      severity: "HIGH",
      title: "Unilateral refund control breaks escrow neutrality",
      location: "function cancelEscrow()",
      explanation:
        "Seller can unilaterally trigger refund and redirect payout flow, breaking escrow neutrality and fund control assumptions.",
      evidence:
        "if (msg.sender == seller) { refunded += plannedAmount; token.transfer(buyer, plannedAmount); } // uses plannedAmount instead of actual balance",
      fixDirection: "Require mutual consent or neutral arbitration and reconcile against actual received balances."
    });

    expect(filterAIAuditFindings([finding])).toEqual([finding]);
  });
});
