import { describe, expect, it } from "vitest";

import { sourceBundleFromPaste } from "@/lib/source";

describe("paste source validation", () => {
  it("rejects malformed pragma alpha expression", async () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity abc;",
      "contract BadPragma {",
      "    uint256 public x;",
      "}"
    ].join("\n");

    await expect(sourceBundleFromPaste({ code, chainId: 8453 })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PRAGMA"
    });
  });

  it("rejects pragma missing semicolon", async () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20",
      "contract BadPragmaSemicolon {",
      "    uint256 public x;",
      "}"
    ].join("\n");

    await expect(sourceBundleFromPaste({ code, chainId: 8453 })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PRAGMA"
    });
  });

  it("keeps missing pragma as warning", async () => {
    const code = [
      "// SPDX-License-Identifier: MIT",
      "contract MissingPragma {",
      "    uint256 public x;",
      "}"
    ].join("\n");

    const bundle = await sourceBundleFromPaste({ code, chainId: 8453 });
    expect(bundle.sourceMeta.pasteWarnings).toContain("MISSING_PRAGMA");
  });
});
