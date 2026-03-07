import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  authenticateWallet,
  createPasteAnalysisAndWait,
  createSession,
  sendSignedPreparedReceiptMint,
  testChain,
  uniqueCodeSnippet,
  type PreparedMintPayload
} from "./setup/helpers";

function mutateSignature(signature: Hex): Hex {
  if (signature.length < 6) {
    return "0x12";
  }

  const tail = signature.slice(-2).toLowerCase();
  const replacement = tail === "ff" ? "00" : "ff";
  return `${signature.slice(0, -2)}${replacement}` as Hex;
}

describe("API integration - receipt negatives", () => {
  it("prepare returns OWNER_MISMATCH for authenticated non-owner wallet", async () => {
    const owner = createSession({ ip: "198.51.102.10" });
    const outsider = createSession({ ip: "198.51.102.11" });

    await authenticateWallet(owner);
    await authenticateWallet(outsider);

    const created = await createPasteAnalysisAndWait(owner, uniqueCodeSnippet("PrepareOwner"));

    const blocked = await outsider.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    expect(blocked.status).toBe(403);
    expect(blocked.body.error?.code).toBe("OWNER_MISMATCH");
  });

  it("confirm rejects owner mismatch before chain calls", async () => {
    const session = createSession({ ip: "198.51.102.12" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("OwnerMismatch"));

    const wrongOwner = `0x${"11".repeat(20)}`;

    const confirm = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: `0x${"ab".repeat(32)}`,
      owner: wrongOwner,
      nonce: "0",
      deadline: "1",
      signature: "0x12"
    });

    expect(confirm.status).toBe(403);
    expect(confirm.body.error?.code).toBe("OWNER_MISMATCH");
    expect(auth.walletAddress.toLowerCase()).not.toBe(wrongOwner.toLowerCase());
  });

  it("confirm rejects invalid signature when tx/event are valid", async () => {
    const session = createSession({ ip: "198.51.102.13" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("InvalidSig"));

    const prepare = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    expect(prepare.status).toBe(200);
    expect(prepare.body.call).toBeTruthy();
    expect(prepare.body.typedData).toBeTruthy();

    const prepared = {
      typedData: prepare.body.typedData!,
      call: prepare.body.call!
    };

    const minted = await sendSignedPreparedReceiptMint({
      prepared,
      ownerPrivateKey: auth.privateKey
    });

    const tamperedSignature = mutateSignature(minted.signature);

    const confirm = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature: tamperedSignature
    });

    expect(confirm.status).toBe(400);
    expect(confirm.body.error?.code).toBe("INVALID_SIGNATURE");
  });

  it("confirm rejects tx receipts that do not emit ReceiptMinted", async () => {
    const session = createSession({ ip: "198.51.102.14" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("EventMismatch"));

    const chain = testChain();
    const rpcUrl = process.env.SQR_TEST_RPC_URL as string;
    const submitter = privateKeyToAccount(process.env.SQR_TEST_MINT_PRIVATE_KEY as Hex);
    const walletClient = createWalletClient({
      account: submitter,
      chain,
      transport: http(rpcUrl)
    });
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl)
    });

    const txHash = await walletClient.sendTransaction({
      to: submitter.address,
      value: 0n
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const confirm = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash,
      owner: auth.walletAddress,
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 600),
      signature: "0x12"
    });

    expect(confirm.status).toBe(400);
    expect(confirm.body.error?.code).toBe("MINT_EVENT_NOT_FOUND");
  });

  it("confirm rejects tx hash not found on required network", async () => {
    const session = createSession({ ip: "198.51.102.15" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("NotFoundNetwork"));

    const confirm = await session.postJson<{
      error?: { code: string; message: string };
    }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: `0x${"cd".repeat(32)}`,
      owner: auth.walletAddress,
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 600),
      signature: "0x12"
    });

    expect(confirm.status).toBe(400);
    expect(confirm.body.error?.code).toBe("TX_NOT_FOUND_REQUIRED_NETWORK");
  });
});
