import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
  createPasteAnalysisAndWait,
  createSession,
  prismaForTests,
  readMintedEventFromTx,
  sendPreparedReceiptMint,
  uniqueCodeSnippet
} from "./setup/helpers";

describe("API integration - receipt prepare/confirm", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = prismaForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prepare returns deterministic tx payload and confirm is idempotent", async () => {
    const session = createSession({ ip: "198.51.100.40" });
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptFlow"));

    const reportBefore = await session.getJson<{
      reportHash: string;
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(reportBefore.status).toBe(200);

    const prepare1 = await session.postJson<{
      existing?: boolean;
      tx?: {
        to: `0x${string}`;
        data: `0x${string}`;
        chainId: number;
        args: {
          reportHash: `0x${string}`;
          contractAddress: `0x${string}`;
          analyzerVersionHash: `0x${string}`;
        };
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    const prepare2 = await session.postJson<{
      existing?: boolean;
      tx?: {
        to: `0x${string}`;
        data: `0x${string}`;
        chainId: number;
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    expect(prepare1.status).toBe(200);
    expect(prepare2.status).toBe(200);
    expect(prepare1.body.existing).toBe(false);
    expect(prepare2.body.existing).toBe(false);
    expect(prepare1.body.tx?.to).toBe(prepare2.body.tx?.to);
    expect(prepare1.body.tx?.data).toBe(prepare2.body.tx?.data);

    const tx = prepare1.body.tx;
    expect(tx).toBeTruthy();

    const txHash = await sendPreparedReceiptMint({
      to: tx!.to,
      data: tx!.data,
      chainId: tx!.chainId
    });

    const event = await readMintedEventFromTx(txHash);
    expect(event).not.toBeNull();

    const confirm1 = await session.postJson<{
      existing?: boolean;
      receipt?: {
        txHash: string;
        reportHash: string;
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash
    });

    expect(confirm1.status).toBe(200);
    expect(confirm1.body.existing).toBe(false);
    expect(confirm1.body.receipt?.txHash.toLowerCase()).toBe(txHash.toLowerCase());

    const confirm2 = await session.postJson<{
      existing?: boolean;
      receipt?: {
        txHash: string;
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash
    });

    expect(confirm2.status).toBe(200);
    expect(confirm2.body.existing).toBe(true);
    expect(confirm2.body.receipt?.txHash.toLowerCase()).toBe(txHash.toLowerCase());

    const reportAfter = await session.getJson<{
      reportHash: string;
      receipt: {
        txHash: string;
        reportHash: string;
      } | null;
      error?: { code: string; message: string };
    }>(
      `/api/v1/report/${created.reportId}${
        created.privateToken ? `?token=${encodeURIComponent(created.privateToken)}` : ""
      }`
    );

    expect(reportAfter.status).toBe(200);
    expect(reportAfter.body.receipt).not.toBeNull();
    expect(reportAfter.body.receipt?.txHash.toLowerCase()).toBe(txHash.toLowerCase());
    expect(event?.reportHash.toLowerCase()).toBe(reportAfter.body.reportHash.toLowerCase());

    const dbReceipt = await prisma.receipt.findUnique({
      where: {
        reportId: created.reportId
      }
    });
    expect(dbReceipt?.reportHash.toLowerCase()).toBe(event?.reportHash.toLowerCase());
  });

  it("confirm rejects tx hash that belongs to a different report hash", async () => {
    const session = createSession({ ip: "198.51.100.41" });

    const reportA = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptA"));
    const reportB = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptB"));

    const prepareA = await session.postJson<{
      tx?: {
        to: `0x${string}`;
        data: `0x${string}`;
        chainId: number;
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportA.reportId}/prepare`, {});

    expect(prepareA.status).toBe(200);
    expect(prepareA.body.tx).toBeTruthy();

    const txHash = await sendPreparedReceiptMint({
      to: prepareA.body.tx!.to,
      data: prepareA.body.tx!.data,
      chainId: prepareA.body.tx!.chainId
    });

    const confirmA = await session.postJson<{
      existing?: boolean;
      receipt?: { txHash: string };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportA.reportId}/confirm`, {
      txHash
    });

    expect(confirmA.status).toBe(200);

    const mismatch = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportB.reportId}/confirm`, {
      txHash
    });

    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error?.code).toBe("HASH_MISMATCH");
  });

  it("confirm validates txHash shape", async () => {
    const session = createSession({ ip: "198.51.100.42" });
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptBadHash"));

    const invalid = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: "not-a-hash"
    });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe("INVALID_PAYLOAD");
  });
});
