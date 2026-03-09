import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as contractStructure from "@/lib/contract-structure";
import { config } from "@/lib/config";
import { generateAIAuditFindings } from "@/lib/llm";
import type { Finding, SourceBundle } from "@/lib/types";

function makeFinding(): Finding {
  return {
    id: "f-ctx-1",
    title: "Escrow payout ordering",
    severity: "MEDIUM",
    evidence: [{ filePath: "Escrow.sol", line: 12, excerpt: "token.transfer(...)" }],
    whyItMatters: "Payout ordering may impact accounting correctness.",
    fixDirection: "Reconcile balances before and after token movement.",
    confidence: 75,
    needsManualCheck: false,
    fingerprint: "fp-ctx-1"
  };
}

function makeBundle(): SourceBundle {
  const content = [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "contract Vault {",
    "  address public owner;",
    "  IERC20 public token;",
    "  modifier onlyOwner() { require(msg.sender == owner, 'only owner'); _; }",
    "  function payout(address to, uint256 amount) external onlyOwner {",
    "    token.transfer(to, amount);",
    "  }",
    "}"
  ].join("\n");

  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files: [{ path: "Escrow.sol", content }],
    lineCount: content.split("\n").length,
    isVerifiedSource: false,
    sourceMeta: {
      solidityPragma: "^0.8.20",
      solidityPragmaFilePath: "Escrow.sol"
    },
    sourceHash: "structured-context-source"
  };
}

describe("structured audit context flag", () => {
  const original = {
    OPENAI_API_KEY: config.OPENAI_API_KEY,
    structuredAuditContextEnabled: config.structuredAuditContextEnabled,
    OPENAI_AUDIT_MODEL: config.OPENAI_AUDIT_MODEL,
    OPENAI_GENERAL_MODEL: config.OPENAI_GENERAL_MODEL
  };

  beforeEach(() => {
    config.OPENAI_API_KEY = "test-key";
    config.OPENAI_GENERAL_MODEL = "gpt-4.1-mini";
    config.OPENAI_AUDIT_MODEL = "gpt-4.1";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    config.OPENAI_API_KEY = original.OPENAI_API_KEY;
    config.structuredAuditContextEnabled = original.structuredAuditContextEnabled;
    config.OPENAI_AUDIT_MODEL = original.OPENAI_AUDIT_MODEL;
    config.OPENAI_GENERAL_MODEL = original.OPENAI_GENERAL_MODEL;
    vi.restoreAllMocks();
  });

  it("flag off uses old behavior without structured context", async () => {
    config.structuredAuditContextEnabled = false;

    const buildSpy = vi.spyOn(contractStructure, "buildStructuredAuditContext");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 }));

    await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: ["SAMPLE_WARNING"],
      scannerErrors: [],
      partialReasons: []
    });

    expect(buildSpy).not.toHaveBeenCalled();
    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages.find((item) => item.role === "user")?.content || "{}") as {
      input?: Record<string, unknown>;
    };

    expect(userPayload.input).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(userPayload.input || {}, "structuredAuditContext")).toBe(false);
  });

  it("flag on includes structured context in AI audit input", async () => {
    config.structuredAuditContextEnabled = true;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 }));

    await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: ["SAMPLE_WARNING"],
      scannerErrors: [],
      partialReasons: []
    });

    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages.find((item) => item.role === "user")?.content || "{}") as {
      input?: {
        structuredAuditContext?: {
          contractNames?: string[];
          extractionSignals?: {
            fundControlFunctionCount?: number;
          };
          keyFundControlFunctions?: Array<{ functionName: string }>;
        };
      };
    };

    expect(userPayload.input?.structuredAuditContext).toBeTruthy();
    expect(userPayload.input?.structuredAuditContext?.contractNames).toContain("Vault");
    expect(userPayload.input?.structuredAuditContext?.extractionSignals?.fundControlFunctionCount).toBeGreaterThan(0);
    expect(
      userPayload.input?.structuredAuditContext?.keyFundControlFunctions?.some(
        (entry) => entry.functionName === "payout"
      )
    ).toBe(true);
  });

  it("extraction failure falls back cleanly to legacy AI audit payload", async () => {
    config.structuredAuditContextEnabled = true;

    vi.spyOn(contractStructure, "buildStructuredAuditContext").mockImplementation(() => {
      throw new Error("structured context extraction failed");
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 }));

    const findings = await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: ["SAMPLE_WARNING"],
      scannerErrors: [],
      partialReasons: []
    });

    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages.find((item) => item.role === "user")?.content || "{}") as {
      input?: Record<string, unknown>;
    };

    expect(findings).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(userPayload.input || {}, "structuredAuditContext")).toBe(false);
  });
});
