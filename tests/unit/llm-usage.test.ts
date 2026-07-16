import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: {
      create: (args: unknown) => createMock(args)
    }
  }
}));

vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn()
}));

import { recordUsageFromResponse } from "@/lib/llm-usage";

describe("recordUsageFromResponse", () => {
  beforeEach(() => {
    createMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records prompt/completion tokens from a usage block", () => {
    recordUsageFromResponse({
      usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
      stage: "ai_audit",
      model: "claude-sonnet-4.5",
      analysisId: "a-1"
    });

    expect(createMock).toHaveBeenCalledOnce();
    const arg = createMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      analysisId: "a-1",
      stage: "ai_audit",
      model: "claude-sonnet-4.5",
      promptTokens: 1200,
      completionTokens: 340,
      totalTokens: 1540
    });
  });

  it("derives totalTokens when the provider omits it", () => {
    recordUsageFromResponse({
      usage: { prompt_tokens: 100, completion_tokens: 50 },
      stage: "exec_summary",
      model: "gpt-4.1-mini"
    });

    const arg = createMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.totalTokens).toBe(150);
    expect(arg.data.analysisId).toBeNull();
  });

  it("is a no-op when the usage block is absent", () => {
    recordUsageFromResponse({
      usage: undefined,
      stage: "exec_summary",
      model: "gpt-4.1-mini"
    });

    expect(createMock).not.toHaveBeenCalled();
  });
});
