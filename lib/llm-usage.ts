import { prisma } from "@/lib/db";
import { logInfo, logWarn } from "@/lib/logger";

export type LlmStage = "exec_summary" | "ai_audit";

export interface LlmUsageEntry {
  analysisId?: string | null;
  stage: LlmStage;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

/**
 * Records one LLM call's token usage. Always logs (stdout, captured by
 * journald in prod); persists fire-and-forget so a DB hiccup — or a call from
 * a script with no DB — never blocks or fails the pipeline.
 */
export function recordLlmUsage(entry: LlmUsageEntry): void {
  logInfo("llm usage", { ...entry });

  void prisma.llmUsage
    .create({
      data: {
        analysisId: entry.analysisId ?? null,
        stage: entry.stage,
        model: entry.model,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.totalTokens ?? entry.promptTokens + entry.completionTokens
      }
    })
    .catch((error) => {
      logWarn("llm usage persist failed", {
        stage: entry.stage,
        error: error instanceof Error ? error.message : String(error)
      });
    });
}

type UsageBlock = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Reads the OpenAI/OpenRouter `usage` block from a chat-completions response
 * and records it. No-op when the field is absent.
 */
export function recordUsageFromResponse(params: {
  usage: UsageBlock | undefined;
  stage: LlmStage;
  model: string;
  analysisId?: string | null;
}): void {
  const { usage } = params;
  if (!usage || (usage.prompt_tokens === undefined && usage.completion_tokens === undefined)) {
    return;
  }

  recordLlmUsage({
    analysisId: params.analysisId,
    stage: params.stage,
    model: params.model,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens
  });
}
