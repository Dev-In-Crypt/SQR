import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { aderynIssuesToFindings, runAderyn, type ScannerRuntime } from "@/lib/scanner";
import type { SourceBundle } from "@/lib/types";

const fixture = JSON.parse(
  await readFile(resolve(process.cwd(), "tests/fixtures/aderyn-sample.json"), "utf8")
) as Parameters<typeof aderynIssuesToFindings>[0];

function bundle(): SourceBundle {
  const files = [{ path: "PastedSnippet.sol", content: "pragma solidity ^0.8.20; contract C {}" }];
  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files,
    lineCount: 1,
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: "0xtest"
  };
}

describe("aderynIssuesToFindings", () => {
  it("maps high and low issues into normalized findings", () => {
    const findings = aderynIssuesToFindings(fixture);
    expect(findings).toHaveLength(3 + 4); // issue_count in the fixture

    const high = findings.filter((f) => f.severity === "HIGH");
    const low = findings.filter((f) => f.severity === "LOW");
    expect(high).toHaveLength(3);
    expect(low).toHaveLength(4);

    const reentrancy = findings.find((f) => f.title === "reentrancy-state-change");
    expect(reentrancy).toBeDefined();
    expect(reentrancy!.severity).toBe("HIGH");
    expect(reentrancy!.confidence).toBe(75);
    expect(reentrancy!.evidence[0].filePath).toBe("src/Vault.sol");
    expect(reentrancy!.evidence[0].line).toBe(7);
    expect(reentrancy!.whyItMatters.length).toBeGreaterThan(0);
  });

  it("produces stable fingerprints (idempotent mapping)", () => {
    const a = aderynIssuesToFindings(fixture).map((f) => f.fingerprint);
    const b = aderynIssuesToFindings(fixture).map((f) => f.fingerprint);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // no fingerprint collisions across distinct issues
  });

  it("tolerates empty / missing groups", () => {
    expect(aderynIssuesToFindings({})).toHaveLength(0);
    expect(aderynIssuesToFindings({ high_issues: { issues: [] }, low_issues: {} })).toHaveLength(0);
  });
});

function runtimeWriting(json: unknown): ScannerRuntime {
  return {
    async runCommand(_command, args) {
      // runAderyn passes ["." , "--output", reportPath]
      const outIdx = args.indexOf("--output");
      if (outIdx >= 0 && args[outIdx + 1]) {
        await writeFile(args[outIdx + 1], JSON.stringify(json), "utf8");
      }
      return { code: 0, stdout: "", stderr: "" };
    }
  };
}

describe("runAderyn", () => {
  it("parses the report the aderyn command writes", async () => {
    const out = await runAderyn({ sourceBundle: bundle(), runtime: runtimeWriting(fixture), aderynRequired: false });
    expect(out.scannerErrors).toHaveLength(0);
    expect(out.findings).toHaveLength(7);
    expect(out.findings.some((f) => f.title === "weak-randomness")).toBe(true);
  });

  it("degrades to a warning when no report is produced (aderynRequired=false)", async () => {
    const runtime: ScannerRuntime = {
      async runCommand() {
        return { code: 1, stdout: "", stderr: "boom" };
      }
    };
    const out = await runAderyn({ sourceBundle: bundle(), runtime, aderynRequired: false });
    expect(out.findings).toHaveLength(0);
    expect(out.warnings.some((w) => w.startsWith("ADERYN_WARNING:"))).toBe(true);
    expect(out.scannerErrors).toHaveLength(0);
  });

  it("surfaces an error when aderyn is required and fails", async () => {
    const runtime: ScannerRuntime = {
      async runCommand() {
        return { code: 1, stdout: "", stderr: "boom" };
      }
    };
    const out = await runAderyn({ sourceBundle: bundle(), runtime, aderynRequired: true });
    expect(out.scannerErrors.some((e) => e.startsWith("ADERYN_ERROR:"))).toBe(true);
  });
});
