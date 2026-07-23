import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Unique IP so exhausting the anon free limit here never interferes with other specs.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" } });

function uniqueSnippet(tag: string): string {
  const marker = randomUUID().replace(/-/g, "").slice(0, 12);
  return [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "",
    `contract Paid${tag}${marker} {`,
    "    uint256 public value;",
    "",
    "    function bump(uint256 next) external {",
    "        value = next;",
    "    }",
    "}"
  ].join("\n");
}

test("paid x402 flow: free limit exhausted -> pay panel -> gasless payment -> analysis", async ({
  page
}) => {
  const payerPrivateKey =
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex; // anvil #3
  const payerAccount = privateKeyToAccount(payerPrivateKey);

  // Generic EIP-712 signing bridge: x402's exact scheme signs a USDC
  // TransferWithAuthorization payload; sign whatever typed data arrives.
  await page.exposeFunction("__mockSignTypedDataV4", async (from: string, typedDataJson: string) => {
    if (from.toLowerCase() !== payerAccount.address.toLowerCase()) {
      throw new Error("Mock wallet account mismatch");
    }

    const typedData = JSON.parse(typedDataJson) as {
      domain: Record<string, unknown>;
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    };

    const types = { ...typedData.types };
    delete types.EIP712Domain;

    return await payerAccount.signTypedData({
      domain: typedData.domain,
      types,
      primaryType: typedData.primaryType,
      message: typedData.message
    } as Parameters<typeof payerAccount.signTypedData>[0]);
  });

  await page.addInitScript(
    ({ accountAddress, chainHex }) => {
      (window as any).ethereum = {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") {
            return [accountAddress];
          }

          if (method === "eth_chainId") {
            return chainHex;
          }

          if (method === "eth_signTypedData_v4") {
            const signParams = Array.isArray(params) ? (params as [string, string]) : ["", ""];
            return await (window as any).__mockSignTypedDataV4(signParams[0], signParams[1]);
          }

          throw new Error(`Unsupported mock wallet method: ${method}`);
        },
        on() {
          /* noop */
        },
        removeListener() {
          /* noop */
        }
      };
    },
    { accountAddress: payerAccount.address, chainHex: "0x2105" }
  );

  // Warm up all routes first so dev-mode recompiles (which reset the in-memory
  // rate-limit counters) happen before we start consuming the free budget.
  await page.goto("/", { waitUntil: "networkidle" });

  // Exhaust the anonymous free limit (RATE_LIMIT_ANON_PER_DAY defaults to 3).
  // Dev-mode module reloads can reset the in-memory counters, so keep
  // submitting via the UI until the paid offer actually appears.
  let paidOfferShown = false;
  for (let attempt = 0; attempt < 8 && !paidOfferShown; attempt += 1) {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByLabel("Solidity snippet (max 200 lines)").fill(uniqueSnippet(`Try${attempt}`));
    await page.getByRole("button", { name: "Analyze" }).click();

    const outcome = await Promise.race([
      page
        .waitForURL(/\/analysis\//, { timeout: 30_000 })
        .then(() => "navigated" as const),
      page
        .getByText("Daily free limit reached.")
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "limited" as const)
    ]);

    paidOfferShown = outcome === "limited";
  }

  expect(paidOfferShown).toBe(true);

  await page.getByRole("button", { name: /Pay \$5\.00 & analyze/ }).click();

  await expect(page).toHaveURL(/\/analysis\//, { timeout: 30_000 });

  const analysisId = new URL(page.url()).pathname.split("/")[2] || "";
  expect(analysisId).not.toBe("");

  // The analysis created through the paid path reaches a terminal state.
  let terminalStatus = "";
  for (let i = 0; i < 90; i += 1) {
    const response = await page.request.get(`/api/v1/analysis/${analysisId}`);
    if (response.ok()) {
      const body = (await response.json()) as { status: string };
      if (["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL", "FAILED"].includes(body.status)) {
        terminalStatus = body.status;
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  expect(["COMPLETED", "DONE_WITH_WARNINGS", "PARTIAL"]).toContain(terminalStatus);
});
