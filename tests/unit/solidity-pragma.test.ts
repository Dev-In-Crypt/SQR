import { describe, expect, it } from "vitest";

import {
  extractSolidityPragmaFromSource,
  isVersionCompatibleWithConstraint,
  parseSolidityPragmaExpression,
  parseSolidityVersion
} from "@/lib/solidity-pragma";

describe("solidity pragma parsing", () => {
  it("extracts simple caret pragma", () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract A { }"
    ].join("\n");

    const parsed = extractSolidityPragmaFromSource(code);
    expect(parsed?.expression).toBe("^0.8.20");
    expect(parsed?.constraint?.kind).toBe("caret");
  });

  it("extracts range pragma", () => {
    const code = [
      "pragma solidity >=0.8.19 <0.9.0;",
      "contract A { }"
    ].join("\n");

    const parsed = extractSolidityPragmaFromSource(code);
    expect(parsed?.expression).toBe(">=0.8.19 <0.9.0");
    expect(parsed?.constraint?.kind).toBe("range");
  });

  it("ignores commented pragma lines", () => {
    const code = [
      "// pragma solidity ^0.8.28;",
      "/* pragma solidity ^0.8.27; */",
      "pragma solidity 0.8.24;",
      "contract A { }"
    ].join("\n");

    const parsed = extractSolidityPragmaFromSource(code);
    expect(parsed?.expression).toBe("0.8.24");
    expect(parsed?.constraint?.kind).toBe("exact");
  });

  it("marks unsupported pragma expression as unresolved", () => {
    const parsed = parseSolidityPragmaExpression(">=0.7.6 <=0.8.24");
    expect(parsed.constraint).toBeNull();
    expect(parsed.failureReason).toBe("UNSUPPORTED_PRAGMA_EXPRESSION");
  });

  it("parses exact pragma with equals prefix", () => {
    const parsed = parseSolidityPragmaExpression("=0.7.6");
    expect(parsed.constraint?.kind).toBe("exact");

    const version = parseSolidityVersion("0.7.6");
    expect(version).toBeTruthy();
    expect(isVersionCompatibleWithConstraint(version!, parsed.constraint!)).toBe(true);
  });

  it("checks compatibility for caret constraints", () => {
    const caret = parseSolidityPragmaExpression("^0.8.20");
    const v824 = parseSolidityVersion("0.8.24");
    const v900 = parseSolidityVersion("0.9.0");

    expect(caret.constraint).toBeTruthy();
    expect(v824).toBeTruthy();
    expect(v900).toBeTruthy();

    expect(isVersionCompatibleWithConstraint(v824!, caret.constraint!)).toBe(true);
    expect(isVersionCompatibleWithConstraint(v900!, caret.constraint!)).toBe(false);
  });
});
