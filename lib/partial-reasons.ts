import type { PartialReasonCode } from "@/lib/types";

export const PARTIAL_REASON_TEXT: Record<PartialReasonCode, string> = {
  PARTIAL_SOLIDITY_INCOMPLETE:
    "Input snippet is incomplete; Slither skipped, heuristic scan used.",
  PARTIAL_SCANNER_FAILURE:
    "Static scanner failed on valid input; heuristic fallback used."
};

export function describePartialReason(reason: string): string {
  if (reason in PARTIAL_REASON_TEXT) {
    return PARTIAL_REASON_TEXT[reason as PartialReasonCode];
  }

  return reason;
}