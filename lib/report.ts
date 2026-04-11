import { config } from "@/lib/config";
import { hashCanonical } from "@/lib/hash";
import { generateAIAuditFindings, generateExecutiveSummary } from "@/lib/llm";
import type {
  AIAuditFinding,
  AudienceReportView,
  FinancialReviewPayload,
  FinancialReviewSection,
  Finding,
  IntegrationReadiness,
  ReportPayload,
  ReviewMode,
  Severity,
  SourceBundle
} from "@/lib/types";

const severityRank: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;

    const confidenceDiff = b.confidence - a.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return a.fingerprint.localeCompare(b.fingerprint);
  });
}

export function topSeverity(findings: Finding[]): Severity {
  if (findings.length === 0) {
    return "INFO";
  }

  return sortFindings(findings)[0].severity;
}

export function mergeFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();

  for (const finding of findings) {
    if (!map.has(finding.fingerprint)) {
      map.set(finding.fingerprint, {
        ...finding,
        needsManualCheck: finding.needsManualCheck || finding.evidence.length === 0
      });
      continue;
    }

    const existing = map.get(finding.fingerprint)!;
    if (finding.confidence > existing.confidence) {
      map.set(finding.fingerprint, {
        ...finding,
        needsManualCheck: finding.needsManualCheck || finding.evidence.length === 0
      });
    }
  }

  return [...map.values()];
}

function classifyRiskSection(findings: Finding[]): Severity {
  if (findings.length === 0) {
    return "INFO";
  }

  return topSeverity(findings);
}

function severityFromScore(score: number): Severity {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "INFO";
}

interface SourceSignalSet {
  ownable: boolean;
  accessControl: boolean;
  pausable: boolean;
  timelock: boolean;
  proxyOrUpgradeable: boolean;
  oracle: boolean;
  externalCalls: boolean;
  fundTransfers: boolean;
  accounting: boolean;
  nonReentrant: boolean;
  allowanceFlow: boolean;
  staleOracleChecks: boolean;
}

function deriveSourceSignals(sourceBundle: SourceBundle): SourceSignalSet {
  const source = sourceBundle.files.map((file) => file.content).join("\n").toLowerCase();

  return {
    ownable: /\bonlyowner\b|\bowner\s*\(|\bowner\b/.test(source),
    accessControl: /accesscontrol|onlyrole|grantrole|revokerole|hasrole/.test(source),
    pausable: /\bpaus(e|ed|able)\b|whennotpaused|whenpaused/.test(source),
    timelock: /timelock|min\s*delay|eta\b|queued\s*transaction/.test(source),
    proxyOrUpgradeable: /upgrade|uups|delegatecall|implementation|transparentupgradeableproxy|beacon/.test(source),
    oracle: /oracle|aggregatorv3interface|price\s*feed|getlatestprice|latestanswer/.test(source),
    externalCalls: /\.call\(|\.delegatecall\(|\.staticcall\(|call\{value:/.test(source),
    fundTransfers: /transferfrom\(|transfer\(|safetransfer|withdraw|redeem|payout|settle|mint\(|burn\(/.test(source),
    accounting: /totalassets|totalsupply|balanceof|shares|liability|reserve|accrual|settlement/.test(source),
    nonReentrant: /nonreentrant|reentrancyguard/.test(source),
    allowanceFlow: /approve\(|allowance\(|permit\(|safeapprove/.test(source),
    staleOracleChecks: /stale|maxdelay|heartbeat|updatedat|roundid/.test(source)
  };
}

function deriveObservedControls(signals: SourceSignalSet): string[] {
  const controls: string[] = [];

  if (signals.ownable || signals.accessControl) controls.push("Privilege gating is present in source (owner/role checks detected).");
  if (signals.pausable) controls.push("Emergency stop pattern appears present (pause-related controls detected).");
  if (signals.timelock) controls.push("Timelock or delayed admin action pattern detected.");
  if (signals.nonReentrant) controls.push("Reentrancy guard pattern detected in callable paths.");
  if (signals.staleOracleChecks) controls.push("Oracle freshness or staleness checks appear in source.");

  return controls;
}

function matchesFinding(finding: Finding, keywords: string[]): boolean {
  const corpus = `${finding.title} ${finding.whyItMatters} ${finding.fixDirection}`.toLowerCase();
  return keywords.some((keyword) => corpus.includes(keyword));
}

function sectionSummary(params: {
  findings: Finding[];
  derivedRisk: Severity;
  riskDriver: string;
  controls: string[];
}): string {
  if (params.findings.length > 0) {
    const top = sortFindings(params.findings)[0];
    return `${params.findings.length} signal(s) flagged. Highest severity: ${top.severity}. Primary driver: ${params.riskDriver}.`;
  }

  if (params.derivedRisk === "INFO") {
    return "No high-confidence automated red flags were identified in this category. Manual review is still recommended.";
  }

  const controlHint = params.controls.length > 0 ? `Controls observed: ${params.controls[0]}` : "No explicit mitigating control detected in this category.";
  return `Risk inferred from contract structure (${params.derivedRisk}). Driver: ${params.riskDriver}. ${controlHint}`;
}

function computeIntegrationReadiness(sections: FinancialReviewSection[]): IntegrationReadiness {
  const highestRank = sections.reduce((max, section) => Math.max(max, severityRank[section.riskLevel]), 1);
  const elevated = sections.filter((section) => severityRank[section.riskLevel] >= severityRank.MEDIUM);
  const lowOnly = sections.filter((section) => section.riskLevel === "LOW").length;

  let status: IntegrationReadiness["status"] = "GREEN";
  if (highestRank >= severityRank.HIGH || elevated.length >= 3) {
    status = "RED";
  } else if (highestRank >= severityRank.MEDIUM || lowOnly >= 2) {
    status = "AMBER";
  }

  const confidenceScore = Math.max(
    35,
    Math.min(
      92,
      70 + sections.reduce((sum, section) => sum + Math.min(section.evidence.length, 2), 0) * 2 - elevated.length * 4
    )
  );

  const rationale = [
    `Highest financial risk section severity: ${sections.sort((a, b) => severityRank[b.riskLevel] - severityRank[a.riskLevel])[0]?.riskLevel ?? "INFO"}.`,
    `${elevated.length} section(s) are MEDIUM or above and require manual due diligence before integration.`,
    "Status reflects triage confidence and observed controls; it is not a security guarantee."
  ];

  return { status, confidenceScore, rationale };
}

function buildAudienceViews(params: {
  sections: FinancialReviewSection[];
  topSeverityValue: Severity;
  integrationReadiness: IntegrationReadiness;
  observedControls: string[];
}): { builderReport: AudienceReportView; partnerReport: AudienceReportView } {
  const highRiskSections = params.sections.filter((section) => severityRank[section.riskLevel] >= severityRank.MEDIUM);
  const topSections = highRiskSections.length > 0 ? highRiskSections : params.sections.slice(0, 3);

  const builderReport: AudienceReportView = {
    title: "Builder Report",
    overview:
      "This review is a fast triage layer for financial contract risk. It highlights where manual audit time should be focused first.",
    highlights: topSections.map((item) => `${item.label}: ${item.summary}`),
    nextActions: [
      ...topSections.slice(0, 3).map((item) => `Address ${item.label.toLowerCase()} with scenario tests and explicit runbooks.`),
      "Perform targeted manual audit on sections with MEDIUM+ automated risk signals."
    ].slice(0, 4),
    confidenceBoundary:
      "Automated findings are triage signals, not certification. Treat unresolved MEDIUM/HIGH/CRITICAL items as blockers for integration readiness."
  };

  const partnerReport: AudienceReportView = {
    title: "Partner / Investor Report",
    overview:
      `This report indicates integration risk posture at screening level. Current triage status: ${params.integrationReadiness.status}.`,
    highlights: [
      `Integration status: ${params.integrationReadiness.status} (confidence ${params.integrationReadiness.confidenceScore}/100).`,
      ...topSections.map((item) => `${item.label}: ${item.riskLevel}`)
    ].slice(0, 4),
    nextActions: [
      "Request project team responses for each highlighted risk section.",
      "Require independent manual audit for unresolved elevated risks.",
      `Use this result as triage only. Current peak automated severity: ${params.topSeverityValue}.`
    ],
    confidenceBoundary:
      "Proof of review and report hash integrity do not imply contract safety or audit certification."
  };

  if (params.observedControls.length > 0) {
    builderReport.highlights.push(`Observed controls: ${params.observedControls.slice(0, 2).join(" ")}`);
    partnerReport.highlights.push(`Observed control baseline: ${params.observedControls[0]}`);
  }

  return { builderReport, partnerReport };
}

function buildFinancialReview(
  findings: Finding[],
  topSeverityValue: Severity,
  sourceBundle: SourceBundle
): FinancialReviewPayload {
  const signals = deriveSourceSignals(sourceBundle);
  const observedControls = deriveObservedControls(signals);
  const categories: Array<{
    category: FinancialReviewSection["category"];
    label: string;
    keywords: string[];
    riskDriver: string;
    controls: string[];
    scoreFromSignals: (s: SourceSignalSet) => number;
  }> = [
    {
      category: "PRIVILEGE_RISK",
      label: "Privilege Risk",
      keywords: ["owner", "role", "onlyowner", "access control", "admin"],
      riskDriver: "Privileged authority can alter protocol behavior or funds access.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("privilege") || item.toLowerCase().includes("timelock")),
      scoreFromSignals: (s) => (s.ownable || s.accessControl ? 45 : 10) + (s.timelock ? -10 : 8)
    },
    {
      category: "ADMIN_PAUSE_RISK",
      label: "Admin & Pause Risk",
      keywords: ["pause", "emergency", "guardian", "halt", "stop"],
      riskDriver: "Emergency controls can protect users but also concentrate operational power.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("pause") || item.toLowerCase().includes("timelock")),
      scoreFromSignals: (s) => (s.pausable ? 35 : 8) + (s.timelock ? -8 : 6)
    },
    {
      category: "UPGRADEABILITY_RISK",
      label: "Upgradeability Risk",
      keywords: ["upgrade", "proxy", "delegatecall", "implementation"],
      riskDriver: "Upgradeable architecture changes trust assumptions after deployment.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("timelock")),
      scoreFromSignals: (s) => (s.proxyOrUpgradeable ? 62 : 8) + (s.timelock ? -10 : 5)
    },
    {
      category: "ORACLE_DEPENDENCY_RISK",
      label: "Oracle / Dependency Risk",
      keywords: ["oracle", "price", "feed", "external call", "dependency"],
      riskDriver: "External data and dependency assumptions can create liquidation or settlement errors.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("oracle") || item.toLowerCase().includes("staleness")),
      scoreFromSignals: (s) => (s.oracle ? 42 : 10) + (s.externalCalls ? 12 : 0) + (s.staleOracleChecks ? -12 : 8)
    },
    {
      category: "FUND_FLOW_HOTSPOTS",
      label: "Fund Flow Hotspots",
      keywords: ["withdraw", "transfer", "payout", "escrow", "settlement", "balance"],
      riskDriver: "Asset movement paths are primary loss surface in financial contracts.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("reentrancy")),
      scoreFromSignals: (s) => (s.fundTransfers ? 38 : 10) + (s.externalCalls ? 14 : 0) + (s.nonReentrant ? -10 : 8)
    },
    {
      category: "WITHDRAWAL_ACCOUNTING_SETTLEMENT_RISK",
      label: "Withdrawal / Accounting / Settlement Risk",
      keywords: ["accounting", "invariant", "share", "claim", "redeem", "withdraw"],
      riskDriver: "Accounting drift or settlement mismatch can accumulate hidden protocol insolvency risk.",
      controls: observedControls.filter((item) => item.toLowerCase().includes("reentrancy") || item.toLowerCase().includes("staleness")),
      scoreFromSignals: (s) => (s.accounting ? 36 : 10) + (s.fundTransfers ? 18 : 0) + (s.nonReentrant ? -8 : 6)
    },
    {
      category: "INTEGRATION_RISK_SUMMARY",
      label: "Integration Risk Summary",
      keywords: ["integration", "allowance", "approval", "token", "external"],
      riskDriver: "Third-party integration points can widen exploit blast radius and operational dependency.",
      controls: observedControls,
      scoreFromSignals: (s) => (s.allowanceFlow ? 24 : 6) + (s.externalCalls ? 24 : 8) + (s.proxyOrUpgradeable ? 16 : 0)
    }
  ];

  const sections: FinancialReviewSection[] = categories.map((category) => {
    const matched = findings.filter((finding) => matchesFinding(finding, category.keywords));
    const inferredSeverity = severityFromScore(category.scoreFromSignals(signals));
    const findingSeverity = classifyRiskSection(matched);
    const riskLevel =
      severityRank[findingSeverity] >= severityRank[inferredSeverity] ? findingSeverity : inferredSeverity;

    return {
      category: category.category,
      label: category.label,
      riskLevel,
      summary: sectionSummary({
        findings: matched,
        derivedRisk: inferredSeverity,
        riskDriver: category.riskDriver,
        controls: category.controls
      }),
      evidence: sortFindings(matched)
        .slice(0, 3)
        .map((finding) => `${finding.severity}: ${finding.title}`),
      observedControls: category.controls.slice(0, 2)
    };
  });

  const recurringPatterns = sections
    .filter((section) => severityRank[section.riskLevel] >= severityRank.LOW)
    .map((section) => `${section.label} requires consistent control evidence in manual review.`)
    .slice(0, 4);

  const manualReviewPriorities = sections
    .filter((section) => severityRank[section.riskLevel] >= severityRank.MEDIUM)
    .map((section) => `Prioritize manual review for ${section.label.toLowerCase()} with evidence-driven test cases.`)
    .slice(0, 5);

  const integrationReadiness = computeIntegrationReadiness(sections);

  const { builderReport, partnerReport } = buildAudienceViews({
    sections,
    topSeverityValue,
    integrationReadiness,
    observedControls
  });

  return {
    mode: "DEFI_PAYFI",
    sections,
    recurringPatterns,
    manualReviewPriorities,
    observedControls,
    integrationReadiness,
    builderReport,
    partnerReport
  };
}

export async function buildReport(params: {
  findings: Finding[];
  warnings: string[];
  scannerErrors: string[];
  partialReasons: string[];
  sourceBundle: SourceBundle;
  reviewMode?: ReviewMode;
  aiAuditFindings?: AIAuditFinding[];
  onExtractingContractStructure?: () => Promise<void>;
  onRunningAIAudit?: () => Promise<void>;
  onGeneratingReport?: () => Promise<void>;
}): Promise<{ report: ReportPayload; topSeverity: Severity }> {
  const mergedFindings = mergeFindings(params.findings);
  const sortedFindings = sortFindings(mergedFindings);

  await params.onExtractingContractStructure?.();

  const scannerSummary = await generateExecutiveSummary({
    findings: sortedFindings,
    partialReasons: params.partialReasons
  });

  await params.onRunningAIAudit?.();

  const aiAuditFindings =
    params.aiAuditFindings ??
    (await generateAIAuditFindings({
      sourceBundle: params.sourceBundle,
      scannerFindings: sortedFindings,
      warnings: params.warnings,
      scannerErrors: params.scannerErrors,
      partialReasons: params.partialReasons
    }));

  await params.onGeneratingReport?.();

  const metadata = {
    analyzerVersion: config.ANALYZER_VERSION,
    rulesetVersion: config.RULESET_VERSION,
    generatedAt: new Date().toISOString(),
    inputType: params.sourceBundle.inputType,
    reviewMode: params.reviewMode ?? "STANDARD",
    chainId: params.sourceBundle.chainId,
    contractAddress: params.sourceBundle.contractAddress,
    sourceHash: params.sourceBundle.sourceHash
  };

  const financialReview =
    metadata.reviewMode === "DEFI_PAYFI"
      ? buildFinancialReview(sortedFindings, topSeverity(sortedFindings), params.sourceBundle)
      : undefined;

  // Keep generatedAt in the delivered metadata, but exclude it from reportHash so
  // identical inputs produce identical hashes across runs. AI output is also
  // excluded to keep deterministic scanner-hash semantics.
  const hashPayload = {
    findings: sortedFindings,
    metadata: {
      analyzerVersion: metadata.analyzerVersion,
      rulesetVersion: metadata.rulesetVersion,
      inputType: metadata.inputType,
      reviewMode: metadata.reviewMode,
      chainId: metadata.chainId,
      contractAddress: metadata.contractAddress,
      sourceHash: metadata.sourceHash
    },
    warnings: params.warnings,
    scannerErrors: params.scannerErrors,
    partialReasons: params.partialReasons
  };

  const reportHash = hashCanonical(hashPayload);

  return {
    report: {
      executiveSummary: scannerSummary,
      scannerSummary,
      findings: sortedFindings,
      aiAuditFindings,
      metadata,
      financialReview,
      warnings: params.warnings,
      scannerErrors: params.scannerErrors,
      partialReasons: params.partialReasons,
      reportHash
    },
    topSeverity: topSeverity(sortedFindings)
  };
}
