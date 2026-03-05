import { config } from "@/lib/config";
import { hashCanonical } from "@/lib/hash";
import { generateExecutiveSummary } from "@/lib/llm";
import type { Finding, ReportPayload, Severity, SourceBundle } from "@/lib/types";

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

export async function buildReport(params: {
  findings: Finding[];
  warnings: string[];
  scannerErrors: string[];
  partialReasons: string[];
  sourceBundle: SourceBundle;
}): Promise<{ report: ReportPayload; topSeverity: Severity }> {
  const mergedFindings = mergeFindings(params.findings);
  const sortedFindings = sortFindings(mergedFindings);

  const executiveSummary = await generateExecutiveSummary({
    findings: sortedFindings,
    partialReasons: params.partialReasons
  });

  const metadata = {
    analyzerVersion: config.ANALYZER_VERSION,
    rulesetVersion: config.RULESET_VERSION,
    generatedAt: new Date().toISOString(),
    inputType: params.sourceBundle.inputType,
    chainId: params.sourceBundle.chainId,
    contractAddress: params.sourceBundle.contractAddress,
    sourceHash: params.sourceBundle.sourceHash
  };

  // Keep generatedAt in the delivered metadata, but exclude it from reportHash so
  // identical inputs produce identical hashes across runs.
  const hashPayload = {
    executiveSummary,
    findings: sortedFindings,
    metadata: {
      analyzerVersion: metadata.analyzerVersion,
      rulesetVersion: metadata.rulesetVersion,
      inputType: metadata.inputType,
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
      executiveSummary,
      findings: sortedFindings,
      metadata,
      warnings: params.warnings,
      scannerErrors: params.scannerErrors,
      partialReasons: params.partialReasons,
      reportHash
    },
    topSeverity: topSeverity(sortedFindings)
  };
}
