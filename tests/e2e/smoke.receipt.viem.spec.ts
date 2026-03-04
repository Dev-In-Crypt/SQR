import { expect, test } from "@playwright/test";

import { readMintedEventFromTx, sendPreparedReceiptMint } from "../integration/setup/helpers";

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
  await page.goto("/");
  await page.getByLabel("Solidity snippet (max 200 lines)").fill(RISKY_SNIPPET);
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page).toHaveURL(/\/analysis\//);
  await page.getByRole("link", { name: "Open report" }).click();
  await expect(page).toHaveURL(/\/r\//);

  const url = new URL(page.url());
  const reportId = url.pathname.split("/")[2] as string;

  const reportHashLine = await page.getByText(/reportHash:\s*0x[0-9a-f]{64}/i).textContent();
  const match = reportHashLine?.match(/0x[0-9a-f]{64}/i);

  expect(reportId).toBeTruthy();
  expect(match?.[0]).toBeTruthy();

  return {
    reportId,
    reportHash: match![0].toLowerCase() as `0x${string}`
  };
}

test("suite B smoke: viem mint + confirm + UI verification", async ({ page }) => {
  const created = await createReport(page);

  const prepareResponse = await page.request.post(`/api/v1/receipt/${created.reportId}/prepare`, {
    data: {}
  });
  expect(prepareResponse.status()).toBe(200);

  const prepared = (await prepareResponse.json()) as {
    existing?: boolean;
    tx?: {
      to: `0x${string}`;
      data: `0x${string}`;
      chainId: number;
    };
    error?: { code: string; message: string };
  };

  expect(prepared.existing).toBe(false);
  expect(prepared.tx).toBeTruthy();

  const txHash = await sendPreparedReceiptMint({
    to: prepared.tx!.to,
    data: prepared.tx!.data,
    chainId: prepared.tx!.chainId
  });

  const event = await readMintedEventFromTx(txHash);
  expect(event).not.toBeNull();

  const confirmResponse = await page.request.post(`/api/v1/receipt/${created.reportId}/confirm`, {
    data: {
      txHash
    }
  });

  expect(confirmResponse.status()).toBe(200);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Onchain Receipt" })).toBeVisible();
  await expect(page.getByText(new RegExp(txHash, "i"))).toBeVisible();

  const reportHashLine = await page.getByText(/reportHash:\s*0x[0-9a-f]{64}/i).textContent();
  const uiHash = reportHashLine?.match(/0x[0-9a-f]{64}/i)?.[0]?.toLowerCase();

  expect(uiHash).toBe(created.reportHash);
  expect(event?.reportHash.toLowerCase()).toBe(created.reportHash.toLowerCase());
});
