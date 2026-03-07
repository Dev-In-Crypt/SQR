export type NegativeCategory =
  | "PASTE_CODE_INPUT_VALIDATION"
  | "ADDRESS_ANALYSIS_VALIDATION"
  | "RECEIPT_MINT_CONFIRM_NEGATIVE";

export type MatrixInputType = "PASTE_CODE" | "ADDRESS" | "RECEIPT";

export type MatrixTerminalStatus = "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "BLOCKED_BY_UI";

export interface NegativeCase {
  id: string;
  category: NegativeCategory;
  inputType: MatrixInputType;
  payload: string | Record<string, unknown>;
  expectedHttpStatus: number;
  expectedTerminalStatus?: MatrixTerminalStatus;
  expectedErrorCode?: string;
  expectedWarnings?: string[];
  timeoutMs?: number;
  runIn: {
    integration: boolean;
    e2e: boolean;
    foundry: boolean;
  };
  expectedNotes?: string[];
  skipReason?: string;
}

function buildLargeSnippet(lines = 230): string {
  const body = Array.from({ length: lines }, (_, index) => `    uint256 private slot${index};`);
  return [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "",
    "contract VeryLargeInput {",
    ...body,
    "}"
  ].join("\n");
}

function contractWithPattern(name: string, body: string[]): string {
  return [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "",
    `contract ${name} {`,
    ...body,
    "}"
  ].join("\n");
}

const VALID_MINIMAL_CONTRACT = contractWithPattern("MinimalCase", [
  "    uint256 public value;"
]);

const VALID_WITH_IMPORT = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "import \"./MissingDependency.sol\";",
  "contract ImportCase {",
  "    function run() external {}",
  "}"
].join("\n");

const INCOMPLETE_BRACES = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "contract BrokenBraces {",
  "    function run() external {",
  "        if (true) {"
].join("\n");

const INCOMPLETE_MISSING_END = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "contract MissingEnd {",
  "    function run() external {}"
].join("\n");

const MISSING_PRAGMA = [
  "// SPDX-License-Identifier: MIT",
  "contract MissingPragma {",
  "    uint256 public x;",
  "}"
].join("\n");

const MALFORMED_PRAGMA_ALPHA = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity abc;",
  "contract BadPragma {",
  "    uint256 public x;",
  "}"
].join("\n");

const MALFORMED_PRAGMA_MISSING_SEMICOLON = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20",
  "contract BadPragmaSemicolon {",
  "    uint256 public x;",
  "}"
].join("\n");

const PRAGMA_07 = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.7.6;",
  "contract OldVersion {",
  "    uint256 public x;",
  "}"
].join("\n");

const PRAGMA_09 = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.9.0;",
  "contract FutureVersion {",
  "    uint256 public x;",
  "}"
].join("\n");

const NON_SOLIDITY_TEXT = "this is not solidity source code and should be rejected";

const JAVASCRIPT_SNIPPET = [
  "function helloWorld() {",
  "  const result = fetch('/api');",
  "  return result;",
  "}"
].join("\n");

const JSON_SNIPPET = JSON.stringify({
  name: "Token",
  symbol: "TOK",
  decimals: 18
}, null, 2);

const WHITESPACE_ONLY = "\n   \n\t  \n";

const COMMENTS_ONLY = ["// one", "// two", "/* three */"].join("\n");

const UNICODE_ZERO_WIDTH = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract ZeroWidth {\n    string public memo = \"safe\u200btext\";\n}`;

const MIXED_NEWLINES = "// SPDX-License-Identifier: MIT\r\npragma solidity ^0.8.20;\n\rcontract MixedNewline {\r\n    uint256 public x;\n}\r\n";

const CONTROL_CHARS = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract WeirdChars {\n    bytes public b = hex\"00\";\n}\n\u0000\u0001\u0002`;

export const pasteCodeNegativeCases: NegativeCase[] = [
  {
    id: "PASTE_001_VALID_MINIMAL",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: VALID_MINIMAL_CONTRACT,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_002_VALID_IMPORT_WARNING",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: VALID_WITH_IMPORT,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["IMPORT_STATEMENT_PRESENT"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_003_EMPTY",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: "",
    expectedHttpStatus: 400,
    expectedErrorCode: "EMPTY_CODE",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_004_WHITESPACE_ONLY",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: WHITESPACE_ONLY,
    expectedHttpStatus: 400,
    expectedErrorCode: "EMPTY_CODE",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_005_COMMENTS_ONLY",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: COMMENTS_ONLY,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_SOLIDITY_INPUT",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_006_NON_SOLIDITY_TEXT",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: NON_SOLIDITY_TEXT,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_SOLIDITY_INPUT",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_007_JAVASCRIPT_SNIPPET",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: JAVASCRIPT_SNIPPET,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_SOLIDITY_INPUT",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_008_JSON_SNIPPET",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: JSON_SNIPPET,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_SOLIDITY_INPUT",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_009_INCOMPLETE_BRACES",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: INCOMPLETE_BRACES,
    expectedHttpStatus: 400,
    expectedErrorCode: "INCOMPLETE_SNIPPET",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_010_INCOMPLETE_MISSING_END",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: INCOMPLETE_MISSING_END,
    expectedHttpStatus: 400,
    expectedErrorCode: "INCOMPLETE_SNIPPET",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_011_MISSING_PRAGMA_WARN",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: MISSING_PRAGMA,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["MISSING_PRAGMA"],
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_012_MALFORMED_PRAGMA_ALPHA",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: MALFORMED_PRAGMA_ALPHA,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_PRAGMA",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_013_MALFORMED_PRAGMA_SEMICOLON",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: MALFORMED_PRAGMA_MISSING_SEMICOLON,
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_PRAGMA",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_014_UNSUPPORTED_PRAGMA_07",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: PRAGMA_07,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["UNSUPPORTED_PRAGMA_RANGE"],
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_015_UNSUPPORTED_PRAGMA_09",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: PRAGMA_09,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["UNSUPPORTED_PRAGMA_RANGE"],
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_016_LINE_LIMIT_EXCEEDED",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: buildLargeSnippet(),
    expectedHttpStatus: 400,
    expectedErrorCode: "LINE_LIMIT_EXCEEDED",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_017_ZERO_WIDTH_SANITIZED",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: UNICODE_ZERO_WIDTH,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["UNICODE_ZERO_WIDTH_REMOVED"],
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "PASTE_018_MIXED_NEWLINES",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: MIXED_NEWLINES,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["MIXED_NEWLINES_NORMALIZED"],
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_019_CONTROL_CHARS_REJECT",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: CONTROL_CHARS,
    expectedHttpStatus: 400,
    expectedErrorCode: "CONTROL_CHARS_NOT_ALLOWED",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_020_RISKY_DELEGATECALL_WARN",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: contractWithPattern("HasDelegateCall", [
      "    function run(address target) external {",
      "        (bool ok,) = target.delegatecall(abi.encodeWithSignature(\"run()\"));",
      "        require(ok, \"delegate\");",
      "    }"
    ]),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["RISKY_DELEGATECALL_PRESENT"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_021_RISKY_ASSEMBLY_WARN",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: contractWithPattern("HasAssembly", [
      "    function run() external pure returns (uint256 y) {",
      "        assembly { y := 1 }",
      "    }"
    ]),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["RISKY_ASSEMBLY_PRESENT"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_022_RISKY_CALLVALUE_WARN",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: contractWithPattern("HasCallValue", [
      "    function run(address payable target) external {",
      "        target.call{value: 1}(\"\");",
      "    }"
    ]),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["RISKY_CALL_VALUE_PRESENT"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_023_VALID_INTERFACE",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "interface IFoo {",
      "    function x() external;",
      "}"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_024_VALID_LIBRARY",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "library LibA {",
      "    function x(uint256 a) internal pure returns (uint256) { return a + 1; }",
      "}"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_025_VALID_CONTRACT_AND_INTERFACE",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "interface IRunner { function run() external; }",
      "contract Runner is IRunner { function run() external {} }"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_026_ABSTRACT_CONTRACT",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "abstract contract BaseAbstract {",
      "    function run() external virtual;",
      "}"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_027_LONG_SINGLE_LINE",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract LongLine{string public x=\"${"a".repeat(6000)}\";}`,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_028_UNICODE_IDENTIFIER_OK",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "contract UnicodeId {",
      "    uint256 public val;",
      "}"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 10_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_029_IMPORT_AND_DELEGATECALL_WARN",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: [
      "// SPDX-License-Identifier: MIT",
      "pragma solidity ^0.8.20;",
      "import \"./X.sol\";",
      "contract MultiWarn {",
      "    function run(address target) external {",
      "        (bool ok,) = target.delegatecall(\"\");",
      "        require(ok);",
      "    }",
      "}"
    ].join("\n"),
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["IMPORT_STATEMENT_PRESENT", "RISKY_DELEGATECALL_PRESENT"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "PASTE_030_MINIMAL_DETERMINISM_REPEAT",
    category: "PASTE_CODE_INPUT_VALIDATION",
    inputType: "PASTE_CODE",
    payload: VALID_MINIMAL_CONTRACT,
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  }
];

export const addressNegativeCases: NegativeCase[] = [
  {
    id: "ADDRESS_001_INVALID_FORMAT_SHORT",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x1234", chainId: 8453 },
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_ADDRESS",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_002_INVALID_FORMAT_NO_PREFIX",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "1234123412341234123412341234123412341234", chainId: 8453 },
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_ADDRESS",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_003_ZERO_ADDRESS_UNVERIFIED",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000000", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "SOURCE_UNVERIFIED",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_004_WRONG_CHAIN",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000001", chainId: 1 },
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_CHAIN",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_005_UNVERIFIED",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x00000000000000000000000000000000000000aa", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "SOURCE_UNVERIFIED",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_006_VERIFIED_BASESCAN",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000001", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_007_VERIFIED_PROXY_WARN",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000002", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    expectedWarnings: ["PROXY_DETECTED"],
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_008_BASESCAN_RATE_LIMIT",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000003", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_RATE_LIMIT",
    timeoutMs: 3_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_009_BASESCAN_TIMEOUT",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000004", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_TIMEOUT",
    timeoutMs: 3_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_010_BASESCAN_MALFORMED_JSON",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000005", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_MALFORMED_JSON",
    timeoutMs: 3_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_011_VERIFIED_SOURCIFY_FALLBACK",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000006", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_012_BASESCAN_INVALID_KEY",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000007", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_INVALID_API_KEY",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_013_BASESCAN_V1_DEPRECATED",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000008", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_V1_DEPRECATED",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_014_BASESCAN_NOTOK",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000009", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "BASESCAN_NOTOK",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_015_UNVERIFIED_SOURCIFY_404",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x000000000000000000000000000000000000000a", chainId: 8453 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "FAILED",
    expectedErrorCode: "SOURCE_UNVERIFIED",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "ADDRESS_016_CHAIN_SEPOLIA_ALLOWED",
    category: "ADDRESS_ANALYSIS_VALIDATION",
    inputType: "ADDRESS",
    payload: { address: "0x0000000000000000000000000000000000000001", chainId: 84532 },
    expectedHttpStatus: 202,
    expectedTerminalStatus: "COMPLETED",
    timeoutMs: 12_000,
    runIn: { integration: true, e2e: false, foundry: false }
  }
];

export const receiptNegativeCases: NegativeCase[] = [
  {
    id: "RECEIPT_001_WRONG_NETWORK_BLOCKED",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "wallet starts on wrong chain" },
    expectedHttpStatus: 200,
    expectedTerminalStatus: "BLOCKED_BY_UI",
    runIn: { integration: false, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_002_REJECT_SWITCH_4001",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "wallet_switchEthereumChain rejected" },
    expectedHttpStatus: 200,
    expectedTerminalStatus: "BLOCKED_BY_UI",
    expectedErrorCode: "USER_REJECTED",
    runIn: { integration: false, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_003_CHAIN_NOT_ADDED_4902",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "wallet_switchEthereumChain 4902 then add+switch" },
    expectedHttpStatus: 200,
    expectedTerminalStatus: "DONE_WITH_WARNINGS",
    runIn: { integration: false, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_004_PREPARE_OWNER_MISMATCH",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "prepared owner differs from connected wallet" },
    expectedHttpStatus: 403,
    expectedErrorCode: "OWNER_MISMATCH",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_005_CONFIRM_INVALID_SIGNATURE",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "tampered signature" },
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_SIGNATURE",
    runIn: { integration: true, e2e: false, foundry: true }
  },
  {
    id: "RECEIPT_006_CONFIRM_TX_NOT_FOUND",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "tx hash missing on required chain" },
    expectedHttpStatus: 400,
    expectedErrorCode: "TX_NOT_FOUND_REQUIRED_NETWORK",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_007_CONFIRM_EVENT_MISMATCH",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "tx exists but no ReceiptMinted event" },
    expectedHttpStatus: 400,
    expectedErrorCode: "MINT_EVENT_NOT_FOUND",
    runIn: { integration: true, e2e: true, foundry: false }
  },
  {
    id: "RECEIPT_008_CONFIRM_HASH_MISMATCH",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "event report hash belongs to other report" },
    expectedHttpStatus: 400,
    expectedErrorCode: "HASH_MISMATCH",
    runIn: { integration: true, e2e: false, foundry: false }
  },
  {
    id: "RECEIPT_009_DUPLICATE_MINT_IDEMPOTENT",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "same report mint confirmed twice" },
    expectedHttpStatus: 200,
    expectedTerminalStatus: "COMPLETED",
    runIn: { integration: true, e2e: true, foundry: true }
  },
  {
    id: "RECEIPT_010_SIGNATURE_REPLAY_NONCE",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "same nonce/signature replay" },
    expectedHttpStatus: 400,
    expectedErrorCode: "INVALID_NONCE",
    runIn: { integration: false, e2e: false, foundry: true }
  },
  {
    id: "RECEIPT_011_EXPIRED_DEADLINE",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "authorization expired" },
    expectedHttpStatus: 400,
    expectedErrorCode: "AUTHORIZATION_EXPIRED",
    runIn: { integration: false, e2e: false, foundry: true }
  },
  {
    id: "RECEIPT_012_DUPLICATE_OWNER_MISMATCH",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "same hash different owner" },
    expectedHttpStatus: 400,
    expectedErrorCode: "OWNER_MISMATCH",
    runIn: { integration: false, e2e: false, foundry: true }
  },
  {
    id: "RECEIPT_013_DUPLICATE_ANALYZER_MISMATCH",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "same hash different analyzer version" },
    expectedHttpStatus: 400,
    expectedErrorCode: "ANALYZER_VERSION_MISMATCH",
    runIn: { integration: false, e2e: false, foundry: true }
  },
  {
    id: "RECEIPT_014_DEPRECATED_MINT_REVERT",
    category: "RECEIPT_MINT_CONFIRM_NEGATIVE",
    inputType: "RECEIPT",
    payload: { scenario: "legacy mint entrypoint" },
    expectedHttpStatus: 400,
    expectedErrorCode: "MINT_DEPRECATED",
    runIn: { integration: false, e2e: false, foundry: true }
  }
];

export const negativeCases: NegativeCase[] = [
  ...pasteCodeNegativeCases,
  ...addressNegativeCases,
  ...receiptNegativeCases
];
