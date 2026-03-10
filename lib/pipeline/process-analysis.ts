import { Prisma, Severity } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";

import { config } from "@/lib/config";
import { buildReport } from "@/lib/report";
import { randomToken, hashPrivateToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { logError, logInfo } from "@/lib/logger";
import { cachePrivateToken } from "@/lib/request-context";
import { runStaticScan } from "@/lib/scanner";
import type { AnalysisStatus, Finding, PipelineStage, SnippetCompleteness, SourceBundle } from "@/lib/types";

async function setPipelineStage(analysisId: string, stage: PipelineStage): Promise<void> {
  await prisma.analysisRequest.update({
    where: { id: analysisId },
    data: {
      pipelineStage: stage
    }
  });
}

class AnalysisTimeoutError extends Error {
  public readonly stage: string;

  constructor(stage: string, timeoutMs: number) {
    super(`${stage} exceeded timeout budget (${timeoutMs}ms)`);
    this.name = "AnalysisTimeoutError";
    this.stage = stage;
  }
}

function assertWithinTotalTimeout(startedAt: number, stage: string): void {
  if (Date.now() - startedAt > config.ANALYSIS_TOTAL_TIMEOUT_MS) {
    throw new AnalysisTimeoutError(stage, config.ANALYSIS_TOTAL_TIMEOUT_MS);
  }
}

function hasTimeoutDiagnostic(diagnostics: string[]): boolean {
  return diagnostics.some((item) =>
    item.includes("COMMAND_TIMEOUT_") || item.includes("BASESCAN_TIMEOUT") || item.includes("TIMEOUT")
  );
}

function hasCompilationDiagnostic(diagnostics: string[]): boolean {
  return diagnostics.some((item) => {
    const normalized = item.toLowerCase();
    return (
      normalized.includes("compilation") ||
      normalized.includes("parsererror") ||
      normalized.includes("solc") ||
      normalized.includes("source file not found") ||
      normalized.includes("file not found")
    );
  });
}

async function runWithStageTimeout<T>(params: {
  stage: string;
  timeoutMs: number;
  action: () => Promise<T>;
}): Promise<T> {
  return await Promise.race([
    params.action(),
    delay(params.timeoutMs).then(() => {
      throw new AnalysisTimeoutError(params.stage, params.timeoutMs);
    })
  ]);
}

function resolveFailureErrorCode(error: unknown): string {
  if (error instanceof AnalysisTimeoutError) {
    return "ANALYSIS_TIMEOUT";
  }

  if (error instanceof Error) {
    const normalized = error.message.toUpperCase();
    if (normalized.includes("TIMEOUT")) {
      return "ANALYSIS_TIMEOUT";
    }

    if (normalized.includes("COMPILATION_FAILED") || normalized.includes("SLITHER_COMPILATION") || normalized.includes("SOLC")) {
      return "COMPILATION_FAILED";
    }
  }

  return "ANALYSIS_PROCESSING_FAILED";
}

function asSourceBundle(value: unknown): SourceBundle {
  const bundle = value as SourceBundle;
  if (!bundle || !Array.isArray(bundle.files) || typeof bundle.chainId !== "number") {
    throw new Error("Invalid SourceBundle payload");
  }

  return bundle;
}

function readSnippetCompleteness(value: unknown): SnippetCompleteness | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Partial<SnippetCompleteness>;
  if (
    typeof payload.braceBalance !== "number" ||
    typeof payload.contractEndFound !== "boolean" ||
    typeof payload.isComplete !== "boolean" ||
    !Array.isArray(payload.reasonCodes)
  ) {
    return null;
  }

  return {
    braceBalance: payload.braceBalance,
    contractEndFound: payload.contractEndFound,
    isComplete: payload.isComplete,
    reasonCodes: payload.reasonCodes
  };
}

function toPrismaSeverity(severity: string): Severity {
  if (severity === "CRITICAL") return Severity.CRITICAL;
  if (severity === "HIGH") return Severity.HIGH;
  if (severity === "MEDIUM") return Severity.MEDIUM;
  if (severity === "LOW") return Severity.LOW;
  return Severity.INFO;
}

function normalizeFinding(finding: Finding): Finding {
  if (finding.evidence.length > 0) {
    return finding;
  }

  return {
    ...finding,
    needsManualCheck: true,
    evidence: [
      {
        filePath: "unknown",
        excerpt: "No direct static evidence attached"
      }
    ]
  };
}

async function loadAnalysisForProcessing(
  analysisId: string,
  retries = 60,
  retryDelayMs = 500
) {
  type AnalysisForProcessing = Prisma.AnalysisRequestGetPayload<{
    include: {
      sourceBundle: true;
      report: true;
    };
  }>;

  let lastSeen:
    | AnalysisForProcessing
    | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const analysis = await prisma.analysisRequest.findUnique({
      where: { id: analysisId },
      include: {
        sourceBundle: true,
        report: true
      }
    });

    lastSeen = analysis;

    if (!analysis) {
      if (attempt < retries) {
        await delay(retryDelayMs);
        continue;
      }
      return null;
    }

    if (
      analysis.report ||
      analysis.sourceBundle ||
      (analysis.status === "FAILED" && analysis.errorCode === "SOURCE_UNVERIFIED")
    ) {
      return analysis;
    }

    if (attempt < retries) {
      await delay(retryDelayMs);
    }
  }

  return lastSeen;
}

export async function processAnalysisById(analysisId: string): Promise<void> {
  const analysis = await loadAnalysisForProcessing(analysisId);

  if (!analysis) {
    throw new Error(`Analysis request not found: ${analysisId}`);
  }

  if (analysis.report) {
    return;
  }

  if (analysis.status === "FAILED" && analysis.errorCode === "SOURCE_UNVERIFIED") {
    return;
  }

  if (!analysis.sourceBundle) {
    await prisma.analysisRequest.update({
      where: { id: analysis.id },
      data: {
        status: "FAILED",
        pipelineStage: null,
        errorCode: "SOURCE_BUNDLE_MISSING"
      }
    });
    return;
  }

  await prisma.analysisRequest.update({
    where: { id: analysis.id },
    data: {
      status: "RUNNING",
      pipelineStage: "PREPARING_SOURCE",
      errorCode: null
    }
  });

  try {
    const startedAt = Date.now();
    const sourceBundle = asSourceBundle(analysis.sourceBundle.sourceJson);
    const sourceMeta = (analysis.sourceBundle.sourceMetaJson ?? {}) as Record<string, unknown>;
    const snippetCompleteness = readSnippetCompleteness(sourceMeta.snippetCompleteness);
    const pasteWarnings = Array.isArray(sourceMeta.pasteWarnings)
      ? sourceMeta.pasteWarnings.filter((item): item is string => typeof item === "string")
      : [];
    const sourceWarnings = Array.isArray(sourceMeta.warnings)
      ? sourceMeta.warnings.filter((item): item is string => typeof item === "string")
      : [];
    const isSnippetIncomplete =
      sourceBundle.inputType === "PASTE_CODE" &&
      snippetCompleteness !== null &&
      snippetCompleteness.isComplete === false;

    const isSnippetInput = sourceBundle.inputType === "PASTE_CODE";
    assertWithinTotalTimeout(startedAt, "pre_scanner");

    await setPipelineStage(analysis.id, "RUNNING_STATIC_SCANNER");

    const staticScan = await runStaticScan(sourceBundle, {
      skipSlither: isSnippetIncomplete,
      scanMode: isSnippetInput ? "snippet" : "project",
      slitherRequired: !isSnippetInput
    });

    if (hasTimeoutDiagnostic(staticScan.scannerErrors) || hasTimeoutDiagnostic(staticScan.warnings)) {
      throw new AnalysisTimeoutError("scanner_stage", config.SCANNER_TIMEOUT_MS);
    }

    if (!isSnippetInput && staticScan.scannerErrors.length > 0 && hasCompilationDiagnostic(staticScan.scannerErrors)) {
      throw new Error("COMPILATION_FAILED");
    }

    assertWithinTotalTimeout(startedAt, "post_scanner");

    const warnings = [...pasteWarnings, ...sourceWarnings, ...staticScan.warnings];
    const partialReasons: string[] = [];

    if (staticScan.scannerErrors.length > 0) {
      partialReasons.push("PARTIAL_SCANNER_FAILURE");
    }

    const normalizedFindings = staticScan.findings.map((finding) => normalizeFinding(finding));

    const finalStatus: AnalysisStatus =
      partialReasons.length > 0
        ? "PARTIAL"
        : warnings.length > 0
          ? "DONE_WITH_WARNINGS"
          : "COMPLETED";

    assertWithinTotalTimeout(startedAt, "pre_report_generation");

    const { report, topSeverity } = await runWithStageTimeout({
      stage: "report_generation",
      timeoutMs: config.REPORT_GENERATION_TIMEOUT_MS,
      action: async () =>
        await buildReport({
          findings: normalizedFindings,
          warnings,
          scannerErrors: staticScan.scannerErrors,
          partialReasons,
          sourceBundle,
          onExtractingContractStructure: async () => {
            await setPipelineStage(analysis.id, "EXTRACTING_CONTRACT_STRUCTURE");
          },
          onRunningAIAudit: async () => {
            await setPipelineStage(analysis.id, "RUNNING_AI_AUDIT");
          },
          onGeneratingReport: async () => {
            await setPipelineStage(analysis.id, "GENERATING_REPORT");
          }
        })
    });

    assertWithinTotalTimeout(startedAt, "post_report_generation");

    const privateToken = randomToken();
    const privateTokenHash = hashPrivateToken(privateToken);

    await prisma.$transaction(
      async (tx) => {
        const createdReport = await tx.report.create({
          data: {
            analysisId: analysis.id,
            visibility: "PRIVATE",
            privateTokenHash,
            reportJson: report as unknown as Prisma.InputJsonValue,
            reportHash: report.reportHash,
            topSeverity: toPrismaSeverity(topSeverity)
          }
        });

        if (report.findings.length > 0) {
          await tx.finding.createMany({
            data: report.findings.map((finding) => ({
              reportId: createdReport.id,
              severity: toPrismaSeverity(finding.severity),
              title: finding.title,
              confidence: finding.confidence,
              needsManualCheck: finding.needsManualCheck,
              fingerprint: finding.fingerprint,
              locationJson: finding.evidence[0]
                ? ({
                    filePath: finding.evidence[0].filePath,
                    line: finding.evidence[0].line ?? null
                  } as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              evidenceJson: finding.evidence as unknown as Prisma.InputJsonValue,
              whyItMatters: finding.whyItMatters,
              fixDirection: finding.fixDirection
            }))
          });
        }

        await tx.analysisRequest.update({
          where: { id: analysis.id },
          data: {
            status: finalStatus,
            pipelineStage: null,
            errorCode: null
          }
        });
      },
      {
        timeout: 30000,
        maxWait: 10000
      }
    );

    assertWithinTotalTimeout(startedAt, "post_persistence");

    await cachePrivateToken(analysis.id, privateToken).catch(() => undefined);

    logInfo("Analysis processed", {
      analysisId: analysis.id,
      findings: report.findings.length,
      topSeverity,
      status: finalStatus
    });
  } catch (error) {
    const errorCode = resolveFailureErrorCode(error);

    logError("Analysis processing failed", {
      analysisId: analysis.id,
      error: error instanceof Error ? error.message : String(error),
      errorCode,
      timeoutStage: error instanceof AnalysisTimeoutError ? error.stage : undefined
    });

    await prisma.analysisRequest.update({
      where: { id: analysis.id },
      data: {
        status: "FAILED",
        pipelineStage: null,
        errorCode
      }
    });
  }
}
