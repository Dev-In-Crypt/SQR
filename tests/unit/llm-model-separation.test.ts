import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "@/lib/config";
import { generateAIAuditFindings, generateExecutiveSummary } from "@/lib/llm";
import type { Finding, SourceBundle } from "@/lib/types";

function makeFinding(): Finding {
  return {
    id: "f-1",
    title: "External call before state update",
    severity: "MEDIUM",
    evidence: [{ filePath: "PastedSnippet.sol", line: 12, excerpt: "target.call(data);" }],
    whyItMatters: "Can allow reentrancy when state mutates after external call.",
    fixDirection: "Move state updates before external calls and add guards where needed.",
    confidence: 80,
    needsManualCheck: false,
    fingerprint: "fp-1"
  };
}

function makeBundle(): SourceBundle {
  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files: [
      {
        path: "PastedSnippet.sol",
        content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { }"
      }
    ],
    lineCount: 3,
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: "source-hash"
  };
}

describe("LLM model separation", () => {
  const original = {
    OPENAI_API_KEY: config.OPENAI_API_KEY,
    OPENAI_GENERAL_MODEL: config.OPENAI_GENERAL_MODEL,
    OPENAI_AUDIT_MODEL: config.OPENAI_AUDIT_MODEL,
    OPENAI_TEMPERATURE: config.OPENAI_TEMPERATURE
  };

  beforeEach(() => {
    config.OPENAI_API_KEY = "test-key";
    config.OPENAI_GENERAL_MODEL = "gpt-4.1-mini";
    config.OPENAI_AUDIT_MODEL = "gpt-4.1";
    config.OPENAI_TEMPERATURE = 0;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    config.OPENAI_API_KEY = original.OPENAI_API_KEY;
    config.OPENAI_GENERAL_MODEL = original.OPENAI_GENERAL_MODEL;
    config.OPENAI_AUDIT_MODEL = original.OPENAI_AUDIT_MODEL;
    config.OPENAI_TEMPERATURE = original.OPENAI_TEMPERATURE;
    vi.restoreAllMocks();
  });

  it("uses OPENAI_GENERAL_MODEL for executive summaries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Summary response" } }] }), { status: 200 })
      );

    await generateExecutiveSummary({
      findings: [makeFinding()],
      partialReasons: []
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as { model: string };
    expect(body.model).toBe("gpt-4.1-mini");
  });

  it("uses OPENAI_AUDIT_MODEL for smart contract AI audit", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 }));

    await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: [],
      scannerErrors: [],
      partialReasons: []
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as { model: string };
    expect(body.model).toBe("gpt-4.1");
  });

  it("falls back to OPENAI_GENERAL_MODEL when OPENAI_AUDIT_MODEL is unset", async () => {
    config.OPENAI_AUDIT_MODEL = "";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 }));

    await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: [],
      scannerErrors: [],
      partialReasons: []
    });

    const [, requestInit] = fetchSpy.mock.calls[0] || [];
    const body = JSON.parse(String((requestInit as RequestInit).body)) as { model: string };
    expect(body.model).toBe("gpt-4.1-mini");
  });

  it("keeps audit stage fail-closed and returns [] on API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream error", { status: 500 }));

    const findings = await generateAIAuditFindings({
      sourceBundle: makeBundle(),
      scannerFindings: [makeFinding()],
      warnings: [],
      scannerErrors: [],
      partialReasons: []
    });

    expect(findings).toEqual([]);
  });
});
