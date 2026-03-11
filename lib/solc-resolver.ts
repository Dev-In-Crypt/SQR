import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { config } from "@/lib/config";
import {
  compareSolidityVersion,
  extractSolidityPragmaFromFiles,
  formatSolidityVersion,
  isVersionCompatibleWithConstraint,
  parseSolidityVersion,
  type SolidityVersion
} from "@/lib/solidity-pragma";
import type { SourceBundle } from "@/lib/types";

export interface SolcCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

export interface SolcCommandRunner {
  runCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
    }
  ): Promise<SolcCommandResult>;
}

export interface ResolvedSolcRuntime {
  requestedPragma: string | null;
  requestedPragmaFilePath: string | null;
  resolvedSolcVersion: string | null;
  resolvedBinaryPath: string;
  resolutionStrategy:
    | "solc_path"
    | "solc_fallback_path"
    | "path_solc"
    | "solc_select_version"
    | "solc_select_unresolved"
    | "pragma_unresolved";
  failureReason: string | null;
  command: string;
  commandEnv: NodeJS.ProcessEnv | undefined;
  attemptedPath: string;
  solcPathSet: boolean;
  unresolvedPragmaConstraint: boolean;
}

interface SolcCommandTarget {
  command: string;
  resolvedBinaryPath: string;
  attemptedPath: string;
  solcPathSet: boolean;
  strategy: "solc_path" | "solc_fallback_path" | "path_solc";
  failureReason?: string;
}

function normalizeManager(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isAutoResolveEnabled(): boolean {
  return config.ENABLE_SOLC_AUTO_RESOLVE.toLowerCase() === "true";
}

function managerIsSolcSelect(): boolean {
  return normalizeManager(config.SOLC_VERSION_MANAGER) === "solc-select";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveConfiguredCommandTarget(): Promise<SolcCommandTarget> {
  const configuredSolcPath = config.SOLC_PATH?.trim();
  if (configuredSolcPath) {
    if (!isAbsolute(configuredSolcPath)) {
      return {
        command: configuredSolcPath,
        resolvedBinaryPath: configuredSolcPath,
        attemptedPath: configuredSolcPath,
        solcPathSet: true,
        strategy: "solc_path",
        failureReason: "SOLC_PATH must be an absolute path."
      };
    }
    if (!(await pathExists(configuredSolcPath))) {
      return {
        command: configuredSolcPath,
        resolvedBinaryPath: configuredSolcPath,
        attemptedPath: configuredSolcPath,
        solcPathSet: true,
        strategy: "solc_path",
        failureReason: "SOLC_PATH does not exist."
      };
    }
    return {
      command: configuredSolcPath,
      resolvedBinaryPath: configuredSolcPath,
      attemptedPath: configuredSolcPath,
      solcPathSet: true,
      strategy: "solc_path"
    };
  }

  const fallbackPath = config.SOLC_FALLBACK_PATH?.trim();
  if (fallbackPath) {
    if (!isAbsolute(fallbackPath)) {
      return {
        command: fallbackPath,
        resolvedBinaryPath: fallbackPath,
        attemptedPath: fallbackPath,
        solcPathSet: false,
        strategy: "solc_fallback_path",
        failureReason: "SOLC_FALLBACK_PATH must be an absolute path."
      };
    }
    if (!(await pathExists(fallbackPath))) {
      return {
        command: fallbackPath,
        resolvedBinaryPath: fallbackPath,
        attemptedPath: fallbackPath,
        solcPathSet: false,
        strategy: "solc_fallback_path",
        failureReason: "SOLC_FALLBACK_PATH does not exist."
      };
    }
    return {
      command: fallbackPath,
      resolvedBinaryPath: fallbackPath,
      attemptedPath: fallbackPath,
      solcPathSet: false,
      strategy: "solc_fallback_path"
    };
  }

  return {
    command: "solc",
    resolvedBinaryPath: "solc",
    attemptedPath: "solc",
    solcPathSet: false,
    strategy: "path_solc"
  };
}

function parseSolcVersionOutput(result: SolcCommandResult): SolidityVersion | null {
  const combined = `${result.stdout}\n${result.stderr}`;
  const explicit = combined.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i);
  if (explicit?.[1]) {
    return parseSolidityVersion(explicit[1]);
  }

  const fallback = combined.match(/\b([0-9]+\.[0-9]+\.[0-9]+)(?:\+|\b)/);
  if (fallback?.[1]) {
    return parseSolidityVersion(fallback[1]);
  }

  return null;
}

function getPreferredVersionMatch(versions: SolidityVersion[], requestedPragma: string): SolidityVersion | null {
  const parsedPragma = parseSolidityVersion(requestedPragma.replace(/^\^\s*/, ""));
  if (!parsedPragma) {
    return null;
  }

  const exact = versions.find((item) => compareSolidityVersion(item, parsedPragma) === 0);
  return exact ?? null;
}

function selectBestCompatibleVersion(
  versions: SolidityVersion[],
  constraint: NonNullable<ReturnType<typeof extractSolidityPragmaFromFiles>>["pragma"]["constraint"]
): SolidityVersion | null {
  if (!constraint) {
    return null;
  }

  const compatibles = versions.filter((item) => isVersionCompatibleWithConstraint(item, constraint));
  if (compatibles.length === 0) {
    return null;
  }

  compatibles.sort((a, b) => compareSolidityVersion(b, a));
  return compatibles[0];
}

function parseInstalledVersions(raw: string): SolidityVersion[] {
  const versions: SolidityVersion[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([0-9]+\.[0-9]+\.[0-9]+)\b/);
    if (!match?.[1]) {
      continue;
    }
    const parsed = parseSolidityVersion(match[1]);
    if (parsed) {
      versions.push(parsed);
    }
  }

  return versions;
}

function buildManagerEnv(base: NodeJS.ProcessEnv, version: string): NodeJS.ProcessEnv {
  return {
    ...base,
    SOLC_VERSION: version
  };
}

function pragmaIsWithinSupportedPolicy(
  constraint: NonNullable<ReturnType<typeof extractSolidityPragmaFromFiles>>["pragma"]["constraint"]
): boolean {
  const isSupportedMinor = (minor: number) => minor === 7 || minor === 8;

  if (!constraint) {
    return false;
  }

  if (constraint.kind === "exact") {
    return constraint.version.major === 0 && isSupportedMinor(constraint.version.minor);
  }

  if (constraint.kind === "caret") {
    return constraint.baseVersion.major === 0 && isSupportedMinor(constraint.baseVersion.minor);
  }

  return (
    constraint.minInclusive.major === 0 &&
    constraint.minInclusive.minor >= 7 &&
    constraint.minInclusive.minor <= 8 &&
    constraint.maxExclusive.major === 0 &&
    constraint.maxExclusive.minor <= 9
  );
}

export async function resolveSolcRuntimeForSource(params: {
  sourceBundle: SourceBundle;
  cwd: string;
  runCommand: SolcCommandRunner["runCommand"];
}): Promise<ResolvedSolcRuntime> {
  const configuredTarget = await resolveConfiguredCommandTarget();
  const pragma = extractSolidityPragmaFromFiles(params.sourceBundle.files);

  const baseResult: ResolvedSolcRuntime = {
    requestedPragma: pragma?.pragma.expression ?? null,
    requestedPragmaFilePath: pragma?.filePath ?? null,
    resolvedSolcVersion: null,
    resolvedBinaryPath: configuredTarget.resolvedBinaryPath,
    resolutionStrategy: configuredTarget.strategy,
    failureReason: configuredTarget.failureReason ?? null,
    command: configuredTarget.command,
    commandEnv: undefined,
    attemptedPath: configuredTarget.attemptedPath,
    solcPathSet: configuredTarget.solcPathSet,
    unresolvedPragmaConstraint: false
  };

  if (!isAutoResolveEnabled() || !pragma?.pragma.constraint) {
    if (pragma && !pragma.pragma.constraint) {
      baseResult.resolutionStrategy = "pragma_unresolved";
      baseResult.failureReason = pragma.pragma.failureReason ?? "UNSUPPORTED_PRAGMA_EXPRESSION";
      baseResult.unresolvedPragmaConstraint = true;
    }
    return baseResult;
  }

  if (!pragmaIsWithinSupportedPolicy(pragma.pragma.constraint)) {
    return {
      ...baseResult,
      resolutionStrategy: "pragma_unresolved",
      failureReason: "PRAGMA_RANGE_NOT_SUPPORTED_FOR_AUTO_RESOLVE",
      unresolvedPragmaConstraint: true
    };
  }

  const preflight = await params.runCommand(configuredTarget.command, ["--version"], {
    cwd: params.cwd,
    env: undefined
  });

  if (preflight.code === 0) {
    const currentVersion = parseSolcVersionOutput(preflight);
    if (currentVersion && isVersionCompatibleWithConstraint(currentVersion, pragma.pragma.constraint)) {
      return {
        ...baseResult,
        resolvedSolcVersion: formatSolidityVersion(currentVersion)
      };
    }
  }

  if (!managerIsSolcSelect()) {
    return {
      ...baseResult,
      resolutionStrategy: "solc_select_unresolved",
      failureReason: "NO_COMPATIBLE_INSTALLED_SOLC_AND_MANAGER_DISABLED",
      unresolvedPragmaConstraint: true
    };
  }

  const versionsResult = await params.runCommand("solc-select", ["versions"], {
    cwd: params.cwd,
    env: undefined
  });

  if (versionsResult.code !== 0) {
    return {
      ...baseResult,
      resolutionStrategy: "solc_select_unresolved",
      failureReason: "SOLC_SELECT_UNAVAILABLE",
      unresolvedPragmaConstraint: true
    };
  }

  const installedVersions = parseInstalledVersions(`${versionsResult.stdout}\n${versionsResult.stderr}`);
  if (installedVersions.length === 0) {
    return {
      ...baseResult,
      resolutionStrategy: "solc_select_unresolved",
      failureReason: "SOLC_SELECT_NO_INSTALLED_VERSIONS",
      unresolvedPragmaConstraint: true
    };
  }

  const exactPreferred = getPreferredVersionMatch(installedVersions, pragma.pragma.expression);
  const selected = exactPreferred ?? selectBestCompatibleVersion(installedVersions, pragma.pragma.constraint);

  if (!selected) {
    return {
      ...baseResult,
      resolutionStrategy: "solc_select_unresolved",
      failureReason: "SOLC_SELECT_NO_COMPATIBLE_VERSION",
      unresolvedPragmaConstraint: true
    };
  }

  const resolvedSolcVersion = formatSolidityVersion(selected);
  return {
    ...baseResult,
    resolvedSolcVersion,
    resolutionStrategy: "solc_select_version",
    command: "solc",
    resolvedBinaryPath: "solc",
    attemptedPath: "solc",
    commandEnv: buildManagerEnv(process.env, resolvedSolcVersion),
    failureReason: null,
    unresolvedPragmaConstraint: false
  };
}
