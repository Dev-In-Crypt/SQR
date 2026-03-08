import { expect, test } from "@playwright/test";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { pasteCodeNegativeCases } from "../fixtures/negative-cases";

const RISKY_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract RiskyNegativeFlow {",
  "    function run(address target) external {",
  "        (bool ok, ) = target.delegatecall(abi.encodeWithSignature(\"pwn()\"));",
  "        require(ok, \"delegate\");",
  "    }",
  "}"
].join("\n");

function pasteCase(id: string): string {
  const found = pasteCodeNegativeCases.find((item) => item.id === id);
  if (!found || typeof found.payload !== "string") {
    throw new Error(`Missing paste fixture: ${id}`);
  }
  return found.payload;
}

async function createReport(page: import("@playwright/test").Page): Promise<{ reportId: string }> {
  await page.goto("/");
  await page.getByLabel("Solidity snippet (max 200 lines)").fill(RISKY_SNIPPET);
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page).toHaveURL(/\/analysis\//);
  const analysisId = new URL(page.url()).pathname.split("/")[2] || "";
  expect(analysisId).not.toBe("");

  let reportId = "";
  let privateToken = "";
  for (let i = 0; i < 90; i += 1) {
    const response = await page.request.get(`/api/v1/analysis/${analysisId}`);
    if (!response.ok()) {
      await page.waitForTimeout(500);
      continue;
    }

    const body = (await response.json()) as {
      reportId: string | null;
      privateToken: string | null;
      status: string;
    };

    if (body.reportId) {
      reportId = body.reportId;
      privateToken = body.privateToken || "";
      break;
    }

    if (body.status === "FAILED") {
      break;
    }

    await page.waitForTimeout(500);
  }

  expect(reportId).not.toBe("");

  const reportUrl = privateToken
    ? `/r/${reportId}?token=${encodeURIComponent(privateToken)}`
    : `/r/${reportId}`;
  await page.goto(reportUrl);
  await expect(page).toHaveURL(/\/r\//);
  expect(reportId).not.toBe("");

  return { reportId };
}

async function authenticateReceiptOwner(page: import("@playwright/test").Page, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);

  const nonceResp = await page.request.post("/api/v1/auth/nonce", {
    data: { wallet: account.address }
  });
  expect(nonceResp.status()).toBe(200);

  const nonceJson = (await nonceResp.json()) as {
    nonce: string;
    message: string;
  };

  const signature = await account.signMessage({
    message: nonceJson.message
  });

  const verifyResp = await page.request.post("/api/v1/auth/verify", {
    data: {
      wallet: account.address,
      nonce: nonceJson.nonce,
      signature
    }
  });

  expect(verifyResp.status()).toBe(200);
  return account;
}

async function installMockWallet(
  page: import("@playwright/test").Page,
  params: {
    accountAddress: string;
    initialChainHex?: string;
    switchBehavior?: "ok" | "reject4001" | "error4902";
    addBehavior?: "ok" | "reject4001";
    signTypedData?: string;
    sendTxHash?: string;
  }
) {
  await page.addInitScript(
    ({ accountAddress, initialChainHex, switchBehavior, addBehavior, signTypedData, sendTxHash }) => {
      const listeners = new Set<(chainId: string) => void>();
      let currentChainId = (initialChainHex || "0x1").toLowerCase();
      let addCalls = 0;
      let switchCalls = 0;
      let chainAdded = false;

      (window as any).__mockWalletState = {
        get addCalls() {
          return addCalls;
        },
        get switchCalls() {
          return switchCalls;
        },
        get currentChainId() {
          return currentChainId;
        }
      };

      (window as any).ethereum = {
        async request({ method, params: reqParams }: { method: string; params?: unknown[] }) {
          if (method === "eth_requestAccounts") {
            return [accountAddress];
          }

          if (method === "eth_chainId") {
            return currentChainId;
          }

          if (method === "wallet_switchEthereumChain") {
            switchCalls += 1;

            if (switchBehavior === "reject4001") {
              const err = new Error("User rejected request");
              (err as Error & { code: number }).code = 4001;
              throw err;
            }

            if (switchBehavior === "error4902" && !chainAdded) {
              const err = new Error("Chain not added");
              (err as Error & { code: number }).code = 4902;
              throw err;
            }

            const target = (reqParams?.[0] as { chainId?: string } | undefined)?.chainId;
            if (target) {
              currentChainId = target.toLowerCase();
              for (const listener of listeners) {
                listener(currentChainId);
              }
            }
            return null;
          }

          if (method === "wallet_addEthereumChain") {
            addCalls += 1;

            if (addBehavior === "reject4001") {
              const err = new Error("User rejected request");
              (err as Error & { code: number }).code = 4001;
              throw err;
            }

            chainAdded = true;
            return null;
          }

          if (method === "eth_signTypedData_v4") {
            return signTypedData || `0x${"aa".repeat(65)}`;
          }

          if (method === "eth_sendTransaction") {
            return sendTxHash || `0x${"bb".repeat(32)}`;
          }

          throw new Error(`Unsupported mock wallet method: ${method}`);
        },
        on(event: string, listener: (...args: unknown[]) => void) {
          if (event === "chainChanged") {
            listeners.add(listener as (chainId: string) => void);
          }
        },
        removeListener(event: string, listener: (...args: unknown[]) => void) {
          if (event === "chainChanged") {
            listeners.delete(listener as (chainId: string) => void);
          }
        }
      };
    },
    params
  );
}

const blockedCaseIds = [
  "PASTE_003_EMPTY",
  "PASTE_004_WHITESPACE_ONLY",
  "PASTE_005_COMMENTS_ONLY",
  "PASTE_006_NON_SOLIDITY_TEXT",
  "PASTE_007_JAVASCRIPT_SNIPPET",
  "PASTE_009_INCOMPLETE_BRACES"
];

for (const caseId of blockedCaseIds) {
  test(`negative UI paste: ${caseId} stays blocked`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Solidity snippet (max 200 lines)").fill(pasteCase(caseId));

    await expect(page.getByText("incomplete snippet, please paste full contract")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyze" })).toBeDisabled();
    await expect(page).toHaveURL(/\/$/);
  });
}

test("negative UI paste: over-limit input is rejected with clear message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Solidity snippet (max 200 lines)").fill(pasteCase("PASTE_016_LINE_LIMIT_EXCEEDED"));

  const analyzeButton = page.getByRole("button", { name: "Analyze" });
  await expect(analyzeButton).toBeEnabled();
  const createResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/analysis") && response.request().method() === "POST"
  );
  await analyzeButton.click();

  const response = await createResponse;
  const body = (await response.json()) as { error?: { code?: string } };
  expect(response.status()).toBe(400);
  expect(body.error?.code).toBe("LINE_LIMIT_EXCEEDED");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/supports up to 200 lines/i)).toBeVisible();
});

test("negative UI receipt: wrong network + rejected switch shows actionable message", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;

  const created = await createReport(page);
  const owner = await authenticateReceiptOwner(page, ownerPrivateKey);

  await installMockWallet(page, {
    accountAddress: owner.address,
    initialChainHex: "0x1",
    switchBehavior: "reject4001",
    addBehavior: "reject4001"
  });

  await page.goto(`/r/${created.reportId}`);
  await page.getByRole("button", { name: "Mint Base receipt" }).click();

  await expect(page.getByText(/network switch was rejected/i)).toBeVisible();
});

test("negative UI receipt: 4902 path triggers add+switch", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;

  const created = await createReport(page);
  const owner = await authenticateReceiptOwner(page, ownerPrivateKey);

  await installMockWallet(page, {
    accountAddress: owner.address,
    initialChainHex: "0x1",
    switchBehavior: "error4902",
    addBehavior: "ok"
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/prepare`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        existing: false,
        typedData: {
          domain: {
            name: "ReceiptRegistry",
            version: "0.2.0",
            chainId: 8453,
            verifyingContract: "0x0000000000000000000000000000000000000001"
          },
          primaryType: "MintAuthorization",
          types: {
            EIP712Domain: [],
            MintAuthorization: []
          },
          message: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: owner.address,
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        },
        call: {
          to: "0x0000000000000000000000000000000000000001",
          chainId: 8453,
          functionName: "mintWithSig",
          args: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: owner.address,
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        }
      })
    });
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/confirm`, async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TX_NOT_FOUND_REQUIRED_NETWORK",
          message: "tx not found on required network"
        }
      })
    });
  });

  await page.goto(`/r/${created.reportId}`);
  const confirmResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/v1/receipt/${created.reportId}/confirm`) &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Mint Base receipt" }).click();
  const confirm = await confirmResponse;
  const confirmBody = (await confirm.json()) as { error?: { code?: string } };

  expect(confirm.status()).toBe(400);
  expect(confirmBody.error?.code).toBe("TX_NOT_FOUND_REQUIRED_NETWORK");
  await expect(page.getByText(/transaction was not found on the required network/i)).toBeVisible();

  const walletState = await page.evaluate(() => (window as any).__mockWalletState);
  expect(walletState.addCalls).toBeGreaterThan(0);
});

test("negative UI receipt: owner mismatch prompts re-prepare", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;

  const created = await createReport(page);
  const owner = await authenticateReceiptOwner(page, ownerPrivateKey);

  await installMockWallet(page, {
    accountAddress: owner.address,
    initialChainHex: "0x2105",
    switchBehavior: "ok"
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/prepare`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        existing: false,
        typedData: {
          domain: {
            name: "ReceiptRegistry",
            version: "0.2.0",
            chainId: 8453,
            verifyingContract: "0x0000000000000000000000000000000000000001"
          },
          primaryType: "MintAuthorization",
          types: { EIP712Domain: [], MintAuthorization: [] },
          message: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: "0x1111111111111111111111111111111111111111",
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        },
        call: {
          to: "0x0000000000000000000000000000000000000001",
          chainId: 8453,
          functionName: "mintWithSig",
          args: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: "0x1111111111111111111111111111111111111111",
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        }
      })
    });
  });

  await page.goto(`/r/${created.reportId}`);
  await page.getByRole("button", { name: "Mint Base receipt" }).click();

  await expect(page.getByText(/does not match prepared owner/i)).toBeVisible();
});

test("negative UI receipt: event mismatch error is surfaced", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;

  const created = await createReport(page);
  const owner = await authenticateReceiptOwner(page, ownerPrivateKey);

  await installMockWallet(page, {
    accountAddress: owner.address,
    initialChainHex: "0x2105",
    switchBehavior: "ok",
    signTypedData: `0x${"aa".repeat(65)}`,
    sendTxHash: `0x${"cc".repeat(32)}`
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/prepare`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        existing: false,
        typedData: {
          domain: {
            name: "ReceiptRegistry",
            version: "0.2.0",
            chainId: 8453,
            verifyingContract: "0x0000000000000000000000000000000000000001"
          },
          primaryType: "MintAuthorization",
          types: {
            EIP712Domain: [],
            MintAuthorization: []
          },
          message: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: owner.address,
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        },
        call: {
          to: "0x0000000000000000000000000000000000000001",
          chainId: 8453,
          functionName: "mintWithSig",
          args: {
            reportHash: `0x${"11".repeat(32)}`,
            contractAddress: "0x0000000000000000000000000000000000000000",
            analyzerVersionHash: `0x${"22".repeat(32)}`,
            owner: owner.address,
            nonce: "0",
            deadline: String(Math.floor(Date.now() / 1000) + 600)
          }
        }
      })
    });
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/confirm`, async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "MINT_EVENT_NOT_FOUND",
          message: "ReceiptMinted event not found for this transaction"
        }
      })
    });
  });

  await page.goto(`/r/${created.reportId}`);
  const confirmResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/v1/receipt/${created.reportId}/confirm`) &&
    response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Mint Base receipt" }).click();
  const confirm = await confirmResponse;
  const confirmBody = (await confirm.json()) as { error?: { code?: string } };

  expect(confirm.status()).toBe(400);
  expect(confirmBody.error?.code).toBe("MINT_EVENT_NOT_FOUND");
  await expect(page.getByText(/event was not found/i)).toBeVisible();
});

test("negative UI receipt: duplicate mint stays stable via existing receipt path", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;

  const created = await createReport(page);
  const owner = await authenticateReceiptOwner(page, ownerPrivateKey);

  await installMockWallet(page, {
    accountAddress: owner.address,
    initialChainHex: "0x2105",
    switchBehavior: "ok"
  });

  await page.route(`**/api/v1/receipt/${created.reportId}/prepare`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        existing: true,
        receipt: {
          txHash: `0x${"dd".repeat(32)}`
        }
      })
    });
  });

  await page.goto(`/r/${created.reportId}`);
  await page.getByRole("button", { name: "Mint Base receipt" }).click();

  await expect(page.getByRole("heading", { name: "Security Report" })).toBeVisible();
  await expect(page.getByText(/receipt verification/i)).toHaveCount(0);
  await expect(page.locator(".card.error")).toHaveCount(0);
});
