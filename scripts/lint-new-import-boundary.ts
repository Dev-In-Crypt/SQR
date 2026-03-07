import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Violation = {
  file: string;
  line: number;
  specifier: string;
  suggestion: string;
};

const ALLOWED_FACADES = new Set<string>([
  "@/lib/core",
  "@/lib/infra",
  "@/lib/runtime",
  "@/lib/domains/analysis",
  "@/lib/domains/auth",
  "@/lib/domains/receipt"
]);

const FACADES_LIST = Array.from(ALLOWED_FACADES).join(", ");

const CORE_MODULES = new Set<string>([
  "api",
  "config",
  "db",
  "errors",
  "logger",
  "types",
  "hash",
  "canonical-json",
  "crypto"
]);

const INFRA_MODULES = new Set<string>([
  "queue",
  "redis",
  "rate-limit",
  "request-context"
]);

const RUNTIME_MODULES = new Set<string>([
  "eip1193",
  "wallet-chain",
  "ui-error-messages"
]);

const ANALYSIS_MODULES = new Set<string>([
  "snippet-validation",
  "source",
  "scanner",
  "report",
  "llm",
  "partial-reasons",
  "prompts",
  "pipeline"
]);

const AUTH_MODULES = new Set<string>([
  "auth",
  "session",
  "acl",
  "validation",
  "client-ip"
]);

const RECEIPT_MODULES = new Set<string>([
  "base-network",
  "receipt",
  "receipt-shared"
]);

const IGNORED_PREFIXES = [
  ".next/",
  ".next-test/",
  "node_modules/",
  "coverage/",
  "output/",
  "dist/",
  "cache/",
  "contracts/out/"
];

function runGit(args: string[]): string[] {
  try {
    const output = execFileSync("git", args, { encoding: "utf8" }).trim();
    return output === "" ? [] : output.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, "/");
}

function isCandidateFile(file: string): boolean {
  const normalized = normalizeFile(file);
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".tsx")) {
    return false;
  }

  if (normalized.endsWith(".d.ts")) {
    return false;
  }

  return !IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function readNewFiles(): string[] {
  const added = runGit(["diff", "--name-only", "--diff-filter=A", "HEAD"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  const unique = new Set<string>([...added, ...untracked].map(normalizeFile));

  return Array.from(unique)
    .filter(isCandidateFile)
    .filter((file) => existsSync(path.resolve(process.cwd(), file)));
}

function toLineNumber(source: string, index: number): number {
  const slice = source.slice(0, index);
  const breaks = slice.match(/\r?\n/g);
  return (breaks?.length ?? 0) + 1;
}

function suggestFacade(specifier: string): string {
  const modulePath = specifier.slice("@/lib/".length);
  const top = modulePath.split("/")[0];

  if (CORE_MODULES.has(top)) {
    return "@/lib/core";
  }
  if (INFRA_MODULES.has(top)) {
    return "@/lib/infra";
  }
  if (RUNTIME_MODULES.has(top)) {
    return "@/lib/runtime";
  }
  if (ANALYSIS_MODULES.has(top)) {
    return "@/lib/domains/analysis";
  }
  if (AUTH_MODULES.has(top)) {
    return "@/lib/domains/auth";
  }
  if (RECEIPT_MODULES.has(top)) {
    return "@/lib/domains/receipt";
  }

  return FACADES_LIST;
}

function collectSpecifiers(source: string): Array<{ specifier: string; index: number }> {
  const found: Array<{ specifier: string; index: number }> = [];
  const pattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},$]+\s+from\s+)?["']([^"'`\r\n]+)["']|\bimport\(\s*["']([^"'`\r\n]+)["']\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const specifier = (match[1] ?? match[2] ?? "").trim();
    if (specifier.length === 0) {
      continue;
    }

    found.push({ specifier, index: match.index });
  }

  return found;
}

function collectViolations(file: string): Violation[] {
  const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
  const entries = collectSpecifiers(source);
  const violations: Violation[] = [];

  for (const entry of entries) {
    if (!entry.specifier.startsWith("@/lib/")) {
      continue;
    }

    if (ALLOWED_FACADES.has(entry.specifier)) {
      continue;
    }

    violations.push({
      file,
      line: toLineNumber(source, entry.index),
      specifier: entry.specifier,
      suggestion: suggestFacade(entry.specifier)
    });
  }

  return violations;
}

function printWarnings(violations: Violation[]): void {
  console.warn("[boundary-guard] Found non-facade @/lib imports in new files:");

  for (const violation of violations) {
    console.warn(
      `  - ${violation.file}:${violation.line} imports "${violation.specifier}". Prefer "${violation.suggestion}".`
    );
  }

  console.warn(`[boundary-guard] Allowed facades: ${FACADES_LIST}`);
  console.warn(
    "[boundary-guard] Legacy imports stay valid during MVP. This guard is warning-only unless BOUNDARY_GUARD_STRICT=1."
  );
}

function main(): void {
  const files = readNewFiles();
  if (files.length === 0) {
    console.log("[boundary-guard] No new TypeScript files to check.");
    return;
  }

  const violations = files.flatMap((file) => collectViolations(file));
  if (violations.length === 0) {
    console.log("[boundary-guard] OK: new files use facade imports.");
    return;
  }

  printWarnings(violations);

  if (process.env.BOUNDARY_GUARD_STRICT === "1") {
    process.exitCode = 1;
    console.error("[boundary-guard] Strict mode enabled: exiting with code 1.");
  }
}

main();
