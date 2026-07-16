import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalletClient, http, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

import {
  createSession,
  createPasteAnalysisAndWait,
  prismaForTests,
  testChain,
  uniqueCodeSnippet,
  waitForAnalysisTerminal,
  type HttpSession
} from "./setup/helpers";

const PAID_ENDPOINT = "/api/v1/analysis/paid";
const PRICE_MICRO_USDC = 5_000_000n;
const SESSION_COOKIE = "sqr_session";

function facilitatorUrl(): string {
  const url = process.env.SQR_TEST_FACILITATOR_URL;
  if (!url) {
    throw new Error("SQR_TEST_FACILITATOR_URL is not set (facilitator stub missing)");
  }
  return url;
}

async function facilitatorStats(): Promise<{ verifyCalls: number; settleCalls: number }> {
  const response = await fetch(`${facilitatorUrl()}/__stats`);
  return (await response.json()) as { verifyCalls: number; settleCalls: number };
}

async function setFacilitatorMode(mode: "ok" | "verify-invalid" | "settle-fail"): Promise<void> {
  const response = await fetch(`${facilitatorUrl()}/__mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode })
  });
  expect(response.status).toBe(200);
}

function paymentWalletClient() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: testChain(),
    transport: http(process.env.SQR_TEST_RPC_URL!)
  }).extend(publicActions);
  return { account, client };
}

function paidFetch(session: HttpSession, client: ReturnType<typeof paymentWalletClient>["client"]) {
  return wrapFetchWithPayment(
    session.fetchLike(),
    client as Parameters<typeof wrapFetchWithPayment>[1],
    PRICE_MICRO_USDC
  );
}

function paidPayloadInit(code: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputType: "PASTE_CODE", code, chainId: 8453 })
  };
}

async function sessionId(session: HttpSession): Promise<string> {
  await session.getJson("/api/v1/session");
  const value = session.cookie(SESSION_COOKIE);
  expect(value).toBeTruthy();
  return value!;
}

describe("API integration - x402 paid analyses", () => {
  const prisma = prismaForTests();

  beforeAll(async () => {
    await setFacilitatorMode("ok");
  });

  afterAll(async () => {
    await setFacilitatorMode("ok");
    await prisma.$disconnect();
  });

  it("returns a 402 challenge with exact x402 requirements when no payment is attached", async () => {
    const session = createSession({ ip: "203.0.113.60" });
    const statsBefore = await facilitatorStats();

    const response = await session.request(PAID_ENDPOINT, paidPayloadInit(uniqueCodeSnippet("PaidChallenge")));
    expect(response.status).toBe(402);

    const body = (await response.json()) as {
      accepts?: Array<{
        scheme?: string;
        network?: string;
        maxAmountRequired?: string;
        payTo?: string;
      }>;
    };

    expect(body.accepts?.length).toBeGreaterThan(0);
    const requirement = body.accepts![0];
    expect(requirement.scheme).toBe("exact");
    expect(requirement.network).toBe("base");
    expect(requirement.maxAmountRequired).toBe(PRICE_MICRO_USDC.toString());
    expect(requirement.payTo?.toLowerCase()).toBe("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");

    const statsAfter = await facilitatorStats();
    expect(statsAfter.verifyCalls).toBe(statsBefore.verifyCalls);
    expect(statsAfter.settleCalls).toBe(statsBefore.settleCalls);
  });

  it("settles a payment, records it, and consumes it when the report is delivered", async () => {
    const session = createSession({ ip: "203.0.113.61" });
    const { account, client } = paymentWalletClient();
    const statsBefore = await facilitatorStats();

    const fetchWithPayment = paidFetch(session, client);
    const response = await fetchWithPayment(PAID_ENDPOINT, paidPayloadInit(uniqueCodeSnippet("PaidHappy")));

    expect(response.status).toBe(202);
    const body = (await response.json()) as { analysisId?: string; paid?: boolean };
    expect(body.analysisId).toBeTruthy();
    expect(body.paid).toBe(true);

    const statsAfter = await facilitatorStats();
    expect(statsAfter.verifyCalls).toBe(statsBefore.verifyCalls + 1);
    expect(statsAfter.settleCalls).toBe(statsBefore.settleCalls + 1);

    const payment = await prisma.payment.findUnique({ where: { analysisId: body.analysisId! } });
    expect(payment).not.toBeNull();
    expect(payment!.payer).toBe(account.address.toLowerCase());
    expect(payment!.amountMicroUsdc).toBe(PRICE_MICRO_USDC);
    expect(payment!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(payment!.status).toBe("SETTLED");

    await waitForAnalysisTerminal(session, body.analysisId!);

    const settled = await prisma.payment.findUnique({ where: { analysisId: body.analysisId! } });
    expect(settled!.status).toBe("CONSUMED");
  });

  it("returns 409 without settling when a recent identical report exists", async () => {
    const session = createSession({ ip: "203.0.113.62" });
    const code = uniqueCodeSnippet("PaidDuplicate");

    const existing = await createPasteAnalysisAndWait(session, code);

    const { client } = paymentWalletClient();
    const statsBefore = await facilitatorStats();
    const paymentsBefore = await prisma.payment.count();

    const fetchWithPayment = paidFetch(session, client);
    let conflictStatus: number | null = null;
    let conflictDetails: { analysisId?: string } | undefined;

    try {
      const response = await fetchWithPayment(PAID_ENDPOINT, paidPayloadInit(code));
      conflictStatus = response.status;
      const body = (await response.json()) as { error?: { details?: { analysisId?: string } } };
      conflictDetails = body.error?.details;
    } catch (error) {
      // x402-fetch may surface non-402 error statuses as a rejection carrying the response.
      const maybeResponse = (error as { response?: Response }).response;
      if (maybeResponse) {
        conflictStatus = maybeResponse.status;
        const body = (await maybeResponse.json()) as { error?: { details?: { analysisId?: string } } };
        conflictDetails = body.error?.details;
      } else {
        throw error;
      }
    }

    expect(conflictStatus).toBe(409);
    expect(conflictDetails?.analysisId).toBe(existing.analysisId);

    const statsAfter = await facilitatorStats();
    expect(statsAfter.settleCalls).toBe(statsBefore.settleCalls);
    expect(await prisma.payment.count()).toBe(paymentsBefore);
  });

  it("consumes an available retry credit instead of charging again", async () => {
    const session = createSession({ ip: "203.0.113.63" });
    const sid = await sessionId(session);
    const payer = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();

    const credit = await prisma.payment.create({
      data: {
        payer,
        amountMicroUsdc: PRICE_MICRO_USDC,
        chainId: 8453,
        status: "RETRY_CREDIT",
        requesterSessionId: sid
      }
    });

    const statsBefore = await facilitatorStats();

    const { status, body } = await session.postJson<{ analysisId?: string }>(PAID_ENDPOINT, {
      inputType: "PASTE_CODE",
      code: uniqueCodeSnippet("PaidRetryCredit"),
      chainId: 8453
    });

    expect(status).toBe(202);
    expect(body.analysisId).toBeTruthy();

    const statsAfter = await facilitatorStats();
    expect(statsAfter.verifyCalls).toBe(statsBefore.verifyCalls);
    expect(statsAfter.settleCalls).toBe(statsBefore.settleCalls);

    const consumed = await prisma.payment.findUnique({ where: { id: credit.id } });
    expect(consumed!.status).toBe("SETTLED");
    expect(consumed!.analysisId).toBe(body.analysisId);
  });

  it("does not create a payment when facilitator verification fails", async () => {
    const session = createSession({ ip: "203.0.113.64" });
    const { client } = paymentWalletClient();

    await setFacilitatorMode("verify-invalid");

    try {
      const statsBefore = await facilitatorStats();
      const paymentsBefore = await prisma.payment.count();

      const fetchWithPayment = paidFetch(session, client);
      let outcomeStatus: number | null = null;

      try {
        const response = await fetchWithPayment(
          PAID_ENDPOINT,
          paidPayloadInit(uniqueCodeSnippet("PaidVerifyFail"))
        );
        outcomeStatus = response.status;
      } catch (error) {
        const maybeResponse = (error as { response?: Response }).response;
        outcomeStatus = maybeResponse?.status ?? 402;
      }

      expect(outcomeStatus).toBe(402);

      const statsAfter = await facilitatorStats();
      expect(statsAfter.settleCalls).toBe(statsBefore.settleCalls);
      expect(await prisma.payment.count()).toBe(paymentsBefore);
    } finally {
      await setFacilitatorMode("ok");
    }
  });
});
