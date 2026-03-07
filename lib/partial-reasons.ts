import type { PartialReasonCode } from "@/lib/types";

export const PARTIAL_REASON_TEXT: Record<PartialReasonCode, string> = {
  PARTIAL_SOLIDITY_INCOMPLETE:
    "Input snippet is incomplete; Slither skipped, heuristic scan used.",
  PARTIAL_SCANNER_FAILURE:
    "Static scanner failed on required input; heuristic fallback used."
};

const WARNING_TEXT: Record<string, string> = {
  PARTIAL_SOLIDITY_INCOMPLETE: PARTIAL_REASON_TEXT.PARTIAL_SOLIDITY_INCOMPLETE,
  MISSING_PRAGMA: "Solidity pragma not found; default compiler-policy compatibility checks are reduced.",
  UNSUPPORTED_PRAGMA_RANGE: "Pragma range is outside supported policy (0.8.x preferred).",
  IMPORT_STATEMENT_PRESENT: "Import statements were detected; unresolved dependencies may reduce scan depth.",
  UNICODE_ZERO_WIDTH_REMOVED: "Zero-width Unicode characters were removed during sanitization.",
  MIXED_NEWLINES_NORMALIZED: "Mixed newline styles were normalized for deterministic processing.",
  RISKY_DELEGATECALL_PRESENT: "delegatecall usage detected and flagged for manual review.",
  RISKY_ASSEMBLY_PRESENT: "inline assembly detected and flagged for manual review.",
  RISKY_CALL_VALUE_PRESENT: "low-level call with value detected and flagged for manual review.",
  PROXY_DETECTED: "Proxy contract metadata detected; implementation context should be reviewed.",
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
