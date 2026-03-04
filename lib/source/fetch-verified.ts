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

async function fetchFromBaseScan(address: string): Promise<VerifiedSourceResponse> {
  const url = new URL(config.BASESCAN_API_URL);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getsourcecode");
  url.searchParams.set("address", address);

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
      metadata: {},
      reason: `BASESCAN_HTTP_${response.status}`
    };
  }

  const payload = (await response.json()) as {
    status: string;
    message: string;
    result: BaseScanResultItem[];
  };

  const item = payload.result?.[0];
  if (!item || !item.SourceCode || item.SourceCode.trim().length === 0) {
    return {
      verified: false,
      files: [],
      metadata: {},
      reason: "SOURCE_UNVERIFIED"
    };
  }

  const files = extractFilesFromBaseScanSource(item.SourceCode);

  return {
    verified: files.length > 0,
    files,
    metadata: {
      sourceProvider: "basescan",
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

  const basescan = await fetchFromBaseScan(address);
  if (basescan.verified) {
    return basescan;
  }

  const sourcify = await fetchFromSourcify(chainId, address);
  if (sourcify.verified) {
    return sourcify;
  }

  return {
    verified: false,
    files: [],
    metadata: {
      basescanReason: basescan.reason,
      sourcifyReason: sourcify.reason
    },
    reason: "SOURCE_UNVERIFIED"
  };
}
