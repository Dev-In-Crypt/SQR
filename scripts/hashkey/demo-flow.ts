import { createPublicClient, createWalletClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { receiptRegistryAbi } from "@/lib/receipt-shared";

interface CookieJar {
  [key: string]: string;
}

interface AnalysisCreateResponse {
  analysisId?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AnalysisStatusResponse {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "PARTIAL";
  reportId: string | null;
  privateToken: string | null;
  errorCode: string | null;
  errorDetail?: string | null;
}

interface ReportResponse {
  reportId: string;
  reportHash: string;
  report: {
    metadata: {
      reviewMode?: "STANDARD" | "DEFI_PAYFI";
      chainId: number;
      contractAddress?: string;
    };
    financialReview?: {
      sections: Array<{ label: string; riskLevel: string }>;
      builderReport: { title: string };
      partnerReport: { title: string };
    };
  };
  receipt: {
    txHash: string;
  } | null;
}

interface PreparedReceiptResponse {
  existing?: boolean;
  typedData?: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    types: {
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
  };
  call?: {
    to: Address;
    chainId: number;
    args: {
      reportHash: Hex;
      contractAddress: Address;
      analyzerVersionHash: Hex;
      owner: Address;
      nonce: string;
      deadline: string;
    };
  };
}

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function buildSignMessage(nonce: string): string {
  return [
    "Sign in to Solidity Quick Review",
    "",
    `Nonce: ${nonce}`,
    "",
    "This signature does not trigger any blockchain transaction."
  ].join("\n");
}

function parseSetCookie(headers: Headers): string[] {
  const raw = headers.get("set-cookie");
  if (!raw) {
    return [];
  }

  return raw.split(",").map((item) => item.trim());
}

async function requestJson<T>(params: {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  jar: CookieJar;
}): Promise<{ status: number; body: T }> {
  const headers = new Headers();
  if (params.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const cookie = Object.entries(params.jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method || "GET",
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    redirect: "manual"
  });

  for (const entry of parseSetCookie(response.headers)) {
    const pair = entry.split(";")[0];
    if (!pair.includes("=")) {
      continue;
    }

    const [name, value] = pair.split("=");
    params.jar[name.trim()] = value.trim();
  }

  const payload = (await response.json()) as T;
  return {
    status: response.status,
    body: payload
  };
}

async function main() {
  const baseUrl = process.env.HASHKEY_DEMO_APP_URL?.trim() || "http://127.0.0.1:3000";
  const privateKey = mustEnv("HASHKEY_DEMO_PRIVATE_KEY") as Hex;
  const account = privateKeyToAccount(privateKey);
  const demoChainId = Number(process.env.HASHKEY_DEMO_CHAIN_ID || "133");
  const rpcUrl = process.env.HASHKEY_TESTNET_RPC_URL?.trim() || "https://testnet.hsk.xyz";
  const verifiedAddress = process.env.HASHKEY_DEMO_CONTRACT_ADDRESS?.trim() || "0x4200000000000000000000000000000000000015";

  const jar: CookieJar = {};

  const nonce = await requestJson<{ nonce?: string; message?: string }>({
    baseUrl,
    path: "/api/v1/auth/nonce",
    method: "POST",
    body: { wallet: account.address },
    jar
  });
  if (nonce.status !== 200 || !nonce.body.nonce) {
    throw new Error(`nonce failed: ${JSON.stringify(nonce.body)}`);
  }

  const signature = await account.signMessage({
    message: buildSignMessage(nonce.body.nonce)
  });

  const verify = await requestJson<{ ok?: boolean }>({
    baseUrl,
    path: "/api/v1/auth/verify",
    method: "POST",
    body: {
      wallet: account.address,
      nonce: nonce.body.nonce,
      signature
    },
    jar
  });
  if (verify.status !== 200 || !verify.body.ok) {
    throw new Error(`verify failed: ${JSON.stringify(verify.body)}`);
  }

  const created = await requestJson<AnalysisCreateResponse>({
    baseUrl,
    path: "/api/v1/analysis",
    method: "POST",
    body: {
      inputType: "BASE_ADDRESS",
      address: verifiedAddress,
      chainId: demoChainId,
      reviewMode: "DEFI_PAYFI"
    },
    jar
  });
  if (created.status !== 202 || !created.body.analysisId) {
    throw new Error(`analysis create failed: ${JSON.stringify(created.body)}`);
  }

  const analysisId = created.body.analysisId;
  let reportId: string | null = null;
  let token: string | null = null;

  for (let i = 0; i < 120; i += 1) {
    const status = await requestJson<AnalysisStatusResponse>({
      baseUrl,
      path: `/api/v1/analysis/${analysisId}`,
      jar
    });

    if (status.body.status === "FAILED") {
      throw new Error(`analysis failed: ${status.body.errorCode}${status.body.errorDetail ? ` (${status.body.errorDetail})` : ""}`);
    }

    if (
      status.body.status === "COMPLETED" ||
      status.body.status === "DONE_WITH_WARNINGS" ||
      status.body.status === "PARTIAL"
    ) {
      reportId = status.body.reportId;
      token = status.body.privateToken;
      break;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  if (!reportId) {
    throw new Error("analysis did not finish in time");
  }

  const report = await requestJson<ReportResponse>({
    baseUrl,
    path: `/api/v1/report/${reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    jar
  });
  if (report.status !== 200) {
    throw new Error(`report failed: ${JSON.stringify(report.body)}`);
  }

  if (report.body.report.metadata.reviewMode !== "DEFI_PAYFI" || !report.body.report.financialReview) {
    throw new Error("financial review mode output missing");
  }

  if (report.body.receipt) {
    console.log(`report_id=${report.body.reportId}`);
    console.log(`receipt_tx=${report.body.receipt.txHash}`);
    console.log("demo_flow=ok_existing_receipt");
    return;
  }

  const prepared = await requestJson<PreparedReceiptResponse>({
    baseUrl,
    path: `/api/v1/receipt/${reportId}/prepare`,
    method: "POST",
    body: {},
    jar
  });

  if (prepared.status !== 200 || !prepared.body.typedData || !prepared.body.call) {
    throw new Error(`prepare failed: ${JSON.stringify(prepared.body)}`);
  }

  const walletClient = createWalletClient({
    account,
    chain: {
      id: demoChainId,
      name: demoChainId === 177 ? "HashKey Chain" : "HashKey Chain Testnet",
      nativeCurrency: {
        name: "HashKey",
        symbol: "HSK",
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [rpcUrl]
        }
      }
    },
    transport: http(rpcUrl)
  });
  const publicClient = createPublicClient({
    chain: {
      id: demoChainId,
      name: demoChainId === 177 ? "HashKey Chain" : "HashKey Chain Testnet",
      nativeCurrency: {
        name: "HashKey",
        symbol: "HSK",
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [rpcUrl]
        }
      }
    },
    transport: http(rpcUrl)
  });

  const signedAuthorization = await account.signTypedData({
    domain: prepared.body.typedData.domain,
    types: {
      MintAuthorization: prepared.body.typedData.types.MintAuthorization
    },
    primaryType: "MintAuthorization",
    message: {
      reportHash: prepared.body.typedData.message.reportHash,
      contractAddress: prepared.body.typedData.message.contractAddress,
      analyzerVersionHash: prepared.body.typedData.message.analyzerVersionHash,
      owner: prepared.body.typedData.message.owner,
      nonce: BigInt(prepared.body.typedData.message.nonce),
      deadline: BigInt(prepared.body.typedData.message.deadline)
    }
  });

  const data = encodeFunctionData({
    abi: receiptRegistryAbi,
    functionName: "mintWithSig",
    args: [
      prepared.body.call.args.reportHash,
      prepared.body.call.args.contractAddress,
      prepared.body.call.args.analyzerVersionHash,
      prepared.body.call.args.owner,
      BigInt(prepared.body.call.args.nonce),
      BigInt(prepared.body.call.args.deadline),
      signedAuthorization
    ]
  });

  const txHash = await walletClient.sendTransaction({
    to: prepared.body.call.to,
    data
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const confirm = await requestJson<{ receipt?: { txHash: string } }>({
    baseUrl,
    path: `/api/v1/receipt/${reportId}/confirm`,
    method: "POST",
    body: {
      txHash,
      owner: prepared.body.call.args.owner,
      nonce: prepared.body.call.args.nonce,
      deadline: prepared.body.call.args.deadline,
      signature: signedAuthorization
    },
    jar
  });
  if (confirm.status !== 200) {
    throw new Error(`confirm failed: ${JSON.stringify(confirm.body)}`);
  }

  console.log(`analysis_id=${analysisId}`);
  console.log(`report_id=${reportId}`);
  console.log(`receipt_tx=${txHash}`);
  console.log(`radar_url=${baseUrl}/hashkey/radar`);
  console.log("demo_flow=ok");
}

void main();
