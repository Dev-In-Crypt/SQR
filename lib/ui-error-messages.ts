export const UI_ERROR_MESSAGES: Record<string, string> = {
  EMPTY_CODE: "Code cannot be empty.",
  INVALID_SOLIDITY_INPUT: "Input does not look like Solidity source code.",
  INCOMPLETE_SNIPPET: "Incomplete snippet, please paste a full contract.",
  INVALID_PRAGMA: "Malformed pragma. Use a valid Solidity pragma declaration.",
  CONTROL_CHARS_NOT_ALLOWED: "Input contains unsupported control characters.",
  LINE_LIMIT_EXCEEDED: "Paste mode supports up to 200 lines.",
  WORKER_UNAVAILABLE: "Analysis worker is unavailable. Start worker process and retry.",
  SOURCE_UNVERIFIED: "Verified source is not available for this contract on the selected network.",
  BASESCAN_RATE_LIMIT: "Source provider rate limit reached. Please retry shortly.",
  BASESCAN_TIMEOUT: "Source provider timeout. Please retry.",
  BASESCAN_HTTP_429: "Source provider rate limit reached. Please retry shortly.",
  BASESCAN_HTTP_503: "Source provider is temporarily unavailable. Please retry.",
  SOURCIFY_TIMEOUT: "Source provider timeout. Please retry.",
  COMPILATION_FAILED: "Source compilation failed in the analysis environment.",
  ANALYSIS_PROCESSING_FAILED: "Analysis could not be completed due to an internal processing issue.",
  OWNER_MISMATCH: "Connected wallet does not match the report owner. Switch wallet and retry.",
  INVALID_SIGNATURE: "Mint authorization signature is invalid.",
  TX_NOT_FOUND_REQUIRED_NETWORK: "Transaction was not found on the required network.",
  MINT_EVENT_NOT_FOUND: "ReceiptMinted event was not found in the transaction.",
  HASH_MISMATCH: "Transaction report hash does not match this report.",
  RECEIPT_CHAIN_UNAVAILABLE: "Receipt network is temporarily unavailable. Please try again.",
  RECEIPT_CONTRACT_UNAVAILABLE: "Receipt minting is temporarily unavailable. Please try again later.",
  RECEIPT_RPC_UNAVAILABLE: "Receipt network RPC is unavailable. Please try again later.",
  RECEIPT_UNAVAILABLE: "Receipt minting is currently unavailable.",
  UNSUPPORTED_RECEIPT_CHAIN: "Receipt network configuration is currently unavailable."
};

export type AnalysisErrorCategory =
  | "SOURCE_RETRIEVAL_ERROR"
  | "CONTRACT_NOT_VERIFIED"
  | "COMPILATION_FAILURE"
  | "ANALYSIS_TIMEOUT"
  | "INTERNAL_PROCESSING_ERROR";

interface AnalysisErrorTemplate {
  title: string;
  message: string;
  hint?: string;
}

export interface AnalysisErrorDetails {
  category: AnalysisErrorCategory;
  title: string;
  message: string;
  hint?: string;
  code: string | null;
}

const ANALYSIS_ERROR_TEMPLATES: Record<AnalysisErrorCategory, AnalysisErrorTemplate> = {
  SOURCE_RETRIEVAL_ERROR: {
    title: "Source retrieval error",
    message: "Contract source could not be retrieved for this request.",
    hint: "Verify network/address and retry."
  },
  CONTRACT_NOT_VERIFIED: {
    title: "Contract not verified",
    message: "Verified source is not available for this contract on the selected network.",
    hint: "Use a verified contract address or submit a snippet."
  },
  COMPILATION_FAILURE: {
    title: "Compilation failure",
    message: "Source could not be compiled in the current analysis environment.",
    hint: "Check pragma/import compatibility and retry. If the same source worked before, scanner runtime may be transient."
  },
  ANALYSIS_TIMEOUT: {
    title: "Analysis timeout",
    message: "Analysis did not complete in the expected time window.",
    hint: "Retry shortly."
  },
  INTERNAL_PROCESSING_ERROR: {
    title: "Internal processing error",
    message: "Analysis could not be completed due to an internal processing issue.",
    hint: "Retry the analysis. If it persists, check worker/runtime health."
  }
};

const SOURCE_RETRIEVAL_CODES = new Set([
  "BASESCAN_INVALID_API_KEY",
  "BASESCAN_RATE_LIMIT",
  "BASESCAN_TIMEOUT",
  "BASESCAN_MALFORMED_JSON",
  "BASESCAN_V1_DEPRECATED",
  "BASESCAN_NOTOK",
  "BASESCAN_HTTP_429",
  "BASESCAN_HTTP_503",
  "SOURCIFY_HTTP_404",
  "SOURCIFY_HTTP_429",
  "SOURCIFY_HTTP_503",
  "SOURCIFY_TIMEOUT",
  "INVALID_ADDRESS",
  "INVALID_CHAIN"
]);

const COMPILATION_CODES = new Set([
  "COMPILATION_FAILED",
  "SLITHER_COMPILATION_FAILED",
  "SLITHER_RUNTIME_FAILURE",
  "SOLC_NOT_FOUND",
  "SOLC_VERSION_MISMATCH"
]);

export function resolveAnalysisErrorDetails(code?: string | null): AnalysisErrorDetails {
  const normalizedCode = code?.trim() || null;

  let category: AnalysisErrorCategory = "INTERNAL_PROCESSING_ERROR";
  if (normalizedCode === "SOURCE_UNVERIFIED") {
    category = "CONTRACT_NOT_VERIFIED";
  } else if (normalizedCode?.startsWith("BASESCAN_HTTP_") || normalizedCode?.startsWith("SOURCIFY_HTTP_")) {
    category = "SOURCE_RETRIEVAL_ERROR";
  } else if (normalizedCode && SOURCE_RETRIEVAL_CODES.has(normalizedCode)) {
    category = "SOURCE_RETRIEVAL_ERROR";
  } else if (normalizedCode && normalizedCode.includes("TIMEOUT")) {
    category = "ANALYSIS_TIMEOUT";
  } else if (normalizedCode && COMPILATION_CODES.has(normalizedCode)) {
    category = "COMPILATION_FAILURE";
  } else if (normalizedCode === "ANALYSIS_PROCESSING_FAILED") {
    category = "INTERNAL_PROCESSING_ERROR";
  } else if (normalizedCode === "SOURCE_BUNDLE_MISSING") {
    category = "INTERNAL_PROCESSING_ERROR";
  }

  const template = ANALYSIS_ERROR_TEMPLATES[category];

  return {
    category,
    title: template.title,
    message: template.message,
    hint: template.hint,
    code: normalizedCode
  };
}

export function resolveUserErrorMessage(params: {
  code?: string;
  fallbackMessage?: string;
  defaultMessage: string;
}): string {
  const mapped = params.code ? UI_ERROR_MESSAGES[params.code] : undefined;
  if (mapped) {
    return mapped;
  }

  if (params.fallbackMessage && params.fallbackMessage.trim().length > 0) {
    return params.fallbackMessage;
  }

  return params.defaultMessage;
}
