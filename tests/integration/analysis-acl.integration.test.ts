import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashCanonical } from "@/lib/hash";
import {
  authenticateWallet,
  createPasteAnalysisAndWait,
  createSession,
  prismaForTests,
  uniqueCodeSnippet,
  type HttpSession
} from "./setup/helpers";

import type { PrismaClient } from "@prisma/client";

type ReportResponse = {
  reportId: string;
  visibility: "PRIVATE" | "PUBLIC";
  reportHash: string;
  isOwner: boolean;
  report: {
    executiveSummary: string;
    scannerSummary?: string;
    findings: unknown[];
    aiAuditFindings?: unknown[];
    metadata: {
      analyzerVersion: string;
      [key: string]: unknown;
    };
    scannerErrors: string[];
    partialReasons: string[];
    reportHash?: string;
    [key: string]: unknown;
  };
  error?: { code: string; message: string };
};

function reportPath(reportId: string, token: string | null): string {
  return token
    ? `/api/v1/report/${reportId}?token=${encodeURIComponent(token)}`
    : `/api/v1/report/${reportId}`;
}

async function fetchReport(
  session: HttpSession,
  reportId: string,
  token: string | null
): Promise<{ status: number; body: ReportResponse }> {
  const response = await session.getJson<ReportResponse>(reportPath(reportId, token));
  return {
    status: response.status,
    body: response.body
  };
}

describe("API integration - analysis, ACL, visibility, share links", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = prismaForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("analysis lifecycle creates report and returns schema-shaped payload", async () => {
    const session = createSession({ ip: "198.51.100.10" });
    const created = await createPasteAnalysisAndWait(session);

    const report = await fetchReport(session, created.reportId, created.privateToken);

    expect(report.status).toBe(200);
    expect(report.body.reportId).toBe(created.reportId);
    expect(report.body.reportHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typeof report.body.report.executiveSummary).toBe("string");
    expect(typeof report.body.report.scannerSummary).toBe("string");
    expect(Array.isArray(report.body.report.findings)).toBe(true);
    expect(Array.isArray(report.body.report.aiAuditFindings ?? [])).toBe(true);
    expect(["PRIVATE", "PUBLIC"]).toContain(report.body.visibility);
  });

  it("create analysis is idempotent for same payload within window", async () => {
    const session = createSession({ ip: "198.51.100.11" });
    const code = uniqueCodeSnippet("Idempotency");

    const first = await session.postJson<{
      analysisId?: string;
      status?: string;
      inputHash?: string;
      error?: { code: string; message: string };
    }>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code,
      chainId: 8453
    });

    const second = await session.postJson<{
      analysisId?: string;
      status?: string;
      inputHash?: string;
      error?: { code: string; message: string };
    }>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code,
      chainId: 8453
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.analysisId).toBeTruthy();
    expect(second.body.analysisId).toBe(first.body.analysisId);
    expect(second.body.status).toBe("EXISTING");

    const count = await prisma.analysisRequest.count({
      where: {
        inputHash: first.body.inputHash
      }
    });
    expect(count).toBe(1);
  });

  it("private-by-link ACL denies without token and allows with share token", async () => {
    const owner = createSession({ ip: "198.51.100.12" });
    const outsider = createSession({ ip: "198.51.100.13" });

    const created = await createPasteAnalysisAndWait(owner);

    const denied = await fetchReport(outsider, created.reportId, null);
    expect(denied.status).toBe(403);

    const share = await owner.postJson<{
      token?: string;
      url?: string;
      error?: { code: string; message: string };
    }>(`/api/v1/report/${created.reportId}/share-token`, {});

    expect(share.status).toBe(200);
    expect(share.body.token).toMatch(/^[0-9a-f]{64}$/);

    const allowed = await fetchReport(outsider, created.reportId, share.body.token || null);
    expect(allowed.status).toBe(200);
  });

  it("visibility toggle flips public/private read access as expected", async () => {
    const owner = createSession({ ip: "198.51.100.14" });
    const outsider = createSession({ ip: "198.51.100.15" });

    const created = await createPasteAnalysisAndWait(owner);

    const makePublic = await owner.postJson<{
      ok?: boolean;
      visibility?: "PRIVATE" | "PUBLIC";
      error?: { code: string; message: string };
    }>(`/api/v1/report/${created.reportId}/visibility`, {
      visibility: "PUBLIC"
    });
    expect(makePublic.status).toBe(200);
    expect(makePublic.body.visibility).toBe("PUBLIC");

    const publicRead = await fetchReport(outsider, created.reportId, null);
    expect(publicRead.status).toBe(200);

    const makePrivate = await owner.postJson<{
      ok?: boolean;
      visibility?: "PRIVATE" | "PUBLIC";
      error?: { code: string; message: string };
    }>(`/api/v1/report/${created.reportId}/visibility`, {
      visibility: "PRIVATE"
    });
    expect(makePrivate.status).toBe(200);
    expect(makePrivate.body.visibility).toBe("PRIVATE");

    const denied = await fetchReport(outsider, created.reportId, null);
    expect(denied.status).toBe(403);
  });

  it("share token rotation invalidates the old token", async () => {
    const owner = createSession({ ip: "198.51.100.16" });
    const outsider = createSession({ ip: "198.51.100.17" });

    const created = await createPasteAnalysisAndWait(owner);

    const firstTokenResponse = await owner.postJson<{
      token?: string;
      error?: { code: string; message: string };
    }>(`/api/v1/report/${created.reportId}/share-token`, {});

    const secondTokenResponse = await owner.postJson<{
      token?: string;
      error?: { code: string; message: string };
    }>(`/api/v1/report/${created.reportId}/share-token`, {});

    expect(firstTokenResponse.status).toBe(200);
    expect(secondTokenResponse.status).toBe(200);
    expect(firstTokenResponse.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(secondTokenResponse.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(firstTokenResponse.body.token).not.toBe(secondTokenResponse.body.token);

    const oldTokenRead = await fetchReport(
      outsider,
      created.reportId,
      firstTokenResponse.body.token || null
    );
    expect(oldTokenRead.status).toBe(403);

    const newTokenRead = await fetchReport(
      outsider,
      created.reportId,
      secondTokenResponse.body.token || null
    );
    expect(newTokenRead.status).toBe(200);
  });

  it("markdown export mirrors report ACL and rejects unknown formats", async () => {
    const owner = createSession({ ip: "198.51.100.20" });
    const outsider = createSession({ ip: "198.51.100.21" });

    const created = await createPasteAnalysisAndWait(owner);
    const exportPath = (token: string | null, format = "md") =>
      `/api/v1/report/${created.reportId}/export?format=${format}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

    // Owner: 200 markdown attachment.
    const ownerExport = await owner.request(exportPath(null));
    expect(ownerExport.status).toBe(200);
    expect(ownerExport.headers.get("content-type")).toContain("text/markdown");
    expect(await ownerExport.text()).toContain("# Security Review Memo");

    // Stranger without token: 403.
    const denied = await outsider.request(exportPath(null));
    expect(denied.status).toBe(403);

    // Stranger with share token: 200.
    const share = await owner.postJson<{ token?: string }>(
      `/api/v1/report/${created.reportId}/share-token`,
      {}
    );
    const shared = await outsider.request(exportPath(share.body.token || null));
    expect(shared.status).toBe(200);

    // Unsupported format: 400.
    const pdf = await owner.request(exportPath(null, "pdf"));
    expect(pdf.status).toBe(400);
  });

  it("reportHash is deterministic for same input and stored hash matches API hash", async () => {
    const code = uniqueCodeSnippet("HashDeterminism");

    const ownerA = createSession({ ip: "198.51.100.18" });
    const ownerB = createSession({ ip: "198.51.100.19" });

    await authenticateWallet(ownerA);
    await authenticateWallet(ownerB);

    const first = await createPasteAnalysisAndWait(ownerA, code);
    const second = await createPasteAnalysisAndWait(ownerB, code);

    const firstReport = await fetchReport(ownerA, first.reportId, first.privateToken);
    const secondReport = await fetchReport(ownerB, second.reportId, second.privateToken);

    expect(firstReport.status).toBe(200);
    expect(secondReport.status).toBe(200);
    expect(firstReport.body.reportHash).toBe(secondReport.body.reportHash);

    const dbReport = await prisma.report.findUnique({
      where: {
        id: first.reportId
      }
    });

    expect(dbReport?.reportHash).toBe(firstReport.body.reportHash);

    const mutatedHash = hashCanonical({
      ...(firstReport.body.report as Record<string, unknown>),
      metadata: {
        ...(firstReport.body.report.metadata as Record<string, unknown>),
        analyzerVersion: `${firstReport.body.report.metadata.analyzerVersion}-alt`
      }
    });

    expect(mutatedHash).not.toBe(firstReport.body.reportHash);
  });
});
