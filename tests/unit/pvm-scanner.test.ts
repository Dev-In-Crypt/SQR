import { describe, expect, it } from "vitest";

import { runPvmScan, type PvmScannerRuntime } from "@/lib/pvm-scanner";
import type { SourceBundle } from "@/lib/types";

function makeBundle(content: string): SourceBundle {
  return {
    inputType: "PASTE_CODE",
    chainId: 420420417,
    files: [{ path: "PastedSnippet.sol", content }],
    lineCount: content.split("\n").length,
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: "0xunit-test-hash"
  };
}

function createRuntime(output: {
  code: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}): PvmScannerRuntime {
  return {
    async runCommand() {
      return output;
    }
  };
}

describe("runPvmScan", () => {
  it("collects compiler and heuristic warnings for Polkadot PVM checks", async () => {
    const oversizedBytecode = "0x" + "aa".repeat(25000);
    const runtimeOutput = {
      code: 0,
      stdout: JSON.stringify({
        contracts: {
          "PastedSnippet.sol": {
            PastedSnippet: {
              evm: {
                bytecode: {
                  object: oversizedBytecode
                }
              }
            }
          }
        },
        errors: [
          {
            severity: "warning",
            type: "Warning",
            message: "storage deposit may increase due to state growth"
          }
        ]
      }),
      stderr: ""
    };

    const source = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.24;",
      "contract PastedSnippet {",
      "  function run() external {",
      "    selfdestruct(payable(msg.sender));",
      "    assembly { push0 }",
      "  }",
      "}"
    ].join("\n");

    const result = await runPvmScan(makeBundle(source), {
      runtime: createRuntime(runtimeOutput)
    });

    const warningCodes = result.warnings.map((item) => item.code);

    expect(result.status).toBe("COMPLETED");
    expect(result.errors).toEqual([]);
    expect(result.bytecodeBytes).toBe(25000);
    expect(warningCodes).toContain("PVM_STORAGE_DEPOSIT_WARNING");
    expect(warningCodes).toContain("PVM_UNSUPPORTED_OPCODE_SELFDESTRUCT");
    expect(warningCodes).toContain("PVM_UNSUPPORTED_OPCODE_PUSH0");
    expect(warningCodes).toContain("PVM_BYTECODE_LIMIT_EXCEEDED");
  });

  it("returns explicit error when resolc binary is missing", async () => {
    const result = await runPvmScan(makeBundle("pragma solidity ^0.8.24; contract A {}"), {
      runtime: createRuntime({
        code: null,
        stdout: "",
        stderr: "",
        errorMessage: "spawn resolc ENOENT"
      })
    });

    expect(result.status).toBe("FAILED");
    expect(result.errors.some((item) => item.startsWith("PVM_COMPILER_NOT_FOUND"))).toBe(true);
  });

  it("surfaces compilation failures from compiler error diagnostics", async () => {
    const result = await runPvmScan(makeBundle("pragma solidity ^0.8.24; contract A {"), {
      runtime: createRuntime({
        code: 1,
        stdout: JSON.stringify({
          errors: [
            {
              severity: "error",
              message: "ParserError: Expected ';' but got '<EOF>'"
            }
          ]
        }),
        stderr: "compiler exited with errors"
      })
    });

    expect(result.status).toBe("FAILED");
    expect(result.errors).toContain("PVM_COMPILATION_FAILED");
    expect(result.errors.some((item) => item.startsWith("PVM_COMPILATION_ERROR:"))).toBe(true);
  });
});
