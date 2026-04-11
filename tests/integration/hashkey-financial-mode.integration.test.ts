import { describe, expect, it } from "vitest";

import {
  authenticateWallet,
  createSession,
  uniqueCodeSnippet,
  waitForAnalysisTerminal,
  type HttpSession
} from "./setup/helpers";

interface ReportResponse {
  reportId: string;
  reportHash: string;
  report: {
    metadata: {
      inputType: string;
      reviewMode?: "STANDARD" | "DEFI_PAYFI";
      chainId: number;
      contractAddress?: string;
    };
    financialReview?: {
      mode: "DEFI_PAYFI";
      sections: Array<{
        category: string;
        label: string;
        riskLevel: string;
      }>;
      builderReport: {
        title: string;
        highlights: string[];
      };
      partnerReport: {
        title: string;
        highlights: string[];
      };
    };
  };
}

async function fetchReport(
  session: HttpSession,
  reportId: string,
  token: string | null
): Promise<{ status: number; body: ReportResponse }> {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const response = await session.getJson<ReportResponse>(`/api/v1/report/${reportId}${query}`);

  return {
    status: response.status,
    body: response.body
  };
}

describe("HashKey integration - financial mode and verified address", () => {
  it("returns DeFi/PayFi sections and both audience report views", async () => {
    const session = createSession({ ip: "198.51.172.20" });

    await authenticateWallet(session);

    const create = await session.postJson<{ analysisId?: string; error?: { code?: string; message?: string } }>(
      "/api/v1/analysis",
      {
        inputType: "PASTE_CODE",
        code: uniqueCodeSnippet("HashKeyFinancialMode"),
        chainId: 133,
        reviewMode: "DEFI_PAYFI"
      }
    );

    expect(create.status).toBe(202);
    expect(create.body.analysisId).toBeTruthy();

    const terminal = await waitForAnalysisTerminal(session, create.body.analysisId!);
    expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(terminal.status);
    expect(terminal.reportId).toBeTruthy();

    const report = await fetchReport(session, terminal.reportId!, terminal.privateToken);
    expect(report.status).toBe(200);
    expect(report.body.report.metadata.reviewMode).toBe("DEFI_PAYFI");
    expect(report.body.report.financialReview?.mode).toBe("DEFI_PAYFI");
    expect((report.body.report.financialReview?.sections || []).length).toBeGreaterThanOrEqual(7);
    expect(report.body.report.financialReview?.builderReport.title).toContain("Builder");
    expect(report.body.report.financialReview?.partnerReport.title).toContain("Partner");
    expect((report.body.report.financialReview?.builderReport.highlights || []).length).toBeGreaterThan(0);
    expect((report.body.report.financialReview?.partnerReport.highlights || []).length).toBeGreaterThan(0);
  });

  it("supports HashKey verified address flow on chainId 133", async () => {
    const session = createSession({ ip: "198.51.172.21" });

    await authenticateWallet(session);

    const create = await session.postJson<{ analysisId?: string; error?: { code?: string; message?: string } }>(
      "/api/v1/analysis",
      {
        inputType: "BASE_ADDRESS",
        address: "0x0000000000000000000000000000000000000001",
        chainId: 133,
        reviewMode: "DEFI_PAYFI"
      }
    );

    expect(create.status).toBe(202);
    expect(create.body.analysisId).toBeTruthy();

    const terminal = await waitForAnalysisTerminal(session, create.body.analysisId!);
    expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(terminal.status);
    expect(terminal.reportId).toBeTruthy();

    const report = await fetchReport(session, terminal.reportId!, terminal.privateToken);
    expect(report.status).toBe(200);
    expect(report.body.report.metadata.chainId).toBe(133);
    expect(report.body.report.metadata.inputType).toBe("BASE_ADDRESS");
    expect(report.body.report.metadata.reviewMode).toBe("DEFI_PAYFI");
    expect(report.body.report.financialReview?.sections.length).toBeGreaterThan(0);
  });
});
