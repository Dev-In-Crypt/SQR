import type { PartialReasonCode } from "@/lib/types";

export const PARTIAL_REASON_TEXT: Record<PartialReasonCode, string> = {
  PARTIAL_SOLIDITY_INCOMPLETE:
    "Input snippet is incomplete; Slither skipped, heuristic scan used.",
  PARTIAL_SCANNER_FAILURE:
    "Static scanner failed on required input; heuristic fallback used."
};

const WARNING_TEXT: Record<string, string> = {
  PARTIAL_SOLIDITY_INCOMPLETE: PARTIAL_REASON_TEXT.PARTIAL_SOLIDITY_INCOMPLETE,
  SLITHER_SKIPPED_SOLC_MISSING:
    "Slither standalone scan was skipped because solc was not available via SOLC_PATH or PATH.",
  SLITHER_SKIPPED_NOT_APPLICABLE:
    "Slither scan was skipped because it is not applicable for this input."
};

export function describeAnalysisNote(note: string): string {
  if (note in PARTIAL_REASON_TEXT) {
    return PARTIAL_REASON_TEXT[note as PartialReasonCode];
  }

  if (note in WARNING_TEXT) {
    return WARNING_TEXT[note];
  }

  return note;
}

export function describePartialReason(reason: string): string {
  return describeAnalysisNote(reason);
}
