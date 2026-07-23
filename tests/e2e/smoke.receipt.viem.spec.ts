import { expect, test } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

import {
  readMintedEventFromTx,
  sendSignedPreparedReceiptMint,
  type PreparedMintPayload
} from "../integration/setup/helpers";

const RISKY_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract RiskyReceipt {",
  "    function run(address target) external {",
  "        require(tx.origin == msg.sender, \"origin\");",
  "        (bool ok, ) = target.delegatecall(abi.encodeWithSignature(\"pwn()\"));",
  "        require(ok, \"delegate\");",
  "    }",
  "}"
].join("\n");

async function createReport(page: import("@playwright/test").Page): Promise<{
  reportId: string;
  reportHash: `0x${string}`;
}> {
  await page.goto("/", { waitUntil: "networkidle" });
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

  expect(reportId).toBeTruthy();

  const reportUrl = privateToken
    ? `/r/${reportId}?token=${encodeURIComponent(privateToken)}`
    : `/r/${reportId}`;
  await page.goto(reportUrl);
  await expect(page).toHaveURL(/\/(r|report)\//);

  const reportResponse = await page.request.get(
    privateToken ? `/api/v1/report/${reportId}?token=${encodeURIComponent(privateToken)}` : `/api/v1/report/${reportId}`
  );
  expect(reportResponse.status()).toBe(200);

  const reportBody = (await reportResponse.json()) as {
    reportHash?: string;
  };

  expect(reportId).toBeTruthy();
  expect(reportBody.reportHash).toMatch(/^0x[0-9a-f]{64}$/i);

  return {
    reportId,
    reportHash: reportBody.reportHash!.toLowerCase() as `0x${string}`
  };
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

test("suite B smoke: viem mintWithSig + confirm + UI verification", async ({ page }) => {
  const created = await createReport(page);
  const ownerPrivateKey = process.env.SQR_TEST_MINT_PRIVATE_KEY as Hex;
  expect(ownerPrivateKey).toBeTruthy();

  const ownerAccount = await authenticateReceiptOwner(page, ownerPrivateKey);

  const prepareResponse = await page.request.post(`/api/v1/receipt/${created.reportId}/prepare`, {
    data: {}
  });
  expect(prepareResponse.status()).toBe(200);

  const prepared = (await prepareResponse.json()) as {
    existing?: boolean;
    typedData?: PreparedMintPayload["typedData"];
    call?: PreparedMintPayload["call"];
    error?: { code: string; message: string };
  };

  expect(prepared.existing).toBe(false);
  expect(prepared.call).toBeTruthy();
  expect(prepared.typedData).toBeTruthy();

  const mintPayload = {
    typedData: prepared.typedData!,
    call: prepared.call!
  };

  const { txHash, signature } = await sendSignedPreparedReceiptMint({
    prepared: mintPayload,
    ownerPrivateKey
  });

  const event = await readMintedEventFromTx(txHash);
  expect(event).not.toBeNull();

  const confirmResponse = await page.request.post(`/api/v1/receipt/${created.reportId}/confirm`, {
    data: {
      txHash,
      owner: ownerAccount.address,
      nonce: mintPayload.call.args.nonce,
      deadline: mintPayload.call.args.deadline,
      signature
    }
  });

  expect(confirmResponse.status()).toBe(200);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Onchain Receipt" })).toBeVisible();
  await expect(page.getByText(new RegExp(txHash, "i"))).toBeVisible();
  await expect(page.getByText(new RegExp(`minter.*${ownerAccount.address}`, "i"))).toBeVisible();

  expect(event?.reportHash.toLowerCase()).toBe(created.reportHash.toLowerCase());
});
