import { describe, expect, it } from "vitest";

import { createPasteAnalysisAndWait, createSession, uniqueCodeSnippet } from "./setup/helpers";

describe("API integration - failure handling", () => {
  it("incomplete snippet is rejected at API boundary with stable 4xx code", async () => {
    const session = createSession({ ip: "198.51.100.50" });

    const malformed = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract Broken {",
      "  function run() external {",
      "    if (true) {"
    ].join("\n");

    const response = await session.postJson<{
      error?: { code: string; message: string };
    }>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code: malformed,
      chainId: 8453
    });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe("INCOMPLETE_SNIPPET");
  });

  it("scanner failure on complete snippet returns PARTIAL and preserves diagnostics", async () => {
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
        warnings: string[];
        scannerErrors: string[];
        partialReasons: string[];
      };
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    const slitherWarning = report.body.report.warnings.find((item) => item.startsWith("SLITHER_WARNING:"));
    const solcMissingWarning = report.body.report.warnings.includes("SLITHER_SKIPPED_SOLC_MISSING");
    const configuredSolcPath = process.env.SOLC_PATH?.trim();

    expect(report.status).toBe(200);
    expect(created.terminalStatus).toBe("PARTIAL");
    expect(report.body.report.partialReasons).toContain("PARTIAL_SCANNER_FAILURE");
    expect(report.body.report.scannerErrors.some((item) => item.startsWith("SLITHER_ERROR"))).toBe(false);

    if (configuredSolcPath) {
      expect(solcMissingWarning).toBe(false);
      expect(slitherWarning).toBeTruthy();
      expect(slitherWarning?.length ?? 0).toBeGreaterThan("SLITHER_WARNING:".length + 20);
    } else if (solcMissingWarning) {
      expect(slitherWarning).toBeUndefined();
    } else {
      expect(slitherWarning).toBeTruthy();
      expect(slitherWarning?.length ?? 0).toBeGreaterThan("SLITHER_WARNING:".length + 20);
    }
  });

  it("LLM-unavailable fallback still returns deterministic summary and terminal status", async () => {
    const session = createSession({ ip: "198.51.100.51" });

    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("LLMFallback"), 8453, 120_000);

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
    expect(["DONE_WITH_WARNINGS", "COMPLETED", "PARTIAL"]).toContain(created.terminalStatus);
    expect(report.body.report.executiveSummary.length).toBeGreaterThan(20);
  });

  it("pragma requiring newer compiler degrades to warning instead of failing pipeline", async () => {
    const session = createSession({ ip: "198.51.100.53" });

    const newerPragmaInput = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.28;",
      "contract NewerPragmaContract {",
      "  uint256 public x;",
      "  function set(uint256 value) external {",
      "    x = value;",
      "  }",
      "}"
    ].join("\n");

    const created = await createPasteAnalysisAndWait(session, newerPragmaInput);

    const report = await session.getJson<{
      report: {
        warnings: string[];
      };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(report.status).toBe(200);
    expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(created.terminalStatus);
    expect(
      report.body.report.warnings.every(
        (item) =>
          item === "SLITHER_SOLC_VERSION_UNRESOLVED" ||
          item === "SLITHER_SKIPPED_SOLC_MISSING" ||
          item.startsWith("SLITHER_WARNING:") ||
          item.startsWith("SLITHER_SOLC_VERSION_UNRESOLVED_DETAIL:")
      )
    ).toBe(true);
  });
});
