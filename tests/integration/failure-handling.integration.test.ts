import { describe, expect, it } from "vitest";

import { createPasteAnalysisAndWait, createSession, uniqueCodeSnippet } from "./setup/helpers";

describe("API integration - failure handling", () => {
  it("incomplete snippet is processed as DONE_WITH_WARNINGS with explicit reason code", async () => {
    const session = createSession({ ip: "198.51.100.50" });

    const malformed = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract Broken {",
      "  function run() external {",
      "    if (true) {"
    ].join("\n");

    const created = await createPasteAnalysisAndWait(session, malformed);

    const report = await session.getJson<{
      reportId: string;
      report: {
        scannerErrors: string[];
        partialReasons: string[];
      };
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(report.status).toBe(200);
    expect(created.terminalStatus).toBe("DONE_WITH_WARNINGS");
    expect(report.body.report.partialReasons).toContain("PARTIAL_SOLIDITY_INCOMPLETE");
    expect(report.body.report.scannerErrors.some((item) => item.startsWith("SLITHER_ERROR"))).toBe(false);
  });

  it("scanner failure on complete input is marked as PARTIAL_SCANNER_FAILURE", async () => {
    const session = createSession({ ip: "198.51.100.52" });

    const scannerFailureInput = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "import \"./MissingDependency.sol\";",
      "contract ValidButUnresolvable {",
      "  function run() external {}",
      "}"
    ].join("\n");

    const created = await createPasteAnalysisAndWait(session, scannerFailureInput);

    const report = await session.getJson<{
      reportId: string;
      report: {
        scannerErrors: string[];
        partialReasons: string[];
      };
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(report.status).toBe(200);
    expect(created.terminalStatus).toBe("PARTIAL");
    expect(report.body.report.partialReasons).toContain("PARTIAL_SCANNER_FAILURE");
    expect(report.body.report.scannerErrors.some((item) => item.startsWith("SLITHER_ERROR"))).toBe(true);
  });

  it("LLM-unavailable fallback still returns deterministic summary and terminal status", async () => {
    const session = createSession({ ip: "198.51.100.51" });

    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("LLMFallback"));

    const report = await session.getJson<{
      report: {
        executiveSummary: string;
      };
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(report.status).toBe(200);
    expect(["PARTIAL", "COMPLETED"]).toContain(created.terminalStatus);
    expect(report.body.report.executiveSummary.length).toBeGreaterThan(20);
  });
});