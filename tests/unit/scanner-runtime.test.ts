import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config } from "@/lib/config";
import { runStaticScan, type ScannerRuntime } from "@/lib/scanner";
import type { SourceBundle } from "@/lib/types";

interface CommandCall {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

interface RuntimeHarness {
  calls: CommandCall[];
  runtime: ScannerRuntime;
}

function createRuntimeHarness(
  handler: (call: CommandCall) => Promise<{ code: number | null; stdout: string; stderr: string }>
): RuntimeHarness {
  const calls: CommandCall[] = [];

  return {
    calls,
    runtime: {
      async runCommand(command, args, options) {
        const call = {
          command,
          args,
          cwd: options.cwd,
          env: options.env
        };
        calls.push(call);
        return await handler(call);
      }
    }
  };
}

function makeSourceBundle(params: {
  inputType: SourceBundle["inputType"];
  path?: string;
  content?: string;
  files?: Array<{ path: string; content: string }>;
}): SourceBundle {
  const files = params.files ?? [{ path: params.path ?? "PastedSnippet.sol", content: params.content ?? "" }];

  return {
    inputType: params.inputType,
    chainId: 8453,
    files,
    lineCount: files.reduce((total, file) => total + file.content.split("\n").length, 0),
    isVerifiedSource: params.inputType === "BASE_ADDRESS",
    sourceMeta: {},
    sourceHash: "0xunit-test-hash"
  };
}

describe("scanner runtime modes", () => {
  const originalSolcPath = config.SOLC_PATH;
  const originalEnableAutoResolve = config.ENABLE_SOLC_AUTO_RESOLVE;
  const originalSolcVersionManager = config.SOLC_VERSION_MANAGER;
  const originalSolcFallbackPath = config.SOLC_FALLBACK_PATH;
  const originalEnableFoundryCheck = config.ENABLE_FOUNDRY_CHECK;
  const originalFoundryEnabled = config.foundryEnabled;

  beforeEach(() => {
    config.SOLC_PATH = undefined;
    config.ENABLE_SOLC_AUTO_RESOLVE = "false";
    config.SOLC_VERSION_MANAGER = "";
    config.SOLC_FALLBACK_PATH = undefined;
    config.ENABLE_FOUNDRY_CHECK = "false";
    config.foundryEnabled = false;
  });

  afterEach(() => {
    config.SOLC_PATH = originalSolcPath;
    config.ENABLE_SOLC_AUTO_RESOLVE = originalEnableAutoResolve;
    config.SOLC_VERSION_MANAGER = originalSolcVersionManager;
    config.SOLC_FALLBACK_PATH = originalSolcFallbackPath;
    config.ENABLE_FOUNDRY_CHECK = originalEnableFoundryCheck;
    config.foundryEnabled = originalFoundryEnabled;
  });

  it("snippet mode uses standalone solc runtime and ignores foundry mode", async () => {
    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 0, stdout: "solc, the solidity compiler", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      scanMode: "snippet",
      slitherRequired: false,
      runtime: harness.runtime
    });

    const slitherCall = harness.calls.find((item) => item.command === "slither");

    expect(slitherCall).toBeTruthy();
    expect(slitherCall?.args).toContain("--compile-force-framework");
    expect(slitherCall?.args).toContain("solc");
    expect(slitherCall?.args).not.toContain("foundry");
    const solcArgIndex = slitherCall?.args.indexOf("--solc") ?? -1;
    expect(solcArgIndex).toBeGreaterThan(-1);
    expect(slitherCall?.args[solcArgIndex + 1]).toBe("solc");
    expect(slitherCall?.cwd).not.toBe(resolve(process.cwd()));
    expect(slitherCall?.env?.SOLC).toBe("solc");
    expect(result.scannerErrors).toEqual([]);
  });

  it("standalone mode skips slither when solc is missing", async () => {
    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 1, stdout: "", stderr: "solc missing" };
      }

      return { code: 1, stdout: "", stderr: "slither should not be called" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      scanMode: "snippet",
      slitherRequired: false,
      runtime: harness.runtime
    });

    expect(result.scannerErrors).toEqual([]);
    expect(result.warnings).toContain("SLITHER_SKIPPED_SOLC_MISSING");
    expect(result.warnings.some((item) => item.includes("SLITHER_SKIPPED_SOLC_MISSING_DETAIL"))).toBe(true);
    expect(harness.calls.some((item) => item.command === "slither")).toBe(false);
  });

  it("SOLC_PATH with missing binary skips slither and reports attempted path", async () => {
    config.SOLC_PATH = resolve(process.cwd(), "tests", "fixtures", "missing-solc.exe");

    const harness = createRuntimeHarness(async () => {
      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      scanMode: "snippet",
      slitherRequired: false,
      runtime: harness.runtime
    });

    expect(result.warnings).toContain("SLITHER_SKIPPED_SOLC_MISSING");
    expect(
      result.warnings.some(
        (item) => item.startsWith("SLITHER_SKIPPED_SOLC_MISSING_DETAIL:") && item.includes(config.SOLC_PATH ?? "")
      )
    ).toBe(true);
    expect(harness.calls.length).toBe(0);
  });

  it("SOLC_PATH with a valid binary path is used for preflight and Slither env", async () => {
    config.SOLC_PATH = process.execPath;

    const harness = createRuntimeHarness(async (call) => {
      if (call.command === process.execPath) {
        return { code: 0, stdout: "v20.0.0", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      scanMode: "snippet",
      slitherRequired: false,
      runtime: harness.runtime
    });

    const preflightCall = harness.calls.find((item) => item.command === process.execPath);
    const slitherCall = harness.calls.find((item) => item.command === "slither");

    expect(preflightCall?.args).toEqual(["--version"]);
    const solcArgIndex = slitherCall?.args.indexOf("--solc") ?? -1;
    expect(solcArgIndex).toBeGreaterThan(-1);
    expect(slitherCall?.args[solcArgIndex + 1]).toBe(process.execPath);
    expect(slitherCall?.env?.SOLC).toBe(process.execPath);
    expect(result.warnings).not.toContain("SLITHER_SKIPPED_SOLC_MISSING");
  });

  it("non-zero slither exit captures truncated diagnostics", async () => {
    const largeError = "E".repeat(6000);

    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 0, stdout: "solc ok", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(
          outputPath,
          JSON.stringify({ success: false, error: largeError, results: { detectors: [] } }),
          "utf8"
        );

        return {
          code: 1,
          stdout: "stdout diagnostics",
          stderr: "stderr diagnostics"
        };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      scanMode: "snippet",
      slitherRequired: false,
      runtime: harness.runtime
    });

    const slitherWarning = result.warnings.find((item) => item.startsWith("SLITHER_WARNING:"));

    expect(slitherWarning).toBeTruthy();
    expect(slitherWarning?.length ?? 0).toBeLessThanOrEqual(3200);
    expect(slitherWarning).toContain("outputError=");
    expect(/outputError=|stderr=|stdout=/.test(slitherWarning || "")).toBe(true);
    expect(result.scannerErrors).toEqual([]);
  });

  it("project mode uses foundry only when target file is inside a foundry root", async () => {
    const localContractPath = "contracts/ReceiptRegistry.sol";
    const localContractContent = await readFile(localContractPath, "utf8");

    const foundryHarness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 1, stdout: "", stderr: "solc should not run in foundry mode" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    await runStaticScan(
      makeSourceBundle({
        inputType: "BASE_ADDRESS",
        path: localContractPath,
        content: localContractContent
      }),
      {
        scanMode: "project",
        slitherRequired: true,
        runtime: foundryHarness.runtime
      }
    );

    const foundrySlitherCall = foundryHarness.calls.find((item) => item.command === "slither");
    expect(foundrySlitherCall).toBeTruthy();
    expect(foundrySlitherCall?.args).toContain("foundry");
    expect(foundrySlitherCall?.cwd).toBe(resolve(process.cwd()));
    expect(foundryHarness.calls.some((item) => item.command === "solc")).toBe(false);

    const standaloneHarness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 0, stdout: "solc ok", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    await runStaticScan(
      makeSourceBundle({
        inputType: "BASE_ADDRESS",
        path: "RemoteContract.sol",
        content:
          "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract Remote { function run() external {} }"
      }),
      {
        scanMode: "project",
        slitherRequired: true,
        runtime: standaloneHarness.runtime
      }
    );

    const standaloneSlitherCall = standaloneHarness.calls.find((item) => item.command === "slither");
    expect(standaloneHarness.calls.some((item) => item.command === "solc")).toBe(true);
    expect(standaloneSlitherCall?.args).toContain("solc");
  });

  it("standalone mode forwards auto-derived remappings for alias imports", async () => {
    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 0, stdout: "solc ok", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "BASE_ADDRESS",
      files: [
        {
          path: "src/ClankerToken.sol",
          content: [
            "// SPDX-License-Identifier: MIT",
            "pragma solidity ^0.8.28;",
            'import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";',
            'import {Predeploys} from "@contracts-bedrock/src/libraries/Predeploys.sol";',
            "contract ClankerToken is ERC20 {",
            "  constructor() ERC20('T','T') {}",
            "}"
          ].join("\n")
        },
        {
          path: "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol",
          content: [
            "// SPDX-License-Identifier: MIT",
            "pragma solidity ^0.8.28;",
            "contract ERC20 {",
            "  constructor(string memory, string memory) {}",
            "}"
          ].join("\n")
        },
        {
          path: "lib/optimism/packages/contracts-bedrock/src/libraries/Predeploys.sol",
          content: [
            "// SPDX-License-Identifier: MIT",
            "pragma solidity ^0.8.28;",
            "library Predeploys {",
            "  address internal constant PLACEHOLDER = address(0);",
            "}"
          ].join("\n")
        }
      ]
    });

    const result = await runStaticScan(bundle, {
      scanMode: "project",
      slitherRequired: true,
      runtime: harness.runtime
    });

    const slitherCall = harness.calls.find((item) => item.command === "slither");
    expect(slitherCall).toBeTruthy();
    expect(slitherCall?.args).toContain("--solc-remaps");
    const remapValue =
      slitherCall?.args[(slitherCall.args.indexOf("--solc-remaps") ?? -1) + 1] ?? "";
    expect(remapValue).toContain("@openzeppelin/=lib/openzeppelin-contracts/");
    expect(remapValue).toContain("@contracts-bedrock/=lib/optimism/packages/contracts-bedrock/");
    expect(result.scannerErrors).toEqual([]);
  });

  it("standalone mode does not inject remappings without a matching bundle path", async () => {
    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "solc") {
        return { code: 0, stdout: "solc ok", stderr: "" };
      }

      if (call.command === "slither") {
        const jsonArgIndex = call.args.indexOf("--json");
        const outputPath = call.args[jsonArgIndex + 1];
        await writeFile(outputPath, JSON.stringify({ success: true, results: { detectors: [] } }), "utf8");
        return { code: 0, stdout: "", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "BASE_ADDRESS",
      files: [
        {
          path: "src/NoRemap.sol",
          content: [
            "// SPDX-License-Identifier: MIT",
            "pragma solidity ^0.8.28;",
            'import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";',
            "contract NoRemap {}"
          ].join("\n")
        }
      ]
    });

    await runStaticScan(bundle, {
      scanMode: "project",
      slitherRequired: true,
      runtime: harness.runtime
    });

    const slitherCall = harness.calls.find((item) => item.command === "slither");
    const remapFlagCount = slitherCall?.args.filter((item) => item === "--solc-remaps").length ?? 0;

    expect(slitherCall).toBeTruthy();
    expect(remapFlagCount).toBe(0);
  });

  it("runs forge build for snippet scans when foundry checks are enabled", async () => {
    config.ENABLE_FOUNDRY_CHECK = "true";
    config.foundryEnabled = true;

    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "forge") {
        return { code: 0, stdout: "forge build ok", stderr: "" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "PASTE_CODE",
      path: "PastedSnippet.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      skipSlither: true,
      scanMode: "snippet",
      forgeRequired: true,
      runtime: harness.runtime
    });

    const forgeCall = harness.calls.find((item) => item.command === "forge");
    expect(forgeCall).toBeTruthy();
    expect(forgeCall?.args).toEqual(["build"]);
    expect(result.scannerErrors).toEqual([]);
  });

  it("reports forge failures as scanner errors when required", async () => {
    config.ENABLE_FOUNDRY_CHECK = "true";
    config.foundryEnabled = true;

    const harness = createRuntimeHarness(async (call) => {
      if (call.command === "forge") {
        return { code: 1, stdout: "", stderr: "ParserError: expected ';'" };
      }

      return { code: 1, stdout: "", stderr: "unexpected command" };
    });

    const bundle = makeSourceBundle({
      inputType: "BASE_ADDRESS",
      path: "Remote.sol",
      content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function run() external {} }"
    });

    const result = await runStaticScan(bundle, {
      skipSlither: true,
      scanMode: "project",
      forgeRequired: true,
      runtime: harness.runtime
    });

    expect(result.scannerErrors.some((item) => item.startsWith("FOUNDRY_ERROR:"))).toBe(true);
  });
});
