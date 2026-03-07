import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import {
  negativeCases,
  type NegativeCase,
  type MatrixTerminalStatus
} from "@/tests/fixtures/negative-cases";
import {
  authenticateWallet,
  createPasteAnalysisAndWait,
  createSession,
  readMintedEventFromTx,
  sendSignedPreparedReceiptMint,
  testChain,
  uniqueCodeSnippet,
  waitForAnalysisTerminal,
  type HttpSession,
  type PreparedMintPayload
} from "./setup/helpers";

interface AnalysisCreateResponse {
  analysisId?: string;
  status?: string;
  inputHash?: string;
  errorCode?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
}

interface ReportResponse {
  report?: {
    warnings?: string[];
    partialReasons?: string[];
  };
  error?: {
    code?: string;
    message?: string;
  };
}

function expectedTerminal(actual: string, expected: MatrixTerminalStatus): boolean {
  if (expected === "COMPLETED") {
    return actual === "COMPLETED";
  }

  if (expected === "DONE_WITH_WARNINGS") {
    return actual === "DONE_WITH_WARNINGS";
  }

  if (expected === "FAILED") {
    return actual === "FAILED";
  }

  return false;
}

async function readReportWarnings(
  session: HttpSession,
  reportId: string,
  token: string | null
): Promise<string[]> {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const report = await session.getJson<ReportResponse>(`/api/v1/report/${reportId}${query}`);

  if (report.status >= 500) {
    throw new Error(`report returned 5xx (${report.status})`);
  }

  return report.body.report?.warnings || [];
}

function requireTerminal(caseItem: NegativeCase): boolean {
  return caseItem.expectedHttpStatus === 202 && Boolean(caseItem.expectedTerminalStatus);
}

async function postAnalysis(session: HttpSession, testCase: NegativeCase) {
  if (testCase.inputType === "PASTE_CODE") {
    return await session.postJson<AnalysisCreateResponse>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code: testCase.payload,
      chainId: 8453
    });
  }

  const payload = testCase.payload as { address: string; chainId: number };

  return await session.postJson<AnalysisCreateResponse>("/api/v1/analysis", {
    inputType: "BASE_ADDRESS",
    address: payload.address,
    chainId: payload.chainId
  });
}

async function runReceiptIntegrationCase(testCase: NegativeCase): Promise<{ status: number; errorCode?: string }> {
  if (testCase.id === "RECEIPT_004_PREPARE_OWNER_MISMATCH") {
    const owner = createSession({ ip: "198.51.171.10" });
    const outsider = createSession({ ip: "198.51.171.11" });

    await authenticateWallet(owner);
    await authenticateWallet(outsider);

    const created = await createPasteAnalysisAndWait(owner, uniqueCodeSnippet("PrepareOwnerMismatch"));

    const blocked = await outsider.postJson<{ error?: { code: string } }>(
      `/api/v1/receipt/${created.reportId}/prepare`,
      {}
    );

    return { status: blocked.status, errorCode: blocked.body.error?.code };
  }

  if (testCase.id === "RECEIPT_005_CONFIRM_INVALID_SIGNATURE") {
    const session = createSession({ ip: "198.51.171.12" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("InvalidSignature"));

    const prepare = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    const prepared = { typedData: prepare.body.typedData!, call: prepare.body.call! };
    const minted = await sendSignedPreparedReceiptMint({
      prepared,
      ownerPrivateKey: auth.privateKey
    });

    const badSig = `${minted.signature.slice(0, -2)}${minted.signature.endsWith("ff") ? "00" : "ff"}` as Hex;
    const confirm = await session.postJson<{ error?: { code: string } }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature: badSig
    });

    return { status: confirm.status, errorCode: confirm.body.error?.code };
  }

  if (testCase.id === "RECEIPT_006_CONFIRM_TX_NOT_FOUND") {
    const session = createSession({ ip: "198.51.171.13" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ConfirmTxNotFound"));

    const confirm = await session.postJson<{ error?: { code: string } }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: `0x${"cd".repeat(32)}`,
      owner: auth.walletAddress,
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 600),
      signature: "0x12"
    });

    return { status: confirm.status, errorCode: confirm.body.error?.code };
  }

  if (testCase.id === "RECEIPT_007_CONFIRM_EVENT_MISMATCH") {
    const session = createSession({ ip: "198.51.171.14" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("ConfirmEventMismatch"));

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

    const txHash = await walletClient.sendTransaction({ to: submitter.address, value: 0n });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const confirm = await session.postJson<{ error?: { code: string } }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash,
      owner: auth.walletAddress,
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 600),
      signature: "0x12"
    });

    return { status: confirm.status, errorCode: confirm.body.error?.code };
  }

  if (testCase.id === "RECEIPT_008_CONFIRM_HASH_MISMATCH") {
    const session = createSession({ ip: "198.51.171.15" });
    const auth = await authenticateWallet(session);

    const reportA = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("HashMismatchA"));
    const reportB = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("HashMismatchB"));

    const prepareA = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
    }>(`/api/v1/receipt/${reportA.reportId}/prepare`, {});

    const preparedA = { typedData: prepareA.body.typedData!, call: prepareA.body.call! };
    const minted = await sendSignedPreparedReceiptMint({
      prepared: preparedA,
      ownerPrivateKey: auth.privateKey
    });

    const confirmA = await session.postJson(`/api/v1/receipt/${reportA.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: preparedA.call.args.owner,
      nonce: preparedA.call.args.nonce,
      deadline: preparedA.call.args.deadline,
      signature: minted.signature
    });

    if (confirmA.status !== 200) {
      return { status: confirmA.status, errorCode: "CONFIRM_A_FAILED" };
    }

    const mismatch = await session.postJson<{ error?: { code: string } }>(`/api/v1/receipt/${reportB.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: preparedA.call.args.owner,
      nonce: preparedA.call.args.nonce,
      deadline: preparedA.call.args.deadline,
      signature: minted.signature
    });

    return { status: mismatch.status, errorCode: mismatch.body.error?.code };
  }

  if (testCase.id === "RECEIPT_009_DUPLICATE_MINT_IDEMPOTENT") {
    const session = createSession({ ip: "198.51.171.16" });
    const auth = await authenticateWallet(session);
    const created = await createPasteAnalysisAndWait(session, uniqueCodeSnippet("DuplicateMint"));

    const prepare = await session.postJson<{
      typedData?: PreparedMintPayload["typedData"];
      call?: PreparedMintPayload["call"];
    }>(`/api/v1/receipt/${created.reportId}/prepare`, {});

    const prepared = { typedData: prepare.body.typedData!, call: prepare.body.call! };
    const minted = await sendSignedPreparedReceiptMint({
      prepared,
      ownerPrivateKey: auth.privateKey
    });

    const event = await readMintedEventFromTx(minted.txHash);
    if (!event) {
      return { status: 500, errorCode: "MISSING_EVENT" };
    }

    const confirm1 = await session.postJson<{ existing?: boolean }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature: minted.signature
    });

    const confirm2 = await session.postJson<{ existing?: boolean }>(`/api/v1/receipt/${created.reportId}/confirm`, {
      txHash: minted.txHash,
      owner: prepared.call.args.owner,
      nonce: prepared.call.args.nonce,
      deadline: prepared.call.args.deadline,
      signature: minted.signature
    });

    if (confirm1.status === 200 && confirm2.status === 200 && confirm2.body.existing === true) {
      return { status: 200 };
    }

    return { status: Math.max(confirm1.status, confirm2.status), errorCode: "DUPLICATE_NON_IDEMPOTENT" };
  }

  return { status: 599, errorCode: "UNSUPPORTED_RECEIPT_SCENARIO" };
}

async function writeNegativeReport(params: {
  totalCases: number;
  executedCases: number;
  failures: string[];
  failureReasons: Map<string, number>;
}): Promise<void> {
  const sorted = [...params.failureReasons.entries()].sort((a, b) => b[1] - a[1]);
  const topReasons = sorted.slice(0, 5).map(([reason, count]) => `- ${reason}: ${count}`);

  const prioritizedFixes = [
    "1. Fix API boundary validation mismatch first (status/code drift for 4xx expected cases).",
    "2. Fix terminal-state drift next (unexpected RUNNING/PARTIAL/FAILED status).",
    "3. Fix warning-code drift for DONE_WITH_WARNINGS flows and source metadata propagation.",
    "4. Fix receipt negative flow semantics (network, owner, signature, tx/event mismatch)."
  ];

  const content = [
    "# Negative Test Report",
    "",
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Execution summary",
    `- Matrix cases (all): ${params.totalCases}`,
    `- Matrix cases executed in integration runner: ${params.executedCases}`,
    `- Failures: ${params.failures.length}`,
    `- Passes: ${params.executedCases - params.failures.length}`,
    "",
    "## Failure list",
    ...(params.failures.length ? params.failures.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Top failure reasons",
    ...(topReasons.length ? topReasons : ["- none"]),
    "",
    "## Recommended fixes (priority)",
    ...prioritizedFixes,
    "",
    "## Accepted risks",
    "- Playwright and Foundry suites still gate full API+UI+contract confidence; integration-only run is not sufficient.",
    "- Warning text can evolve while warning codes stay stable; assertions should remain code-focused.",
    "- Runtime target assumes local Anvil and mocked source fetch paths remain enabled in test setup."
  ].join("\n");

  await writeFile(resolve(process.cwd(), "docs/negative-test-report.md"), content, "utf8");
}

describe("API integration - negative matrix runner", () => {
  it(
    "iterates matrix cases with deterministic outputs, no 500s, and stable semantics",
    async () => {
      expect(negativeCases.length).toBeGreaterThanOrEqual(50);
      expect(negativeCases.length).toBeLessThanOrEqual(70);

      const cases = negativeCases.filter((testCase) => testCase.runIn.integration);
      const failures: string[] = [];
      const failureReasons = new Map<string, number>();

      const addFailure = (value: string) => {
        failures.push(value);
        const reason = value.split(":")[1]?.trim() || "unknown";
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      };

      for (let index = 0; index < cases.length; index += 1) {
        const testCase = cases[index];

        try {
          if (testCase.inputType === "RECEIPT") {
            const receiptResult = await runReceiptIntegrationCase(testCase);
            if (receiptResult.status >= 500) {
              addFailure(`${testCase.id}: receipt returned 5xx (${receiptResult.status})`);
              continue;
            }

            if (receiptResult.status !== testCase.expectedHttpStatus) {
              addFailure(`${testCase.id}: expected status ${testCase.expectedHttpStatus}, got ${receiptResult.status}`);
              continue;
            }

            if (testCase.expectedErrorCode && receiptResult.errorCode !== testCase.expectedErrorCode) {
              addFailure(`${testCase.id}: expected code ${testCase.expectedErrorCode}, got ${receiptResult.errorCode ?? "undefined"}`);
            }

            continue;
          }

          const session = createSession({ ip: `198.51.190.${index + 20}` });
          if (testCase.inputType === "ADDRESS") {
            await authenticateWallet(session);
          }

          const first = await postAnalysis(session, testCase);
          const second = await postAnalysis(session, testCase);

          if (first.status >= 500 || second.status >= 500) {
            addFailure(`${testCase.id}: analysis returned 5xx (${first.status}, ${second.status})`);
            continue;
          }

          if (first.status !== testCase.expectedHttpStatus) {
            addFailure(`${testCase.id}: expected status ${testCase.expectedHttpStatus}, got ${first.status}`);
            continue;
          }

          if (first.status !== second.status) {
            addFailure(`${testCase.id}: non-deterministic create status ${first.status}/${second.status}`);
            continue;
          }

          const firstCode = first.body.error?.code || first.body.errorCode || undefined;
          const secondCode = second.body.error?.code || second.body.errorCode || undefined;

          if (testCase.expectedErrorCode && firstCode !== testCase.expectedErrorCode) {
            addFailure(`${testCase.id}: expected code ${testCase.expectedErrorCode}, got ${firstCode ?? "undefined"}`);
            continue;
          }

          if (firstCode !== secondCode) {
            addFailure(`${testCase.id}: non-deterministic error code ${firstCode ?? "null"}/${secondCode ?? "null"}`);
            continue;
          }

          if (requireTerminal(testCase)) {
            if (!first.body.analysisId) {
              addFailure(`${testCase.id}: missing analysisId for terminal check`);
              continue;
            }

            const terminal = await waitForAnalysisTerminal(
              session,
              first.body.analysisId,
              testCase.timeoutMs ?? 12_000
            );

            if (terminal.status === "RUNNING") {
              addFailure(`${testCase.id}: stuck RUNNING status`);
              continue;
            }

            if (!expectedTerminal(terminal.status, testCase.expectedTerminalStatus!)) {
              addFailure(`${testCase.id}: expected terminal ${testCase.expectedTerminalStatus}, got ${terminal.status}`);
              continue;
            }

            if (testCase.expectedErrorCode && terminal.errorCode !== testCase.expectedErrorCode && testCase.expectedTerminalStatus === "FAILED") {
              addFailure(`${testCase.id}: expected terminal code ${testCase.expectedErrorCode}, got ${terminal.errorCode ?? "null"}`);
              continue;
            }

            if (testCase.expectedWarnings?.length) {
              if (!terminal.reportId) {
                addFailure(`${testCase.id}: missing reportId for warning assertions`);
                continue;
              }

              const warnings = await readReportWarnings(session, terminal.reportId, terminal.privateToken);
              for (const warning of testCase.expectedWarnings) {
                if (!warnings.includes(warning)) {
                  addFailure(`${testCase.id}: expected warning ${warning}, got [${warnings.join(", ")}]`);
                }
              }
            }
          }
        } catch (error) {
          addFailure(`${testCase.id}: unexpected runner error ${String(error)}`);
        }
      }

      await writeNegativeReport({
        totalCases: negativeCases.length,
        executedCases: cases.length,
        failures,
        failureReasons
      });

      expect(failures, failures.join("\n")).toEqual([]);
    },
    600_000
  );
});
