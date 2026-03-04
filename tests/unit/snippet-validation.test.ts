import { describe, expect, it } from "vitest";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";

describe("snippet completeness", () => {
  it("marks full contract as complete", () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "",
      "contract Full {",
      "  uint256 public x;",
      "}"
    ].join("\n");

    const result = analyzeSnippetCompleteness(code);

    expect(result.isComplete).toBe(true);
    expect(result.braceBalance).toBe(0);
    expect(result.contractEndFound).toBe(true);
    expect(result.reasonCodes).toEqual([]);
  });

  it("marks unbalanced braces as incomplete", () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract Broken {",
      "  function run() external {",
      "    if (true) {"
    ].join("\n");

    const result = analyzeSnippetCompleteness(code);

    expect(result.isComplete).toBe(false);
    expect(result.braceBalance).not.toBe(0);
    expect(result.reasonCodes).toContain("PARTIAL_SOLIDITY_INCOMPLETE");
  });

  it("marks balanced non-contract snippet as incomplete", () => {
    const code = [
      "function run() external {",
      "  uint256 x = 1;",
      "}"
    ].join("\n");

    const result = analyzeSnippetCompleteness(code);

    expect(result.isComplete).toBe(false);
    expect(result.braceBalance).toBe(0);
    expect(result.contractEndFound).toBe(false);
    expect(result.reasonCodes).toContain("PARTIAL_SOLIDITY_INCOMPLETE");
  });

  it("ignores braces inside comments and strings", () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract WithComments {",
      "  string constant A = \"{test}\";",
      "  function run() external {",
      "    // }",
      "    /* { */",
      "  }",
      "}"
    ].join("\n");

    const result = analyzeSnippetCompleteness(code);

    expect(result.isComplete).toBe(true);
    expect(result.braceBalance).toBe(0);
    expect(result.contractEndFound).toBe(true);
  });
});