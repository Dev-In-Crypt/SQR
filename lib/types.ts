export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type AnalysisStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "DONE_WITH_WARNINGS"
  | "FAILED"
  | "PARTIAL";

export type PartialReasonCode = "PARTIAL_SOLIDITY_INCOMPLETE" | "PARTIAL_SCANNER_FAILURE";

export type InputType = "PASTE_CODE" | "BASE_ADDRESS";
export type Visibility = "PRIVATE" | "PUBLIC";

export interface Evidence {
  filePath: string;
  line?: number;
  excerpt: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  evidence: Evidence[];
  whyItMatters: string;
  fixDirection: string;
  confidence: number;
  needsManualCheck: boolean;
  fingerprint: string;
}

export interface ReportMetadata {
  analyzerVersion: string;
  rulesetVersion: string;
  generatedAt: string;
  inputType: InputType;
  chainId: number;
  contractAddress?: string;
  sourceHash?: string;
}

export interface ReportPayload {
  executiveSummary: string;
  findings: Finding[];
  metadata: ReportMetadata;
  scannerErrors: string[];
  partialReasons: string[];
  reportHash: string;
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface SourceBundle {
  inputType: InputType;
  chainId: number;
  contractAddress?: string;
  files: SourceFile[];
  lineCount: number;
  isVerifiedSource: boolean;
  sourceMeta: Record<string, unknown>;
  sourceHash: string;
}

export interface SnippetCompleteness {
  braceBalance: number;
  contractEndFound: boolean;
  isComplete: boolean;
  reasonCodes: PartialReasonCode[];
}

export interface NormalizedAnalysisInput {
  inputType: InputType;
  chainId: number;
  code?: string;
  address?: string;
}

export interface ScannerOutput {
  findings: Finding[];
  scannerErrors: string[];
}