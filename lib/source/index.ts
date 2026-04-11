import { isAddress } from "viem";

import { ApiError } from "@/lib/errors";
import { hashCanonical } from "@/lib/hash";
import { getChainMetadata, listSupportedAddressChains } from "@/lib/chains";
import { extractSolidityPragmaFromFiles, extractSolidityPragmaFromSource } from "@/lib/solidity-pragma";
import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import type { InputType, ReviewMode, SourceBundle, SourceFile } from "@/lib/types";
import { fetchVerifiedSource } from "@/lib/source/fetch-verified";

const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;
const IMPORT_REGEX = /^\s*import\s+/m;
const PRAGMA_REGEX = /^\s*pragma\s+solidity\s+([^\r\n;]+)\s*;\s*$/m;
const PRAGMA_LINE_REGEX = /^\s*pragma\s+solidity\b/m;
const PRAGMA_VERSION_EXPR_REGEX = /^(?=.*\d+\.\d+\.\d+)[0-9xX*<>=^~|.\s-]+$/;

interface PasteValidationResult {
  normalizedCode: string;
  lineCount: number;
  warnings: string[];
}

function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, "\"\"")
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function sanitizeCodeRaw(code: string): { normalized: string; hasMixedNewlines: boolean } {
  const hasCrlf = code.includes("\r\n");
  const hasCrOnly = /\r(?!\n)/.test(code);
  const hasLf = code.includes("\n");
  const hasMixedNewlines = (hasCrlf && hasLf) || hasCrOnly;

  return {
    normalized: code.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
    hasMixedNewlines
  };
}

function countLines(content: string): number {
  if (!content.trim()) {
    return 0;
  }

  return content.split("\n").length;
}

function parsePragmaWarningsAndErrors(code: string, warnings: string[]): void {
  const pragmaLinePresent = PRAGMA_LINE_REGEX.test(code);
  if (!pragmaLinePresent) {
    warnings.push("MISSING_PRAGMA");
    return;
  }

  const pragmaMatch = code.match(PRAGMA_REGEX);
  if (!pragmaMatch || !pragmaMatch[1]) {
    throw new ApiError(400, "INVALID_PRAGMA", "Malformed solidity pragma");
  }

  const version = pragmaMatch[1].trim();
  if (!PRAGMA_VERSION_EXPR_REGEX.test(version)) {
    throw new ApiError(400, "INVALID_PRAGMA", "Malformed solidity pragma");
  }

  if (/0\.(7|9)\b/.test(version)) {
    warnings.push("UNSUPPORTED_PRAGMA_RANGE");
  }
}

function validatePasteCode(rawCode: string): PasteValidationResult {
  const warnings: string[] = [];

  if (CONTROL_CHARS_REGEX.test(rawCode)) {
    throw new ApiError(400, "CONTROL_CHARS_NOT_ALLOWED", "Control characters are not allowed");
  }

  const withoutZeroWidth = rawCode.replace(ZERO_WIDTH_REGEX, "");
  if (withoutZeroWidth !== rawCode) {
    warnings.push("UNICODE_ZERO_WIDTH_REMOVED");
  }

  const { normalized, hasMixedNewlines } = sanitizeCodeRaw(withoutZeroWidth);
  if (!normalized) {
    throw new ApiError(400, "EMPTY_CODE", "Code cannot be empty");
  }

  if (hasMixedNewlines) {
    warnings.push("MIXED_NEWLINES_NORMALIZED");
  }

  const lineCount = countLines(normalized);
  if (lineCount > 200) {
    throw new ApiError(400, "LINE_LIMIT_EXCEEDED", "Paste mode supports up to 200 lines");
  }

  const sanitizedForSyntax = stripCommentsAndStrings(normalized);
  if (!/\b(contract|library|interface)\b/.test(sanitizedForSyntax)) {
    throw new ApiError(400, "INVALID_SOLIDITY_INPUT", "Input does not appear to be Solidity source");
  }

  parsePragmaWarningsAndErrors(normalized, warnings);

  const completeness = analyzeSnippetCompleteness(normalized);
  if (!completeness.isComplete) {
    throw new ApiError(400, "INCOMPLETE_SNIPPET", "Incomplete snippet, paste a full contract body");
  }

  if (IMPORT_REGEX.test(normalized)) {
    warnings.push("IMPORT_STATEMENT_PRESENT");
  }

  const lower = sanitizedForSyntax.toLowerCase();
  if (lower.includes("delegatecall(")) {
    warnings.push("RISKY_DELEGATECALL_PRESENT");
  }

  if (lower.includes("assembly") || lower.includes("assembly{")) {
    warnings.push("RISKY_ASSEMBLY_PRESENT");
  }

  if (lower.includes("call{value:") || lower.includes(".call.value(")) {
    warnings.push("RISKY_CALL_VALUE_PRESENT");
  }

  return {
    normalizedCode: normalized,
    lineCount,
    warnings: [...new Set(warnings)]
  };
}

function hashSourcePayload(params: {
  inputType: InputType;
  chainId: number;
  files: SourceFile[];
  contractAddress?: string;
}): string {
  return hashCanonical({
    inputType: params.inputType,
    chainId: params.chainId,
    contractAddress: params.contractAddress ?? null,
    files: params.files.map((file) => ({
      path: file.path,
      content: file.content
    }))
  });
}

export function computeInputHash(params: {
  inputType: InputType;
  chainId: number;
  code?: string;
  address?: string;
  reviewMode?: ReviewMode;
}): string {
  const normalized = params.code ? sanitizeCodeRaw(params.code).normalized : null;

  return hashCanonical({
    inputType: params.inputType,
    chainId: params.chainId,
    reviewMode: params.reviewMode ?? "STANDARD",
    code: normalized,
    address: params.address ? params.address.toLowerCase() : null
  });
}

export function enforceAddressChain(chainId: number): void {
  const chain = getChainMetadata(chainId);
  if (!chain) {
    const supported = listSupportedAddressChains()
      .map((item) => `${item.requiredNetworkLabel} (${item.chainId})`)
      .join(", ");
    throw new ApiError(400, "INVALID_CHAIN", `Unsupported chainId. Supported networks: ${supported}`);
  }
}

export async function sourceBundleFromPaste(params: {
  code: string;
  chainId: number;
}): Promise<SourceBundle> {
  const validation = validatePasteCode(params.code);

  const files: SourceFile[] = [{ path: "PastedSnippet.sol", content: validation.normalizedCode }];
  const pragma = extractSolidityPragmaFromSource(validation.normalizedCode);
  const sourceHash = hashSourcePayload({
    inputType: "PASTE_CODE",
    chainId: params.chainId,
    files
  });

  return {
    inputType: "PASTE_CODE",
    chainId: params.chainId,
    files,
    lineCount: validation.lineCount,
    isVerifiedSource: false,
    sourceMeta: {
      sourceProvider: "paste",
      lineCount: validation.lineCount,
      pasteWarnings: validation.warnings,
      solidityPragma: pragma?.expression ?? null,
      solidityPragmaParseError: pragma?.failureReason ?? null
    },
    sourceHash
  };
}

export async function sourceBundleFromAddress(params: {
  address: string;
  chainId: number;
}): Promise<SourceBundle> {
  const address = params.address.trim();
  if (!isAddress(address)) {
    throw new ApiError(400, "INVALID_ADDRESS", "Invalid contract address");
  }

  enforceAddressChain(params.chainId);

  const verified = await fetchVerifiedSource({
    chainId: params.chainId,
    address
  });

  if (!verified.verified) {
    throw new ApiError(
      422,
      verified.reason || "SOURCE_UNVERIFIED",
      "Verified source is not available for this contract"
    );
  }

  const lineCount = verified.files.reduce((sum, file) => sum + countLines(file.content), 0);
  const pragma = extractSolidityPragmaFromFiles(verified.files);
  const sourceHash = hashSourcePayload({
    inputType: "BASE_ADDRESS",
    chainId: params.chainId,
    files: verified.files,
    contractAddress: address
  });

  return {
    inputType: "BASE_ADDRESS",
    chainId: params.chainId,
    contractAddress: address,
    files: verified.files,
    lineCount,
    isVerifiedSource: true,
    sourceMeta: {
      ...verified.metadata,
      solidityPragma: pragma?.pragma.expression ?? null,
      solidityPragmaFilePath: pragma?.filePath ?? null,
      solidityPragmaParseError: pragma?.pragma.failureReason ?? null
    },
    sourceHash
  };
}
