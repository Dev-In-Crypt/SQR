import { isAddress } from "viem";

import { ApiError } from "@/lib/errors";
import { hashCanonical } from "@/lib/hash";
import { config } from "@/lib/config";
import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import type { InputType, SourceBundle, SourceFile } from "@/lib/types";
import { fetchVerifiedSource } from "@/lib/source/fetch-verified";

function sanitizeCode(code: string): string {
  return code.replace(/\r\n/g, "\n").trim();
}

function countLines(content: string): number {
  if (!content.trim()) {
    return 0;
  }

  return content.split("\n").length;
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
}): string {
  return hashCanonical({
    inputType: params.inputType,
    chainId: params.chainId,
    code: params.code ? sanitizeCode(params.code) : null,
    address: params.address ? params.address.toLowerCase() : null
  });
}

export function enforceAddressChain(chainId: number): void {
  const allowed = [config.BASE_CHAIN_ID, config.STAGING_BASE_CHAIN_ID];
  if (!allowed.includes(chainId)) {
    throw new ApiError(400, "INVALID_CHAIN", "Only Base mainnet or Base Sepolia are supported");
  }

  if (config.APP_ENV === "production" && chainId !== config.BASE_CHAIN_ID) {
    throw new ApiError(400, "INVALID_CHAIN", "Production only accepts Base mainnet chainId 8453");
  }
}

export async function sourceBundleFromPaste(params: {
  code: string;
  chainId: number;
}): Promise<SourceBundle> {
  const normalizedCode = sanitizeCode(params.code);

  if (!normalizedCode) {
    throw new ApiError(400, "EMPTY_CODE", "Code cannot be empty");
  }

  const lineCount = countLines(normalizedCode);
  if (lineCount > 200) {
    throw new ApiError(400, "LINE_LIMIT_EXCEEDED", "Paste mode supports up to 200 lines");
  }

  const snippetCompleteness = analyzeSnippetCompleteness(normalizedCode);

  const files: SourceFile[] = [{ path: "PastedSnippet.sol", content: normalizedCode }];
  const sourceHash = hashSourcePayload({
    inputType: "PASTE_CODE",
    chainId: params.chainId,
    files
  });

  return {
    inputType: "PASTE_CODE",
    chainId: params.chainId,
    files,
    lineCount,
    isVerifiedSource: false,
    sourceMeta: {
      sourceProvider: "paste",
      lineCount,
      snippetCompleteness
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
    throw new ApiError(422, "SOURCE_UNVERIFIED", "Verified source is not available for this contract");
  }

  const lineCount = verified.files.reduce((sum, file) => sum + countLines(file.content), 0);
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
    sourceMeta: verified.metadata,
    sourceHash
  };
}