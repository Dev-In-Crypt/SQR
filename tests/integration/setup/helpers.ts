import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const DEFAULT_CHAIN_ID = Number(process.env.SQR_TEST_CHAIN_ID || "8453");

const receiptRegistryAbi = parseAbi([
  "function mintWithSig(bytes32 reportHash, address contractAddress, bytes32 analyzerVersionHash, address owner, uint256 nonce, uint256 deadline, bytes signature) returns (uint256 receiptId, bool newlyMinted)"
]);

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required test env var: ${name}`);
  }
  return value;
}

function parseSetCookieHeader(setCookie: string): { name: string; value: string } | null {
  const pair = setCookie.split(";")[0];
  if (!pair) {
    return null;
  }

  const idx = pair.indexOf("=");
  if (idx === -1) {
    return null;
  }

  const name = pair.slice(0, idx).trim();
  const value = pair.slice(idx + 1).trim();

  if (!name) {
    return null;
  }

  return { name, value };
}

export class HttpSession {
  private readonly cookies = new Map<string, string>();
  private readonly baseUrl: string;
  private readonly ip: string;

  constructor(options?: { baseUrl?: string; ip?: string }) {
    this.baseUrl = options?.baseUrl || mustEnv("SQR_TEST_BASE_URL");
    this.ip = options?.ip || "203.0.113.10";
  }

  private cookieHeader(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined;
    }

    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private absorbCookies(response: Response): void {
    const setCookies: string[] =
      (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];

    if (setCookies.length === 0) {
      const fallback = response.headers.get("set-cookie");
      if (fallback) {
        setCookies.push(fallback);
      }
    }

    for (const entry of setCookies) {
      const parsed = parseSetCookieHeader(entry);
      if (!parsed) {
        continue;
      }
      this.cookies.set(parsed.name, parsed.value);
    }
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /**
   * A fetch-compatible function bound to this session (cookies + spoofed IP),
   * usable with wrappers like x402-fetch's wrapFetchWithPayment. Absolute and
   * relative URLs both resolve against the session's base URL host.
   */
  fetchLike(): typeof fetch {
    const sessionFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const path = raw.startsWith(this.baseUrl) ? raw.slice(this.baseUrl.length) : raw;
      const mergedInit: RequestInit =
        typeof input === "object" && !(input instanceof URL)
          ? { method: input.method, headers: input.headers, body: init?.body ?? (input as Request).body, ...init }
          : { ...init };
      return this.request(path, mergedInit);
    };

    return sessionFetch as typeof fetch;
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});

    if (!headers.has("x-forwarded-for")) {
      headers.set("x-forwarded-for", this.ip);
    }

    const cookie = this.cookieHeader();
    if (cookie) {
      headers.set("cookie", cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual"
    });

    this.absorbCookies(response);
    return response;
  }

  async getJson<T>(path: string): Promise<{ status: number; body: T; response: Response }> {
    const response = await this.request(path, {
      method: "GET"
    });

    const body = (await response.json()) as T;

    return {
      status: response.status,
      body,
      response
    };
  }

  async postJson<T>(
    path: string,
    payload: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ status: number; body: T; response: Response }> {
    const headers = {
      "content-type": "application/json",
      ...extraHeaders
    };

    const response = await this.request(path, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const body = (await response.json()) as T;

    return {
      status: response.status,
      body,
      response
    };
  }
}

export function createSession(options?: { ip?: string }): HttpSession {
  return new HttpSession({ ip: options?.ip });
}

export function uniqueCodeSnippet(tag = "Snippet"): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);

  return [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "",
    `contract ${tag.replace(/[^A-Za-z0-9]/g, "")}${suffix} {`,
    "    uint256 public x;",
    "    function set(uint256 value) external {",
    "        x = value;",
    "    }",
    "}"
  ].join("\n");
}

export async function waitForAnalysisTerminal(
  session: HttpSession,
  analysisId: string,
  timeoutMs = 40_000
): Promise<{
  analysisId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "PARTIAL";
  reportId: string | null;
  errorCode: string | null;
  privateToken: string | null;
}> {
  const start = Date.now();
  let lastBody: unknown;

  while (Date.now() - start < timeoutMs) {
    const { status, body } = await session.getJson<{
      analysisId: string;
      status: "QUEUED" | "RUNNING" | "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "PARTIAL";
      reportId: string | null;
      errorCode: string | null;
      privateToken: string | null;
      error?: { code: string; message: string };
    }>(`/api/v1/analysis/${analysisId}`);

    if (status >= 400) {
      throw new Error(`Failed polling analysis ${analysisId}: ${JSON.stringify(body)}`);
    }

    lastBody = body;

    if (body.status === "COMPLETED" ||
      body.status === "DONE_WITH_WARNINGS" ||
      body.status === "PARTIAL" ||
      body.status === "FAILED") {
      return body;
    }

    await delay(350);
  }

  throw new Error(
    `Analysis ${analysisId} did not reach terminal state. Last payload: ${JSON.stringify(lastBody)}`
  );
}

export async function createPasteAnalysisAndWait(
  session: HttpSession,
  code?: string,
  chainId = DEFAULT_CHAIN_ID
): Promise<{
  analysisId: string;
  reportId: string;
  privateToken: string | null;
  terminalStatus: "COMPLETED" | "DONE_WITH_WARNINGS" | "PARTIAL";
}> {
  const payload = {
    inputType: "PASTE_CODE",
    code: code || uniqueCodeSnippet("Integration"),
    chainId
  };

  const create = await session.postJson<{
    analysisId?: string;
    error?: { code: string; message: string };
  }>("/api/v1/analysis", payload);

  if (create.status !== 202 || !create.body.analysisId) {
    throw new Error(`Create analysis failed: ${JSON.stringify(create.body)}`);
  }

  const terminal = await waitForAnalysisTerminal(session, create.body.analysisId);

  if (!terminal.reportId) {
    throw new Error(`Analysis did not produce reportId: ${JSON.stringify(terminal)}`);
  }

  if (
    terminal.status !== "COMPLETED" &&
    terminal.status !== "DONE_WITH_WARNINGS" &&
    terminal.status !== "PARTIAL"
  ) {
    throw new Error(`Analysis terminal status is ${terminal.status}`);
  }

  return {
    analysisId: terminal.analysisId,
    reportId: terminal.reportId,
    privateToken: terminal.privateToken,
    terminalStatus: terminal.status
  };
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

export async function authenticateWallet(
  session: HttpSession,
  privateKey?: Hex
): Promise<{ walletAddress: string; privateKey: Hex }> {
  const key = privateKey || (generatePrivateKey() as Hex);
  const account = privateKeyToAccount(key);

  const nonceResponse = await session.postJson<{
    wallet?: string;
    nonce?: string;
    message?: string;
    error?: { code: string; message: string };
  }>("/api/v1/auth/nonce", {
    wallet: account.address
  });

  if (nonceResponse.status !== 200 || !nonceResponse.body.nonce || !nonceResponse.body.message) {
    throw new Error(`Nonce request failed: ${JSON.stringify(nonceResponse.body)}`);
  }

  const signature = await account.signMessage({
    message: buildSignMessage(nonceResponse.body.nonce)
  });

  const verifyResponse = await session.postJson<{
    ok?: boolean;
    wallet?: string;
    userId?: string;
    error?: { code: string; message: string };
  }>("/api/v1/auth/verify", {
    wallet: account.address,
    nonce: nonceResponse.body.nonce,
    signature
  });

  if (verifyResponse.status !== 200 || !verifyResponse.body.ok) {
    throw new Error(`Wallet verify failed: ${JSON.stringify(verifyResponse.body)}`);
  }

  return {
    walletAddress: account.address,
    privateKey: key
  };
}

export function prismaForTests(): PrismaClient {
  const url = mustEnv("SQR_TEST_DATABASE_URL");

  return new PrismaClient({
    datasources: {
      db: {
        url
      }
    }
  });
}

export function testChain() {
  const rpcUrl = mustEnv("SQR_TEST_RPC_URL");
  const chainId = Number(mustEnv("SQR_TEST_CHAIN_ID"));

  return defineChain({
    id: chainId,
    name: "IntegrationChain",
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
}

export interface PreparedMintCall {
  to: Address;
  chainId: number;
  functionName: "mintWithSig";
  args: {
    reportHash: Hex;
    contractAddress: Address;
    analyzerVersionHash: Hex;
    owner: Address;
    nonce: string;
    deadline: string;
  };
}

export interface PreparedMintTypedData {
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

export interface PreparedMintPayload {
  typedData: PreparedMintTypedData;
  call: PreparedMintCall;
}

export async function signPreparedMintAuthorization(params: {
  prepared: PreparedMintPayload;
  ownerPrivateKey: Hex;
}): Promise<Hex> {
  const account = privateKeyToAccount(params.ownerPrivateKey);

  return account.signTypedData({
    domain: params.prepared.typedData.domain,
    types: {
      MintAuthorization: params.prepared.typedData.types.MintAuthorization
    },
    primaryType: "MintAuthorization",
    message: {
      reportHash: params.prepared.typedData.message.reportHash,
      contractAddress: params.prepared.typedData.message.contractAddress,
      analyzerVersionHash: params.prepared.typedData.message.analyzerVersionHash,
      owner: params.prepared.typedData.message.owner,
      nonce: BigInt(params.prepared.typedData.message.nonce),
      deadline: BigInt(params.prepared.typedData.message.deadline)
    }
  });
}

export function encodePreparedMintCall(params: {
  prepared: PreparedMintPayload;
  signature: Hex;
}): Hex {
  return encodeFunctionData({
    abi: receiptRegistryAbi,
    functionName: "mintWithSig",
    args: [
      params.prepared.call.args.reportHash,
      params.prepared.call.args.contractAddress,
      params.prepared.call.args.analyzerVersionHash,
      params.prepared.call.args.owner,
      BigInt(params.prepared.call.args.nonce),
      BigInt(params.prepared.call.args.deadline),
      params.signature
    ]
  });
}

export async function sendPreparedReceiptMint(params: {
  to: Hex;
  data: Hex;
  chainId: number;
  privateKey?: Hex;
}): Promise<Hex> {
  const rpcUrl = mustEnv("SQR_TEST_RPC_URL");
  const privateKey = params.privateKey || (mustEnv("SQR_TEST_MINT_PRIVATE_KEY") as Hex);
  const chain = testChain();
  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  if (params.chainId !== chain.id) {
    throw new Error(`Prepared tx chain mismatch: ${params.chainId} != ${chain.id}`);
  }

  if (!isAddress(params.to)) {
    throw new Error(`Invalid tx target: ${params.to}`);
  }

  const hash = await walletClient.sendTransaction({
    to: params.to,
    data: params.data
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function sendSignedPreparedReceiptMint(params: {
  prepared: PreparedMintPayload;
  ownerPrivateKey: Hex;
  submitterPrivateKey?: Hex;
}): Promise<{ txHash: Hex; signature: Hex }> {
  const signature = await signPreparedMintAuthorization({
    prepared: params.prepared,
    ownerPrivateKey: params.ownerPrivateKey
  });

  const data = encodePreparedMintCall({
    prepared: params.prepared,
    signature
  });

  const txHash = await sendPreparedReceiptMint({
    to: params.prepared.call.to,
    data,
    chainId: params.prepared.call.chainId,
    privateKey: params.submitterPrivateKey
  });

  return { txHash, signature };
}

const receiptMintedEvent = parseAbiItem(
  "event ReceiptMinted(bytes32 indexed reportHash, address indexed contractAddress, bytes32 analyzerVersionHash, address owner, address minter, uint256 timestamp, uint256 receiptId)"
);

export async function readMintedEventFromTx(txHash: Hex): Promise<{
  reportHash: Hex;
  contractAddress: Hex;
  owner: Hex;
  minter: Hex;
  receiptId: bigint;
} | null> {
  const rpcUrl = mustEnv("SQR_TEST_RPC_URL");
  const chain = testChain();

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: [receiptMintedEvent],
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName !== "ReceiptMinted") {
        continue;
      }

      return {
        reportHash: decoded.args.reportHash,
        contractAddress: decoded.args.contractAddress,
        owner: decoded.args.owner,
        minter: decoded.args.minter,
        receiptId: decoded.args.receiptId
      };
    } catch {
      // Ignore unrelated logs.
    }
  }

  return null;
}
