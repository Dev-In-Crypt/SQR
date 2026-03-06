import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";
import type { Address } from "viem";

import {
  authenticateWallet,
  createPasteAnalysisAndWait,
  createSession,
  prismaForTests,
  readMintedEventFromTx,
  sendSignedPreparedReceiptMint,
  uniqueCodeSnippet,
  type PreparedMintPayload
} from "./setup/helpers";

describe("API integration - receipt prepare/confirm", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = prismaForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prepare returns typed data and confirm verifies owner signature with idempotent persistence", async () => {
    const session = createSession({ ip: "198.51.100.40" });
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptFlow"));
    const auth = await authenticateWallet(session);

    const prepare1 = await session.postJson<{
      existing?: boolean;
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    const prepare2 = await session.postJson<{
      existing?: boolean;
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    expect(prepare1.status).toBe(200);
    expect(prepare2.status).toBe(200);
    expect(prepare1.body.existing).toBe(false);
    expect(prepare2.body.existing).toBe(false);

    const prepared = {
      typedData: prepare1.body.typedData!,
      call: prepare1.body.call!
    };

    expect(prepared.call.functionName).toBe("mintWithSig");
    expect(prepared.typedData.domain.verifyingContract.toLowerCase()).toBe(prepared.call.to.toLowerCase());
    expect(prepared.typedData.message.owner.toLowerCase()).toBe(auth.walletAddress.toLowerCase());
    expect(prepared.typedData.message.reportHash.toLowerCase()).toBe(prepared.call.args.reportHash.toLowerCase());

    const { txHash, signature } = await sendSignedPreparedReceiptMint({
      prepared,
      ownerPrivateKey: auth.privateKey
    });

    const event = await readMintedEventFromTx(txHash);
    expect(event).not.toBeNull();

    const confirm1 = await session.postJson<{
      existing?: boolean;
      receipt?: {
        txHash: string;
        reportHash: string;
        receiptOwner: string;
        receiptMinter: string;
      };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature
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
      txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature
    });

    expect(confirm2.status).toBe(200);
    expect(confirm2.body.existing).toBe(true);
    expect(confirm2.body.receipt?.txHash.toLowerCase()).toBe(txHash.toLowerCase());

    const reportAfter = await session.getJson<{
      reportHash: string;
      receipt: {
        txHash: string;
        reportHash: string;
        receiptOwner: string;
        receiptMinter: string;
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
    expect(dbReceipt?.receiptOwner?.toLowerCase()).toBe((event?.owner as Address)?.toLowerCase());
    expect(dbReceipt?.receiptMinter?.toLowerCase()).toBe((event?.minter as Address)?.toLowerCase());
  });

  it("confirm rejects tx hash that belongs to a different report hash", async () => {
    const session = createSession({ ip: "198.51.100.41" });
    const auth = await authenticateWallet(session);

    const reportA = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptA"));
    const reportB = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptB"));

    const prepareA = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportA.reportId}/prepare`, {});

    expect(prepareA.status).toBe(200);
    expect(prepareA.body.call).toBeTruthy();
    expect(prepareA.body.typedData).toBeTruthy();

    const preparedA = {
      typedData: prepareA.body.typedData!,
      call: prepareA.body.call!
    };

    const { txHash, signature } = await sendSignedPreparedReceiptMint({
      prepared: preparedA,
      ownerPrivateKey: auth.privateKey
    });

    const confirmA = await session.postJson<{
      existing?: boolean;
      receipt?: { txHash: string };
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportA.reportId}/confirm`, {
      txHash,
      owner: preparedA.call.args.owner,
      nonce: preparedA.call.args.nonce,
      deadline: preparedA.call.args.deadline,
      signature
    });

    expect(confirmA.status).toBe(200);

    const mismatch = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${reportB.reportId}/confirm`, {
      txHash,
      owner: preparedA.call.args.owner,
      nonce: preparedA.call.args.nonce,
      deadline: preparedA.call.args.deadline,
      signature
    });

    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error?.code).toBe("HASH_MISMATCH");
  });

  it("confirm rejects tx hash not found on required network", async () => {
    const session = createSession({ ip: "198.51.100.43" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptWrongNetwork"));

    const prepare = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    expect(prepare.status).toBe(200);
    expect(prepare.body.call).toBeTruthy();

    const notFoundTxHash = `0x${"ab".repeat(32)}`;
    const confirm = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: notFoundTxHash,
      owner: auth.walletAddress,
      nonce: prepare.body.call!.args.nonce,
      deadline: prepare.body.call!.args.deadline,
      signature: "0x12"
    });

    expect(confirm.status).toBe(400);
    expect(confirm.body.error?.code).toBe("TX_NOT_FOUND_REQUIRED_NETWORK");
    expect(confirm.body.error?.message).toContain("tx not found on required network");
  });
  it("confirm validates payload shape", async () => {
    const session = createSession({ ip: "198.51.100.42" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ReceiptBadHash"));

    const invalid = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: "not-a-hash",
      owner: auth.walletAddress,
      nonce: "0",
      deadline: "1",
      signature: "0x1234"
    });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe("INVALID_PAYLOAD");
  });
});

