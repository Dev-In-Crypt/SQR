import { describe, expect, it } from "vitest";

import { resolveAnalysisErrorDetails } from "@/lib/ui-error-messages";

describe("analysis error message mapping", () => {
  it("maps source_unverified to contract not verified", () => {
    const details = resolveAnalysisErrorDetails("SOURCE_UNVERIFIED");

    expect(details.title).toBe("Contract not verified");
    expect(details.category).toBe("CONTRACT_NOT_VERIFIED");
  });

  it("maps source retrieval provider codes", () => {
    const details = resolveAnalysisErrorDetails("BASESCAN_TIMEOUT");

    expect(details.title).toBe("Source retrieval error");
    expect(details.category).toBe("SOURCE_RETRIEVAL_ERROR");
  });

  it("maps dynamic provider http codes to source retrieval error", () => {
    const details = resolveAnalysisErrorDetails("SOURCIFY_HTTP_504");

    expect(details.title).toBe("Source retrieval error");
    expect(details.category).toBe("SOURCE_RETRIEVAL_ERROR");
  });

  it("maps compilation_failed to compilation failure", () => {
    const details = resolveAnalysisErrorDetails("COMPILATION_FAILED");

    expect(details.title).toBe("Compilation failure");
    expect(details.category).toBe("COMPILATION_FAILURE");
  });

  it("maps timeout-like codes to analysis timeout", () => {
    const details = resolveAnalysisErrorDetails("ANALYSIS_TIMEOUT");

    expect(details.title).toBe("Analysis timeout");
    expect(details.category).toBe("ANALYSIS_TIMEOUT");
  });

  it("falls back to internal processing error", () => {
    const details = resolveAnalysisErrorDetails("UNKNOWN_STATUS_CODE");

    expect(details.title).toBe("Internal processing error");
    expect(details.category).toBe("INTERNAL_PROCESSING_ERROR");
  });
});
