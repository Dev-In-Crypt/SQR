import { z } from "zod";

import type { AIAuditFinding, Finding, SourceBundle } from "@/lib/types";
import { config } from "@/lib/config";
import { logError } from "@/lib/logger";
import { describeAnalysisNote } from "@/lib/partial-reasons";
import { getExecutiveSummarySystemPrompt, getSmartContractAuditSystemPrompt } from "@/lib/prompt-provider";

function localExecutiveSummary(findings: Finding[], partialReasons: string[]): string {
  if (findings.length === 0) {
    return "No critical issues were detected by the active static checks. Manual review is still recommended before production deployment.";
  }

  const severityCount = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, {});

  const ordered = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
    .filter((severity) => severityCount[severity])
    .map((severity) => `${severity}: ${severityCount[severity]}`)
    .join(", ");

  const readableReasons = partialReasons.map((reason) => describeAnalysisNote(reason));
  const partial =
    readableReasons.length > 0
      ? ` Partial analysis notes: ${readableReasons.join("; ")}.`
      : "";

  return `The analysis detected ${findings.length} findings (${ordered}). Focus first on control-flow and authorization risks, then validate external call safety and upgrade assumptions.${partial}`;
}

const aiAuditFindingSchema = z.object({
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(4000),
  evidence: z.string().trim().min(1).max(4000),
  fixDirection: z.string().trim().min(1).max(1000)
});

const aiAuditArrayResponseSchema = z.array(aiAuditFindingSchema);
const aiAuditObjectResponseSchema = z.object({
  findings: z.array(aiAuditFindingSchema).default([])
});

function openAiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.OPENAI_API_KEY}`
  };

  if (config.OPENAI_HTTP_REFERER) {
    headers["HTTP-Referer"] = config.OPENAI_HTTP_REFERER;
  }

  if (config.OPENAI_APP_NAME) {
    headers["X-Title"] = config.OPENAI_APP_NAME;
  }

  return headers;
}

function openAiEndpoint(): string {
  const baseUrl = config.OPENAI_BASE_URL.replace(/\/$/, "");
  return `${baseUrl}/chat/completions`;
}

function maybeStripJsonCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function toAIAuditFindings(payload: unknown): AIAuditFinding[] {
  const arrayParsed = aiAuditArrayResponseSchema.safeParse(payload);
  if (arrayParsed.success) {
    return arrayParsed.data.map((finding) => ({
      ...finding,
      source: "ai"
    }));
  }

  const objectParsed = aiAuditObjectResponseSchema.safeParse(payload);
  if (!objectParsed.success) {
    return [];
  }

  return objectParsed.data.findings.map((finding) => ({
    ...finding,
    source: "ai"
  }));
}

export async function generateExecutiveSummary(params: {
  findings: Finding[];
  partialReasons: string[];
}): Promise<string> {
  const { findings, partialReasons } = params;

  if (!config.OPENAI_API_KEY) {
    return localExecutiveSummary(findings, partialReasons);
  }

  const payload = {
    model: config.OPENAI_MODEL,
    temperature: config.OPENAI_TEMPERATURE,
    messages: [
      {
        role: "system",
        content: getExecutiveSummarySystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify({
          findings: findings.map((finding) => ({
            title: finding.title,
            severity: finding.severity,
            evidence: finding.evidence,
            needsManualCheck: finding.needsManualCheck
          })),
          partialReasons
        })
      }
    ]
  };
  const endpoint = openAiEndpoint();
  const headers = openAiHeaders();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      logError("LLM request failed", { status: response.status, body, endpoint });
      return localExecutiveSummary(findings, partialReasons);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return localExecutiveSummary(findings, partialReasons);
    }

    return content;
  } catch (error) {
    logError("LLM request exception", {
      message: error instanceof Error ? error.message : String(error),
      endpoint
    });
    return localExecutiveSummary(findings, partialReasons);
  }
}

export async function generateAIAuditFindings(params: {
  sourceBundle: SourceBundle;
  scannerFindings: Finding[];
  warnings: string[];
  scannerErrors: string[];
  partialReasons: string[];
}): Promise<AIAuditFinding[]> {
  if (!config.OPENAI_API_KEY) {
    return [];
  }

  const sourceMeta = params.sourceBundle.sourceMeta || {};
  const sourceCode = params.sourceBundle.files.map((file) => ({
    path: file.path,
    content: file.content
  }));

  const payload = {
    model: config.OPENAI_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: getSmartContractAuditSystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify({
          instructions: {
            returnJson: true,
            format: [
              {
                severity: "CRITICAL|HIGH|MEDIUM|LOW|INFO",
                title: "string",
                location: "string",
                explanation: "string",
                evidence: "string",
                fixDirection: "string",
                source: "ai"
              }
            ],
            mustUseEvidence: true,
            omitUncertainFindings: true,
            ifNone: []
          },
          input: {
            source: {
              inputType: params.sourceBundle.inputType,
              chainId: params.sourceBundle.chainId,
              contractAddress: params.sourceBundle.contractAddress || null,
              pragma: typeof sourceMeta.solidityPragma === "string" ? sourceMeta.solidityPragma : null,
              pragmaFilePath:
                typeof sourceMeta.solidityPragmaFilePath === "string" ? sourceMeta.solidityPragmaFilePath : null,
              pragmaParseError:
                typeof sourceMeta.solidityPragmaParseError === "string"
                  ? sourceMeta.solidityPragmaParseError
                  : null,
              files: sourceCode
            },
            scanner: {
              findings: params.scannerFindings.map((finding) => ({
                title: finding.title,
                severity: finding.severity,
                whyItMatters: finding.whyItMatters,
                fixDirection: finding.fixDirection,
                evidence: finding.evidence,
                confidence: finding.confidence,
                needsManualCheck: finding.needsManualCheck
              })),
              warnings: params.warnings,
              scannerErrors: params.scannerErrors,
              partialReasons: params.partialReasons,
              partialReasonText: params.partialReasons.map((reason) => describeAnalysisNote(reason))
            }
          }
        })
      }
    ]
  };

  const endpoint = openAiEndpoint();
  const headers = openAiHeaders();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      logError("AI audit request failed", { status: response.status, body, endpoint });
      return [];
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return [];
    }

    const normalized = maybeStripJsonCodeFence(content);
    try {
      const parsed = JSON.parse(normalized) as unknown;
      return toAIAuditFindings(parsed);
    } catch {
      logError("AI audit response was not valid JSON", {
        endpoint,
        preview: normalized.slice(0, 300)
      });
      return [];
    }
  } catch (error) {
    logError("AI audit request exception", {
      message: error instanceof Error ? error.message : String(error),
      endpoint
    });
    return [];
  }
}
