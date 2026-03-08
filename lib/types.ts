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

export interface AIAuditFinding {
  severity: Severity;
  title: string;
  location: string;
  explanation: string;
  evidence: string;
  fixDirection: string;
  source: "ai";
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
  scannerSummary: string;
  findings: Finding[];
  aiAuditFindings: AIAuditFinding[];
  metadata: ReportMetadata;
  warnings: string[];
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

export interface StructuredPragmaMeta {
  expression: string | null;
  filePath: string | null;
  parseError: string | null;
}

export interface StructuredRoleOrPrivilege {
  name: string;
  kind: "state_var" | "modifier" | "guard";
  filePath: string;
  line: number;
}

export interface StructuredStateVariable {
  contractName: string;
  name: string;
  declaration: string;
  filePath: string;
  line: number;
}

export interface StructuredCallSite {
  contractName: string;
  functionName: string;
  callType: string;
  target: string;
  filePath: string;
  line: number;
}

export interface StructuredTokenInteractionSite {
  contractName: string;
  functionName: string;
  method: string;
  target: string;
  filePath: string;
  line: number;
}

export interface StructuredStateMutatingFunction {
  contractName: string;
  functionName: string;
  visibility: string;
  mutability: string;
  filePath: string;
  line: number;
}

export interface StructuredLoopLocation {
  contractName: string;
  functionName: string;
  loopType: "for" | "while" | "do";
  filePath: string;
  line: number;
}

export interface StructuredFundControlMap {
  payoutFunctions: string[];
  refundFunctions: string[];
  cancellationFunctions: string[];
  withdrawalFunctions: string[];
  privilegedRoles: string[];
  notes: string[];
}

export interface StructuredAuditContext {
  pragma: StructuredPragmaMeta;
  contractNames: string[];
  rolesOrPrivilegedAddresses: StructuredRoleOrPrivilege[];
  stateVariables: StructuredStateVariable[];
  externalCallSites: StructuredCallSite[];
  tokenInteractionSites: StructuredTokenInteractionSite[];
  stateMutatingFunctions: StructuredStateMutatingFunction[];
  loopLocations: StructuredLoopLocation[];
  fundControlMap: StructuredFundControlMap;
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
  warnings: string[];
  scannerErrors: string[];
}
