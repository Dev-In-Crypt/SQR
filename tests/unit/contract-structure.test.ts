import { describe, expect, it } from "vitest";

import { buildStructuredAuditContext } from "@/lib/contract-structure";
import type { SourceBundle } from "@/lib/types";

function makeBundle(content: string): SourceBundle {
  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files: [{ path: "Escrow.sol", content }],
    lineCount: content.split("\n").length,
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: "structured-context-test"
  };
}

describe("contract structure extraction", () => {
  it("extracts escrow role and fund-control context with milestone flow", () => {
    const content = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "",
      "interface IERC20 {",
      "  function transfer(address to, uint256 amount) external returns (bool);",
      "  function transferFrom(address from, address to, uint256 amount) external returns (bool);",
      "}",
      "",
      "contract EscrowMilestones {",
      "  IERC20 public token;",
      "  address public buyer;",
      "  address public seller;",
      "  address public arbiter;",
      "  uint256[] public plannedMilestoneAmounts;",
      "  bool[] public milestoneReleased;",
      "  bool public cancelled;",
      "  uint256 public currentMilestone;",
      "  uint256 public totalReleased;",
      "  mapping(address => uint256) public releasedByUser;",
      "",
      "  modifier onlyBuyerOrArbiter() {",
      "    require(msg.sender == buyer || msg.sender == arbiter, 'auth');",
      "    _;",
      "  }",
      "",
      "  modifier onlySellerOrArbiter() {",
      "    require(msg.sender == seller || msg.sender == arbiter, 'auth');",
      "    _;",
      "  }",
      "",
      "  function deposit(uint256 amount) external {",
      "    token.transferFrom(msg.sender, address(this), amount);",
      "  }",
      "",
      "  function releaseMilestone() external onlyBuyerOrArbiter {",
      "    require(!cancelled, 'cancelled');",
      "    uint256 planned = plannedMilestoneAmounts[currentMilestone];",
      "    milestoneReleased[currentMilestone] = true;",
      "    currentMilestone += 1;",
      "    totalReleased += planned;",
      "    releasedByUser[seller] += planned;",
      "    token.transfer(seller, planned);",
      "  }",
      "",
      "  function cancelEscrow() external onlySellerOrArbiter {",
      "    cancelled = true;",
      "  }",
      "",
      "  function refundBuyer() external onlySellerOrArbiter {",
      "    require(cancelled, 'not cancelled');",
      "    uint256 remaining = plannedMilestoneAmounts[currentMilestone];",
      "    token.transfer(buyer, remaining);",
      "  }",
      "",
      "  function distributeBonuses(address[] calldata recipients, uint256[] calldata amounts) external onlyBuyerOrArbiter {",
      "    for (uint256 i = 0; i < recipients.length; i++) {",
      "      token.transfer(recipients[i], amounts[i]);",
      "    }",
      "  }",
      "}"
    ].join("\n");

    const context = buildStructuredAuditContext(makeBundle(content));

    expect(context.contractNames).toContain("EscrowMilestones");
    expect(context.modifiers.map((item) => item.name)).toContain("onlyBuyerOrArbiter");
    expect(context.rolesOrPrivilegedAddresses.map((item) => item.name)).toEqual(
      expect.arrayContaining(["buyer", "seller", "arbiter"])
    );
    expect(context.authorizationGuards.some((guard) => guard.expression.includes("msg.sender == buyer"))).toBe(true);
    expect(context.valueTransferFunctions.some((fn) => fn.functionName === "releaseMilestone")).toBe(true);
    expect(context.loopLocations.some((loop) => loop.functionName === "distributeBonuses")).toBe(true);
    expect(context.stateFlowGates.map((gate) => gate.variableName)).toContain("cancelled");
    expect(context.progressionIndicators.map((item) => item.variableName)).toContain("currentMilestone");
    expect(context.countersAndTotals.map((item) => item.variableName)).toContain("totalReleased");
    expect(context.mappingTrackers.map((item) => item.variableName)).toContain("releasedByUser");

    const releaseControl = context.fundControlMap.functionControls.find(
      (item) => item.functionName === "releaseMilestone" && item.action === "payout"
    );
    expect(releaseControl).toBeTruthy();
    expect(releaseControl?.callableBy).toEqual(expect.arrayContaining(["arbiter", "buyer"]));
    expect(releaseControl?.usesPlannedValues).toBe(true);
    expect(releaseControl?.usesBalanceChecks).toBe(false);

    const cancelControl = context.fundControlMap.functionControls.find(
      (item) => item.functionName === "cancelEscrow" && item.action === "cancel"
    );
    expect(cancelControl).toBeTruthy();
    expect(cancelControl?.callableBy).toEqual(expect.arrayContaining(["arbiter", "seller"]));

    expect(
      context.logicSummaries.some((summary) => summary.includes("releaseMilestone") && summary.includes("controlled"))
    ).toBe(true);
    expect(
      context.fundControlMap.notes.some((note) => note.includes("without explicit balance check"))
    ).toBe(true);
  });

  it("extracts totals versus per-user mappings for lending style state", () => {
    const content = [
      "pragma solidity ^0.8.20;",
      "contract LendingPool {",
      "  mapping(address => uint256) public supplied;",
      "  mapping(address => uint256) public borrowed;",
      "  uint256 public totalSupply;",
      "  uint256 public totalBorrowed;",
      "",
      "  function supply(uint256 amount) external {",
      "    supplied[msg.sender] += amount;",
      "    totalSupply += amount;",
      "  }",
      "",
      "  function borrow(uint256 amount) external {",
      "    borrowed[msg.sender] += amount;",
      "    totalBorrowed += amount;",
      "  }",
      "",
      "  function repay(uint256 amount) external {",
      "    borrowed[msg.sender] -= amount;",
      "    totalBorrowed -= amount;",
      "  }",
      "}"
    ].join("\n");

    const context = buildStructuredAuditContext(makeBundle(content));
    const counterNames = context.countersAndTotals.map((item) => item.variableName);
    const mappingNames = context.mappingTrackers.map((item) => item.variableName);

    expect(counterNames).toEqual(expect.arrayContaining(["totalSupply", "totalBorrowed"]));
    expect(mappingNames).toEqual(expect.arrayContaining(["supplied", "borrowed"]));
    expect(
      context.mappingTrackers.find((item) => item.variableName === "borrowed")?.updatedInFunctions
    ).toEqual(expect.arrayContaining(["borrow", "repay"]));
  });

  it("marks payout flow as balance-checked when balanceOf guard exists", () => {
    const content = [
      "pragma solidity ^0.8.20;",
      "interface IERC20 {",
      "  function transfer(address to, uint256 amount) external returns (bool);",
      "  function balanceOf(address owner) external view returns (uint256);",
      "}",
      "contract TokenVault {",
      "  IERC20 public token;",
      "  address public owner;",
      "  modifier onlyOwner() {",
      "    require(msg.sender == owner, 'owner');",
      "    _;",
      "  }",
      "  function payout(address to, uint256 amount) external onlyOwner {",
      "    require(token.balanceOf(address(this)) >= amount, 'insufficient');",
      "    token.transfer(to, amount);",
      "  }",
      "}"
    ].join("\n");

    const context = buildStructuredAuditContext(makeBundle(content));
    const payoutControl = context.fundControlMap.functionControls.find(
      (item) => item.functionName === "payout" && item.action === "payout"
    );

    expect(payoutControl).toBeTruthy();
    expect(payoutControl?.usesBalanceChecks).toBe(true);
    expect(context.fundControlMap.notes.some((note) => note.includes("without explicit balance check"))).toBe(false);
  });
});
