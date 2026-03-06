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

function extractFilesFromBaseScanSource(sourceCode: string): SourceFile[] {
  if (!sourceCode.trim()) {
    return [];
  }

  const trimmed = sourceCode.trim();

  // Etherscan-compatible format can wrap JSON with double braces.
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
    // Not a JSON payload, keep fallback below.
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

    // BaseScan's old v1 host should route through Etherscan v2.
    if (parsed.hostname.includes("basescan.org")) {
      return "https://api.etherscan.io/v2/api";
    }

    if (parsed.pathname.endsWith("/api")) {
      parsed.pathname = `${parsed.pathname.slice(0, -4)}/v2/api`;
      return parsed.toString();
    }
  } catch {
    // Fall through to raw URL.
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

async function fetchFromBaseScan(chainId: number, address: string): Promise<VerifiedSourceResponse> {
  const url = new URL(resolveBaseScanApiUrl(config.BASESCAN_API_URL));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);
  url.searchParams.set("chainid", String(chainId));

  if (config.BASESCAN_API_KEY) {
    url.searchParams.set("apikey", config.BASESCAN_API_KEY);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

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

  const payload = (await response.json()) as BaseScanPayload;

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
      licenseType: item.LicenseType
    },
    reason: files.length > 0 ? undefined : "SOURCE_UNVERIFIED"
  };
}

async function fetchFromSourcify(chainId: number, address: string): Promise<VerifiedSourceResponse> {
  const base = `${config.SOURCIFY_API_URL}/${chainId}/${address}`;
  const metadataUrl = `${base}/metadata.json`;

  const metadataResp = await fetch(metadataUrl, { cache: "no-store" });
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
    const sourceResp = await fetch(`${base}/sources/${sourcePath}`, { cache: "no-store" });
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
