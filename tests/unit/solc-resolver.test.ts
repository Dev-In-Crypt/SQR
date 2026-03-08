import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config } from "@/lib/config";
import { resolveSolcRuntimeForSource, type SolcCommandResult } from "@/lib/solc-resolver";
import type { SourceBundle } from "@/lib/types";

interface CommandCall {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

function makeBundle(pragma: string): SourceBundle {
  const content = [
    "// SPDX-License-Identifier: MIT",
    `pragma solidity ${pragma};`,
    "contract ResolverTest { function run() external {} }"
  ].join("\n");

  return {
    inputType: "PASTE_CODE",
    chainId: 8453,
    files: [{ path: "PastedSnippet.sol", content }],
    lineCount: content.split("\n").length,
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: "resolver-test"
  };
}

describe("solc resolver", () => {
  const original = {
    SOLC_PATH: config.SOLC_PATH,
    SOLC_FALLBACK_PATH: config.SOLC_FALLBACK_PATH,
    ENABLE_SOLC_AUTO_RESOLVE: config.ENABLE_SOLC_AUTO_RESOLVE,
    SOLC_VERSION_MANAGER: config.SOLC_VERSION_MANAGER
  };

  beforeEach(() => {
    config.SOLC_PATH = undefined;
    config.SOLC_FALLBACK_PATH = undefined;
    config.ENABLE_SOLC_AUTO_RESOLVE = "true";
    config.SOLC_VERSION_MANAGER = "solc-select";
  });

  afterEach(() => {
    config.SOLC_PATH = original.SOLC_PATH;
    config.SOLC_FALLBACK_PATH = original.SOLC_FALLBACK_PATH;
    config.ENABLE_SOLC_AUTO_RESOLVE = original.ENABLE_SOLC_AUTO_RESOLVE;
    config.SOLC_VERSION_MANAGER = original.SOLC_VERSION_MANAGER;
  });

  it("uses currently installed compatible version", async () => {
    const calls: CommandCall[] = [];
    const runtime = async (command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, cwd: options.cwd, env: options.env });
      const result: SolcCommandResult = {
        code: 0,
        stdout: "Version: 0.8.24+commit.abc",
        stderr: ""
      };
      return result;
    };

    const resolved = await resolveSolcRuntimeForSource({
      sourceBundle: makeBundle("^0.8.20"),
      cwd: process.cwd(),
      runCommand: runtime
    });

    expect(resolved.resolutionStrategy).toBe("path_solc");
    expect(resolved.resolvedSolcVersion).toBe("0.8.24");
    expect(calls[0]?.command).toBe("solc");
  });

  it("selects compatible version via solc-select when default is incompatible", async () => {
    const runtime = async (command: string, args: string[]) => {
      if (command === "solc" && args[0] === "--version") {
        return {
          code: 0,
          stdout: "Version: 0.8.24+commit.abc",
          stderr: ""
        } as SolcCommandResult;
      }

      if (command === "solc-select") {
        return {
          code: 0,
          stdout: "0.8.24\n0.8.28 (current)",
          stderr: ""
        } as SolcCommandResult;
      }

      return {
        code: 1,
        stdout: "",
        stderr: "unexpected"
      } as SolcCommandResult;
    };

    const resolved = await resolveSolcRuntimeForSource({
      sourceBundle: makeBundle("^0.8.28"),
      cwd: process.cwd(),
      runCommand: runtime
    });

    expect(resolved.resolutionStrategy).toBe("solc_select_version");
    expect(resolved.resolvedSolcVersion).toBe("0.8.28");
    expect(resolved.command).toBe("solc");
    expect(resolved.commandEnv?.SOLC_VERSION).toBe("0.8.28");
  });

  it("returns unresolved warning context when pragma cannot be satisfied", async () => {
    const runtime = async (command: string) => {
      if (command === "solc") {
        return {
          code: 0,
          stdout: "Version: 0.8.24+commit.abc",
          stderr: ""
        } as SolcCommandResult;
      }

      return {
        code: 0,
        stdout: "0.8.24\n0.8.25",
        stderr: ""
      } as SolcCommandResult;
    };

    const resolved = await resolveSolcRuntimeForSource({
      sourceBundle: makeBundle("^0.8.28"),
      cwd: process.cwd(),
      runCommand: runtime
    });

    expect(resolved.resolutionStrategy).toBe("solc_select_unresolved");
    expect(resolved.unresolvedPragmaConstraint).toBe(true);
    expect(resolved.failureReason).toBe("SOLC_SELECT_NO_COMPATIBLE_VERSION");
    expect(resolved.command).toBe("solc");
  });

  it("falls back to fixed behavior when auto resolve disabled", async () => {
    config.ENABLE_SOLC_AUTO_RESOLVE = "false";
    config.SOLC_VERSION_MANAGER = "";

    const calls: CommandCall[] = [];
    const runtime = async (command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, cwd: options.cwd, env: options.env });
      return {
        code: 0,
        stdout: "Version: 0.8.24+commit.abc",
        stderr: ""
      } as SolcCommandResult;
    };

    const resolved = await resolveSolcRuntimeForSource({
      sourceBundle: makeBundle("^0.8.28"),
      cwd: process.cwd(),
      runCommand: runtime
    });

    expect(resolved.resolutionStrategy).toBe("path_solc");
    expect(resolved.unresolvedPragmaConstraint).toBe(false);
    expect(calls.length).toBe(0);
  });
});
