export const UI_ERROR_MESSAGES: Record<string, string> = {
  EMPTY_CODE: "Code cannot be empty.",
  INVALID_SOLIDITY_INPUT: "Input does not look like Solidity source code.",
  INCOMPLETE_SNIPPET: "Incomplete snippet, please paste a full contract.",
  INVALID_PRAGMA: "Malformed pragma. Use a valid Solidity pragma declaration.",
  CONTROL_CHARS_NOT_ALLOWED: "Input contains unsupported control characters.",
  LINE_LIMIT_EXCEEDED: "Paste mode supports up to 200 lines.",
  WORKER_UNAVAILABLE: "Analysis worker is unavailable. Start worker process and retry.",
  OWNER_MISMATCH: "Connected wallet does not match the report owner. Switch wallet and retry.",
  INVALID_SIGNATURE: "Mint authorization signature is invalid.",
  TX_NOT_FOUND_REQUIRED_NETWORK: "Transaction was not found on the required network.",
  MINT_EVENT_NOT_FOUND: "ReceiptMinted event was not found in the transaction.",
  HASH_MISMATCH: "Transaction report hash does not match this report.",
  RECEIPT_CHAIN_UNAVAILABLE: "Receipt network is temporarily unavailable. Please try again."
};

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
