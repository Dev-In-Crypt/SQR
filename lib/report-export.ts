import type { AIAuditFinding, Finding, InputType, ReportPayload, Severity } from "@/lib/types";

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function formatInputType(inputType: InputType, contractAddress?: string): string {
  if (inputType === "BASE_ADDRESS") {
    return contractAddress ? `Base contract ${contractAddress}` : "Base contract address";
  }
  return "Pasted Solidity snippet";
}

function findingBlock(finding: Finding): string {
  const lines: string[] = [];
  lines.push(`#### ${finding.title}`);
  lines.push("");
  lines.push(
    `- **Severity:** ${finding.severity}  |  **Confidence:** ${finding.confidence}%` +
      (finding.needsManualCheck ? "  |  **Needs manual check**" : "")
  );
  if (finding.whyItMatters) {
    lines.push(`- **Why it matters:** ${finding.whyItMatters}`);
  }
  if (finding.fixDirection) {
    lines.push(`- **Fix direction:** ${finding.fixDirection}`);
  }
  if (finding.evidence.length > 0) {
    lines.push("");
    lines.push("```solidity");
    for (const evidence of finding.evidence) {
      lines.push(`// ${evidence.filePath}:${evidence.line}`);
      lines.push(evidence.excerpt);
    }
    lines.push("```");
  }
  lines.push("");
  return lines.join("\n");
}

function aiFindingBlock(finding: AIAuditFinding): string {
  const lines: string[] = [];
  lines.push(`#### ${finding.title}`);
  lines.push("");
  lines.push(`- **Severity:** ${finding.severity}  |  **Location:** ${finding.location || "n/a"}`);
  if (typeof finding.modelAgreement === "number" && typeof finding.modelsQueried === "number") {
    lines.push(`- **Model consensus:** ${finding.modelAgreement} of ${finding.modelsQueried} models agreed`);
  }
  if (finding.explanation) {
    lines.push(`- **Explanation:** ${finding.explanation}`);
  }
  if (finding.fixDirection) {
    lines.push(`- **Fix direction:** ${finding.fixDirection}`);
  }
  if (finding.evidence) {
    lines.push("");
    lines.push("```solidity");
    lines.push(finding.evidence);
    lines.push("```");
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Renders a report as Markdown. Pure — no I/O, no dependencies. Non-owner
 * callers pass a payload already stripped of warnings/scannerErrors/
 * partialReasons (mirroring the report API), so those sections simply omit.
 */
export function reportToMarkdown(params: {
  reportId: string;
  report: ReportPayload;
  topSeverity: Severity;
  createdAt: Date;
  analysis: { inputType: InputType; chainId: number };
}): string {
  const { reportId, report, topSeverity, createdAt, analysis } = params;
  const meta = report.metadata;
  const out: string[] = [];

  out.push(`# Security Review Memo`);
  out.push("");
  out.push(`Report ID: \`${reportId}\``);
  out.push("");

  out.push("| Field | Value |");
  out.push("|---|---|");
  out.push(`| Top severity | ${topSeverity} |`);
  out.push(`| Generated | ${createdAt.toISOString()} |`);
  out.push(`| Input | ${formatInputType(analysis.inputType, meta.contractAddress)} |`);
  out.push(`| Chain ID | ${analysis.chainId} |`);
  out.push(`| Analyzer version | ${meta.analyzerVersion} |`);
  out.push(`| Ruleset version | ${meta.rulesetVersion} |`);
  if (meta.sourceHash) {
    out.push(`| Source hash | \`${meta.sourceHash}\` |`);
  }
  out.push(`| Report hash | \`${report.reportHash}\` |`);
  out.push("");

  out.push("## Executive summary");
  out.push("");
  out.push(report.executiveSummary || report.scannerSummary || "No summary available.");
  out.push("");

  out.push("## Static findings");
  out.push("");
  if (report.findings.length === 0) {
    out.push("_No issues were identified within the automated static analysis scope._");
    out.push("");
  } else {
    for (const severity of SEVERITY_ORDER) {
      const group = report.findings.filter((finding) => finding.severity === severity);
      if (group.length === 0) {
        continue;
      }
      out.push(`### ${severity} (${group.length})`);
      out.push("");
      for (const finding of group) {
        out.push(findingBlock(finding));
      }
    }
  }

  if (report.aiAuditFindings.length > 0) {
    out.push("## AI-assisted audit findings");
    out.push("");
    for (const finding of report.aiAuditFindings) {
      out.push(aiFindingBlock(finding));
    }
  }

  if (report.partialReasons.length > 0 || report.warnings.length > 0 || report.scannerErrors.length > 0) {
    out.push("## Coverage notes");
    out.push("");
    for (const reason of report.partialReasons) {
      out.push(`- Partial: ${reason}`);
    }
    for (const warning of report.warnings) {
      out.push(`- Warning: ${warning}`);
    }
    for (const scannerError of report.scannerErrors) {
      out.push(`- Scanner error: ${scannerError}`);
    }
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push(
    "_This is an automated review layer for fast risk screening, useful before deeper manual " +
      "review — not a replacement for a full audit or a security certification._"
  );
  out.push("");

  return out.join("\n");
}
