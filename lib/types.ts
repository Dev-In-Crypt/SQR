export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type AnalysisStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "DONE_WITH_WARNINGS"
  | "FAILED"
  | "PARTIAL";

export type PipelineStage =
  | "PREPARING_SOURCE"
  | "RUNNING_STATIC_SCANNER"
  | "EXTRACTING_CONTRACT_STRUCTURE"
  | "RUNNING_AI_AUDIT"
  | "GENERATING_REPORT";

export type PartialReasonCode = "PARTIAL_SOLIDITY_INCOMPLETE" | "PARTIAL_SCANNER_FAILURE";

export type InputType = "PASTE_CODE" | "BASE_ADDRESS";
export type ReviewMode = "STANDARD" | "DEFI_PAYFI";
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
  reviewMode: ReviewMode;
  chainId: number;
  contractAddress?: string;
  sourceHash?: string;
}

export interface FinancialReviewSection {
  category:
    | "PRIVILEGE_RISK"
    | "ADMIN_PAUSE_RISK"
    | "UPGRADEABILITY_RISK"
    | "ORACLE_DEPENDENCY_RISK"
    | "FUND_FLOW_HOTSPOTS"
    | "WITHDRAWAL_ACCOUNTING_SETTLEMENT_RISK"
    | "INTEGRATION_RISK_SUMMARY";
  label: string;
  riskLevel: Severity;
  summary: string;
  evidence: string[];
  observedControls?: string[];
}

export interface IntegrationReadiness {
  status: "GREEN" | "AMBER" | "RED";
  confidenceScore: number;
  rationale: string[];
}

export interface AudienceReportView {
  title: string;
  overview: string;
  highlights: string[];
  nextActions: string[];
  confidenceBoundary: string;
}

export interface FinancialReviewPayload {
  mode: "DEFI_PAYFI";
  sections: FinancialReviewSection[];
  recurringPatterns: string[];
  manualReviewPriorities: string[];
  observedControls: string[];
  integrationReadiness: IntegrationReadiness;
  builderReport: AudienceReportView;
  partnerReport: AudienceReportView;
}

export interface ReportPayload {
  executiveSummary: string;
  scannerSummary: string;
  findings: Finding[];
  aiAuditFindings: AIAuditFinding[];
  metadata: ReportMetadata;
  financialReview?: FinancialReviewPayload;
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
  contractName: string;
  name: string;
  kind: "state_var" | "modifier" | "guard";
  sourceFunction: string | null;
  matchedExpression: string | null;
  filePath: string;
  line: number;
}

export interface StructuredStateVariable {
  contractName: string;
  name: string;
  type: string;
  declaration: string;
  isMapping: boolean;
  isArray: boolean;
  isRoleLike: boolean;
  isFlagLike: boolean;
  isCounterLike: boolean;
  isTotalLike: boolean;
  isMilestoneLike: boolean;
  filePath: string;
  line: number;
}

export interface StructuredModifier {
  contractName: string;
  name: string;
  filePath: string;
  line: number;
  guardExpressions: string[];
  roleHints: string[];
}

export interface StructuredAuthorizationGuard {
  contractName: string;
  functionName: string;
  source: "require" | "modifier";
  expression: string;
  roleHints: string[];
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
  modifiers: string[];
  guardConditions: string[];
  filePath: string;
  line: number;
}

export interface StructuredValueTransferFunction {
  contractName: string;
  functionName: string;
  transferKinds: string[];
  transferSites: string[];
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

export interface StructuredStateFlowGate {
  contractName: string;
  variableName: string;
  gatedFunctions: string[];
  conditions: string[];
  filePath: string;
  line: number;
}

export interface StructuredProgressionIndicator {
  contractName: string;
  variableName: string;
  declaration: string;
  updatedInFunctions: string[];
  filePath: string;
  line: number;
}

export interface StructuredCounterOrTotal {
  contractName: string;
  variableName: string;
  declaration: string;
  kind: "counter" | "total";
  updatedInFunctions: string[];
  filePath: string;
  line: number;
}

export interface StructuredMappingTracker {
  contractName: string;
  variableName: string;
  declaration: string;
  valueType: string;
  updatedInFunctions: string[];
  filePath: string;
  line: number;
}

export interface StructuredFundControlFunction {
  contractName: string;
  functionName: string;
  action: "payout" | "refund" | "cancel" | "withdrawal";
  callableBy: string[];
  guardConditions: string[];
  transferMethods: string[];
  usesPlannedValues: boolean;
  usesBalanceChecks: boolean;
  usesLoops: boolean;
  filePath: string;
  line: number;
}

export interface StructuredFundControlMap {
  payoutFunctions: string[];
  refundFunctions: string[];
  cancellationFunctions: string[];
  withdrawalFunctions: string[];
  privilegedRoles: string[];
  functionControls: StructuredFundControlFunction[];
  notes: string[];
}

export interface StructuredAuditContext {
  pragma: StructuredPragmaMeta;
  contractNames: string[];
  modifiers: StructuredModifier[];
  rolesOrPrivilegedAddresses: StructuredRoleOrPrivilege[];
  authorizationGuards: StructuredAuthorizationGuard[];
  stateVariables: StructuredStateVariable[];
  externalCallSites: StructuredCallSite[];
  tokenInteractionSites: StructuredTokenInteractionSite[];
  stateMutatingFunctions: StructuredStateMutatingFunction[];
  valueTransferFunctions: StructuredValueTransferFunction[];
  loopLocations: StructuredLoopLocation[];
  stateFlowGates: StructuredStateFlowGate[];
  progressionIndicators: StructuredProgressionIndicator[];
  countersAndTotals: StructuredCounterOrTotal[];
  mappingTrackers: StructuredMappingTracker[];
  fundControlMap: StructuredFundControlMap;
  logicSummaries: string[];
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
