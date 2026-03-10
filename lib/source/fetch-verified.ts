import { setTimeout as delay } from "node:timers/promises";

import type { SourceFile } from "@/lib/types";
import { config } from "@/lib/config";

interface BaseScanResultItem {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
}

interface BaseScanPayload {
  status: string;
  message: string;
  result: BaseScanResultItem[] | string;
}

interface VerifiedSourceResponse {
  verified: boolean;
  files: SourceFile[];
  metadata: Record<string, unknown>;
  reason?: string;
}

const BASESCAN_MAX_ATTEMPTS = Number(process.env.SQR_TEST_BASESCAN_MAX_ATTEMPTS || "3");
const BASESCAN_TOTAL_TIMEOUT_MS = Number(process.env.SQR_TEST_BASESCAN_TOTAL_TIMEOUT_MS || "1500");
const BASESCAN_BACKOFF_MS = 120;

function usingSourceStub(): boolean {
  return process.env.SQR_TEST_SOURCE_STUB === "1";
}

function extractFilesFromBaseScanSource(sourceCode: string): SourceFile[] {
  if (!sourceCode.trim()) {
    return [];
  }

  const trimmed = sourceCode.trim();
  const normalizedJsonCandidate =
    trimmed.startsWith("{{") && trimmed.endsWith("}}")
      ? trimmed.slice(1, -1)
      : trimmed;

  try {
    const parsed = JSON.parse(normalizedJsonCandidate) as Record<string, unknown>;
    const sources = parsed.sources as Record<string, { content?: string }> | undefined;

    if (sources && typeof sources === "object") {
      return Object.entries(sources)
        .map(([path, value]) => ({ path, content: value?.content ?? "" }))
        .filter((file) => file.content.length > 0);
    }
  } catch {
    // Not JSON, fallback to single file source.
  }

  return [{ path: "Contract.sol", content: sourceCode }];
}

function resolveBaseScanApiUrl(configuredUrl: string): string {
  const trimmed = configuredUrl.trim();
  if (!trimmed) {
    return "https://api.etherscan.io/v2/api";
  }

  if (trimmed.includes("/v2/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname.includes("basescan.org")) {
      return "https://api.etherscan.io/v2/api";
    }

    if (parsed.pathname.endsWith("/api")) {
      parsed.pathname = `${parsed.pathname.slice(0, -4)}/v2/api`;
      return parsed.toString();
    }
  } catch {
    // keep original
  }

  return trimmed;
}

function classifyBaseScanReason(reason: string): string {
  const normalized = reason.toLowerCase();

  if (
    normalized.includes("contract source code not verified") ||
    normalized.includes("unable to locate contractcode")
  ) {
    return "SOURCE_UNVERIFIED";
  }

  if (normalized.includes("missing/invalid api key") || normalized.includes("invalid api key")) {
    return "BASESCAN_INVALID_API_KEY";
  }

  if (normalized.includes("rate limit")) {
    return "BASESCAN_RATE_LIMIT";
  }

  if (normalized.includes("deprecated v1 endpoint")) {
    return "BASESCAN_V1_DEPRECATED";
  }

  return "BASESCAN_NOTOK";
}

function shouldRetryBaseScan(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  return (
    reason === "BASESCAN_RATE_LIMIT" ||
    reason === "BASESCAN_TIMEOUT" ||
    reason === "BASESCAN_MALFORMED_JSON" ||
    reason === "BASESCAN_HTTP_429" ||
    reason === "BASESCAN_HTTP_503"
  );
}

function mockBaseScanResponse(chainId: number, address: string): VerifiedSourceResponse {
  const key = address.toLowerCase();
  const simpleVerified = [
    "// SPDX-License-Identifier: MIT",
    "pragma solidity ^0.8.20;",
    "contract Verified { uint256 public x; }"
  ].join("\n");

  if (key === "0x0000000000000000000000000000000000000001") {
    return {
      verified: true,
      files: [{ path: "Verified.sol", content: simpleVerified }],
      metadata: { sourceProvider: "basescan-v2", chainId, mocked: true }
    };
  }

  if (key === "0x0000000000000000000000000000000000000002") {
    return {
      verified: true,
      files: [{ path: "Proxy.sol", content: simpleVerified }],
      metadata: { sourceProvider: "basescan-v2", chainId, mocked: true, proxy: true, warnings: ["PROXY_DETECTED"] }
    };
  }

  if (key === "0x0000000000000000000000000000000000000003") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_RATE_LIMIT" };
  }

  if (key === "0x0000000000000000000000000000000000000004") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_TIMEOUT" };
  }

  if (key === "0x0000000000000000000000000000000000000005") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_MALFORMED_JSON" };
  }

  if (key === "0x0000000000000000000000000000000000000007") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_INVALID_API_KEY" };
  }

  if (key === "0x0000000000000000000000000000000000000008") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_V1_DEPRECATED" };
  }

  if (key === "0x0000000000000000000000000000000000000009") {
    return { verified: false, files: [], metadata: { mocked: true }, reason: "BASESCAN_NOTOK" };
  }

  return {
    verified: false,
    files: [],
    metadata: { sourceProvider: "basescan-v2", mocked: true },
    reason: "SOURCE_UNVERIFIED"
  };
}

async function fetchFromBaseScanOnce(chainId: number, address: string, timeoutMs: number): Promise<VerifiedSourceResponse> {
  if (usingSourceStub()) {
    return mockBaseScanResponse(chainId, address);
  }

  const url = new URL(resolveBaseScanApiUrl(config.BASESCAN_API_URL));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);
  url.searchParams.set("chainid", String(chainId));

  if (config.BASESCAN_API_KEY) {
    url.searchParams.set("apikey", config.BASESCAN_API_KEY);
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(100, timeoutMs))
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        verified: false,
        files: [],
        metadata: { sourceProvider: "basescan-v2", url: url.toString() },
        reason: "BASESCAN_TIMEOUT"
      };
    }

    throw error;
  }

  if (!response.ok) {
    return {
      verified: false,
      files: [],
      metadata: {
        sourceProvider: "basescan-v2",
        url: url.toString()
      },
      reason: `BASESCAN_HTTP_${response.status}`
    };
  }

  let payload: BaseScanPayload;

  try {
    payload = (await response.json()) as BaseScanPayload;
  } catch {
    return {
      verified: false,
      files: [],
      metadata: {
        sourceProvider: "basescan-v2",
        url: url.toString()
      },
      reason: "BASESCAN_MALFORMED_JSON"
    };
  }

  if (payload.status !== "1" || !Array.isArray(payload.result)) {
    const reasonMessage =
      typeof payload.result === "string" && payload.result.trim().length > 0
        ? payload.result
        : payload.message || "NOTOK";

    return {
      verified: false,
      files: [],
      metadata: {
        sourceProvider: "basescan-v2",
        status: payload.status,
        message: payload.message,
        reasonMessage
      },
      reason: classifyBaseScanReason(reasonMessage)
    };
  }

  const item = payload.result?.[0];
  if (!item || !item.SourceCode || item.SourceCode.trim().length === 0) {
    return {
      verified: false,
      files: [],
      metadata: {
        sourceProvider: "basescan-v2"
      },
      reason: "SOURCE_UNVERIFIED"
    };
  }

  const files = extractFilesFromBaseScanSource(item.SourceCode);

  return {
    verified: files.length > 0,
    files,
    metadata: {
      sourceProvider: "basescan-v2",
      contractName: item.ContractName,
      compilerVersion: item.CompilerVersion,
      optimizationUsed: item.OptimizationUsed,
      runs: item.Runs,
      licenseType: item.LicenseType,
      proxy: item.Proxy === "1"
    },
    reason: files.length > 0 ? undefined : "SOURCE_UNVERIFIED"
  };
}

async function fetchFromBaseScan(chainId: number, address: string): Promise<VerifiedSourceResponse> {
  const startedAt = Date.now();
  let attempt = 0;
  let last: VerifiedSourceResponse = {
    verified: false,
    files: [],
    metadata: {},
    reason: "SOURCE_UNVERIFIED"
  };

  while (attempt < BASESCAN_MAX_ATTEMPTS && Date.now() - startedAt < BASESCAN_TOTAL_TIMEOUT_MS) {
    attempt += 1;
    const remaining = BASESCAN_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    last = await fetchFromBaseScanOnce(chainId, address, remaining);

    if (last.verified || !shouldRetryBaseScan(last.reason)) {
      return {
        ...last,
        metadata: {
          ...last.metadata,
          basescanAttempts: attempt
        }
      };
    }

    if (attempt >= BASESCAN_MAX_ATTEMPTS) {
      break;
    }

    if (Date.now() - startedAt + BASESCAN_BACKOFF_MS >= BASESCAN_TOTAL_TIMEOUT_MS) {
      break;
    }

    await delay(BASESCAN_BACKOFF_MS);
  }

  return {
    ...last,
    metadata: {
      ...last.metadata,
      basescanAttempts: attempt,
      basescanRetryBudgetMs: BASESCAN_TOTAL_TIMEOUT_MS
    }
  };
}

function mockSourcifyResponse(chainId: number, address: string): VerifiedSourceResponse {
  const key = address.toLowerCase();

  if (key === "0x0000000000000000000000000000000000000006") {
    return {
      verified: true,
      files: [
        {
          path: "SourcifyOnly.sol",
          content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract SourcifyOnly { uint256 public x; }"
        }
      ],
      metadata: {
        sourceProvider: "sourcify",
        mocked: true,
        chainId
      }
    };
  }

  return {
    verified: false,
    files: [],
    metadata: {
      sourceProvider: "sourcify",
      mocked: true
    },
    reason: "SOURCE_UNVERIFIED"
  };
}

async function fetchFromSourcify(chainId: number, address: string): Promise<VerifiedSourceResponse> {
  if (usingSourceStub()) {
    return mockSourcifyResponse(chainId, address);
  }

  const base = `${config.SOURCIFY_API_URL}/${chainId}/${address}`;
  const metadataUrl = `${base}/metadata.json`;

  let metadataResp: Response;
  try {
    metadataResp = await fetch(metadataUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(config.SOURCE_FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return {
        verified: false,
        files: [],
        metadata: { sourceProvider: "sourcify", url: metadataUrl },
        reason: "SOURCIFY_TIMEOUT"
      };
    }
    throw error;
  }

  if (!metadataResp.ok) {
    return {
      verified: false,
      files: [],
      metadata: {},
      reason: `SOURCIFY_HTTP_${metadataResp.status}`
    };
  }

  const metadata = (await metadataResp.json()) as {
    compiler?: { version?: string };
    sources?: Record<string, unknown>;
  };

  const sourcePaths = Object.keys(metadata.sources ?? {});
  if (sourcePaths.length === 0) {
    return {
      verified: false,
      files: [],
      metadata: {},
      reason: "SOURCE_UNVERIFIED"
    };
  }

  const files: SourceFile[] = [];

  for (const sourcePath of sourcePaths) {
    const sourceUrl = `${base}/sources/${sourcePath}`;
    let sourceResp: Response;

    try {
      sourceResp = await fetch(sourceUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(config.SOURCE_FETCH_TIMEOUT_MS)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        return {
          verified: false,
          files: [],
          metadata: { sourceProvider: "sourcify", url: sourceUrl },
          reason: "SOURCIFY_TIMEOUT"
        };
      }
      throw error;
    }

    if (!sourceResp.ok) {
      continue;
    }
    files.push({ path: sourcePath, content: await sourceResp.text() });
  }

  return {
    verified: files.length > 0,
    files,
    metadata: {
      sourceProvider: "sourcify",
      compilerVersion: metadata.compiler?.version
    },
    reason: files.length > 0 ? undefined : "SOURCE_UNVERIFIED"
  };
}

export async function fetchVerifiedSource(params: {
  chainId: number;
  address: string;
}): Promise<VerifiedSourceResponse> {
  const { chainId, address } = params;

  const basescan = await fetchFromBaseScan(chainId, address);
  if (basescan.verified) {
    return basescan;
  }

  const sourcify = await fetchFromSourcify(chainId, address);
  if (sourcify.verified) {
    return sourcify;
  }

  const reasons = [basescan.reason, sourcify.reason].filter((value): value is string => Boolean(value));
  const preferredReason = reasons.find((value) => value !== "SOURCE_UNVERIFIED") ?? "SOURCE_UNVERIFIED";

  return {
    verified: false,
    files: [],
    metadata: {
      basescanReason: basescan.reason,
      sourcifyReason: sourcify.reason
    },
    reason: preferredReason
  };
}
