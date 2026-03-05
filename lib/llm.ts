import type { Finding } from "@/lib/types";
import { config } from "@/lib/config";
import { logError } from "@/lib/logger";
import { describeAnalysisNote } from "@/lib/partial-reasons";

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
        content:
          "You are a Solidity security reviewer. Write a concise 5-10 line executive summary only from provided findings. Never invent issues. Mention uncertainty when applicable."
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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      logError("LLM request failed", { status: response.status, body });
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
      message: error instanceof Error ? error.message : String(error)
    });
    return localExecutiveSummary(findings, partialReasons);
  }
}
