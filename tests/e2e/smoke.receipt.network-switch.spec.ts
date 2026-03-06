import { expect, test } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RISKY_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract RiskySwitchFlow {",
  "    function run(address target) external {",
  "        require(tx.origin == msg.sender, \"origin\");",
  "        (bool ok, ) = target.delegatecall(abi.encodeWithSignature(\"pwn()\"));",
  "        require(ok, \"delegate\");",
  "    }",
  "}"
].join("\n");

interface MintAuthorizationRpcTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  primaryType: "MintAuthorization";
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    MintAuthorization: Array<{ name: string; type: string }>;
  };
  message: {
    reportHash: Hex;
    contractAddress: Address;
    analyzerVersionHash: Hex;
    owner: Address;
    nonce: string;
    deadline: string;
  };
}

async function createReport(page: import("@playwright/test").Page): Promise<{
  reportId: string;
}> {
  await page.goto("/");
  await page.getByLabel("Solidity snippet (max 200 lines)").fill(RISKY_SNIPPET);
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page).toHaveURL(/\/analysis\//);
  await page.getByRole("link", { name: "Open report" }).click();
  await expect(page).toHaveURL(/\/r\//);

  const url = new URL(page.url());
  const reportId = url.pathname.split("/")[2] as string;

  expect(reportId).toBeTruthy();

  return {
    reportId
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

test("suite B smoke: wrong wallet network triggers switch and mint succeeds", async ({ page }) => {
  const ownerPrivateKey = (process.env.SQR_TEST_MINT_PRIVATE_KEY_ALT || "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;
  const rpcUrl = process.env.SQR_TEST_RPC_URL as string;
  const chainId = Number(process.env.SQR_TEST_CHAIN_ID || "8453");
  const requiredChainHex = `0x${chainId.toString(16)}`.toLowerCase();

  expect(ownerPrivateKey).toBeTruthy();
  expect(rpcUrl).toBeTruthy();

  const created = await createReport(page);
  const ownerAccount = await authenticateReceiptOwner(page, ownerPrivateKey);

  const chain = defineChain({
    id: chainId,
    name: "Base",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  });

  const walletClient = createWalletClient({
    account: ownerAccount,
    chain,
    transport: http(rpcUrl)
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  await page.exposeFunction("__mockSignTypedDataV4", async (from: string, typedDataJson: string) => {
    if (from.toLowerCase() !== ownerAccount.address.toLowerCase()) {
      throw new Error("Mock wallet account mismatch");
    }

    const typedData = JSON.parse(typedDataJson) as MintAuthorizationRpcTypedData;

    return await ownerAccount.signTypedData({
      domain: typedData.domain,
      types: {
        MintAuthorization: typedData.types.MintAuthorization
      },
      primaryType: "MintAuthorization",
      message: {
        reportHash: typedData.message.reportHash,
        contractAddress: typedData.message.contractAddress,
        analyzerVersionHash: typedData.message.analyzerVersionHash,
        owner: typedData.message.owner,
        nonce: BigInt(typedData.message.nonce),
        deadline: BigInt(typedData.message.deadline)
      }
    });
  });

  await page.exposeFunction(
    "__mockSendTransaction",
    async (tx: { from: string; to: string; data: string }) => {
      if (tx.from.toLowerCase() !== ownerAccount.address.toLowerCase()) {
        throw new Error("Mock tx sender mismatch");
      }

      const hash = await walletClient.sendTransaction({
        to: tx.to as Address,
        data: tx.data as Hex
      });

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    }
  );

  await page.addInitScript(
    ({ accountAddress, startChainHex }) => {
      const listeners = new Set<(chainId: string) => void>();
      let currentChainId = startChainHex.toLowerCase();
      let switchCalls = 0;
      let addCalls = 0;

      const emitChainChanged = () => {
        for (const listener of listeners) {
          listener(currentChainId);
        }
      };

      (window as any).__mockWalletState = {
        get switchCalls() {
          return switchCalls;
        },
        get addCalls() {
          return addCalls;
        },
        get currentChainId() {
          return currentChainId;
        }
      };

      (window as any).ethereum = {
        async request({ method, params }: { method: string; params?: unknown[] | Record<string, unknown> }) {
          if (method === "eth_requestAccounts") {
            return [accountAddress];
          }

          if (method === "eth_chainId") {
            return currentChainId;
          }

          if (method === "wallet_switchEthereumChain") {
            switchCalls += 1;
            const switchParams = Array.isArray(params) ? params : [];
            const target = (switchParams[0] as { chainId?: string } | undefined)?.chainId;
            if (!target) {
              throw new Error("wallet_switchEthereumChain missing chainId");
            }

            currentChainId = target.toLowerCase();
            emitChainChanged();
            return null;
          }

          if (method === "wallet_addEthereumChain") {
            addCalls += 1;
            return null;
          }

          if (method === "eth_signTypedData_v4") {
            const signParams = Array.isArray(params) ? (params as [string, string]) : ["", ""];
            return await (window as any).__mockSignTypedDataV4(signParams[0], signParams[1]);
          }

          if (method === "eth_sendTransaction") {
            const txParams = Array.isArray(params) ? (params as [{ from: string; to: string; data: string }]) : [];
            return await (window as any).__mockSendTransaction(txParams[0]);
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
    {
      accountAddress: ownerAccount.address,
      startChainHex: "0x1"
    }
  );

  await page.goto(`/r/${created.reportId}`);
  await expect(page.getByRole("heading", { name: "Security Report" })).toBeVisible();
  await expect(page.getByText(/Wallet network chainId:/i)).toContainText("0x1");
  await expect(page.getByText(/Required network:/i)).toContainText(String(chainId));

  await page.getByRole("button", { name: "Mint Base receipt" }).click();

  await expect(page.getByRole("heading", { name: "Onchain Receipt" })).toBeVisible();

  const walletState = await page.evaluate(() => {
    const state = (window as any).__mockWalletState as {
      switchCalls: number;
      addCalls: number;
      currentChainId: string;
    };

    return {
      switchCalls: state.switchCalls,
      addCalls: state.addCalls,
      currentChainId: state.currentChainId
    };
  });

  expect(walletState.switchCalls).toBeGreaterThan(0);
  expect(walletState.currentChainId.toLowerCase()).toBe(requiredChainHex);
});

