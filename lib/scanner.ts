import { constants as fsConstants } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

import { config } from "@/lib/config";
import { hashCanonical } from "@/lib/hash";
import { resolveSolcRuntimeForSource } from "@/lib/solc-resolver";
import type { Finding, ScannerOutput, Severity, SourceBundle } from "@/lib/types";

const DIAGNOSTIC_LIMIT = 3000;

const SLITHER_DETECTORS = [
  "reentrancy-eth",
  "reentrancy-no-eth",
  "unchecked-transfer",
  "unchecked-lowlevel",
  "unchecked-send",
  "weak-prng",
  "arbitrary-send-eth",
  "tx-origin",
  "controlled-delegatecall",
  "unprotected-upgrade",
  "missing-zero-check"
];

type SlitherRuntimeMode = "snippet" | "project";
type CompileFramework = "solc" | "foundry";

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

export interface ScannerRuntime {
  runCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
    }
  ): Promise<CommandResult>;
}

interface SlitherExecutionPlan {
  compileFramework: CompileFramework;
  entryPoint: string;
  cwd: string;
  standalone: boolean;
  cleanupDir?: string;
}

interface FoundryExecutionPlan {
  cwd: string;
  standalone: boolean;
  cleanupDir?: string;
}

interface SlitherDetector {
  check?: string;
  impact?: string;
  confidence?: string;
  description?: string;
  elements?: Array<{
    source_mapping?: {
      filename_relative?: string;
      lines?: number[];
    };
  }>;
}

interface SlitherJsonOutput {
  success?: boolean;
  error?: string | null;
  results?: {
    detectors?: SlitherDetector[];
  };
}

interface AderynInstance {
  contract_path?: string;
  line_no?: number;
}

interface AderynIssue {
  title?: string;
  description?: string;
  detector_name?: string;
  instances?: AderynInstance[];
}

interface AderynJsonOutput {
  issue_count?: { high?: number; low?: number };
  high_issues?: { issues?: AderynIssue[] };
  low_issues?: { issues?: AderynIssue[] };
}

const defaultScannerRuntime: ScannerRuntime = {
  async runCommand(command, args, options) {
    return await new Promise<CommandResult>((resolvePromise) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let errorMessage: string | undefined;
      let settled = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const clearTimer = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const finish = (result: CommandResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer();
        resolvePromise(result);
      };

      if (options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          errorMessage = `COMMAND_TIMEOUT_${options.timeoutMs}MS`;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) {
              child.kill("SIGKILL");
            }
          }, 500).unref();
        }, options.timeoutMs).unref();
      }

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        errorMessage = error.message;
        finish({
          code: null,
          stdout,
          stderr,
          errorMessage
        });
      });

      child.on("exit", (code) => {
        finish({
          code,
          stdout,
          stderr,
          errorMessage
        });
      });
    });
  }
};

function severityFromImpact(impact: string): Severity {
  const normalized = impact.toLowerCase();
  if (normalized.includes("high")) return "HIGH";
  if (normalized.includes("medium")) return "MEDIUM";
  if (normalized.includes("low")) return "LOW";
  return "INFO";
}

function confidenceScore(raw: string): number {
  const normalized = raw.toLowerCase();
  if (normalized.includes("high")) return 90;
  if (normalized.includes("medium")) return 70;
  if (normalized.includes("low")) return 50;
  return 40;
}

function findLine(content: string, pattern: RegExp): number | undefined {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      return i + 1;
    }
  }
  return undefined;
}

function extractLine(content: string, line?: number): string {
  if (!line) {
    return content.slice(0, 180);
  }
  const lines = content.split("\n");
  return lines[line - 1]?.trim().slice(0, 220) ?? "";
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();

  for (const finding of findings) {
    if (!map.has(finding.fingerprint)) {
      map.set(finding.fingerprint, finding);
    }
  }

  return [...map.values()];
}

function dedupeMessages(messages: string[]): string[] {
  return [...new Set(messages.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function truncateDiagnostic(raw: string): string {
  const text = raw.trim();
  if (!text) {
    return "no diagnostics captured";
  }
  if (text.length <= DIAGNOSTIC_LIMIT) {
    return text;
  }
  return `${text.slice(0, DIAGNOSTIC_LIMIT - 14)}...(truncated)`;
}

function normalizeWorkspaceRelativePath(rawPath: string | undefined, index: number): string {
  const fallback = `Source${index + 1}.sol`;
  if (!rawPath) {
    return fallback;
  }

  const withoutDrive = rawPath.replace(/^[A-Za-z]:[\\/]/, "");
  const withoutLeadingSlash = withoutDrive.replace(/^[\\/]+/, "");
  let candidate = normalize(withoutLeadingSlash);

  while (candidate === ".." || candidate.startsWith(`..${sep}`)) {
    candidate = candidate.slice(3);
  }

  if (!candidate || candidate === ".") {
    candidate = fallback;
  }

  if (!candidate.toLowerCase().endsWith(".sol")) {
    candidate = `${candidate}.sol`;
  }

  return candidate;
}

function normalizePathForRemapping(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\//, "");
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ");
}

function extractImportPaths(files: SourceBundle["files"]): string[] {
  const imports = new Set<string>();

  for (const file of files) {
    const sanitized = stripComments(file.content);
    const regex = /\bimport\s+(?:[^"']*?from\s+)?["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sanitized)) !== null) {
      const candidate = match[1]?.trim();
      if (!candidate) {
        continue;
      }
      if (candidate.startsWith(".") || candidate.startsWith("/")) {
        continue;
      }
      imports.add(normalizePathForRemapping(candidate));
    }
  }

  return [...imports];
}

function buildSolcRemappings(sourceBundle: SourceBundle): string[] {
  const filePaths = sourceBundle.files.map((file) => normalizePathForRemapping(file.path));
  const importPaths = extractImportPaths(sourceBundle.files);
  const remaps = new Map<string, string>();

  for (const importPath of importPaths) {
    const slashIndex = importPath.indexOf("/");
    if (slashIndex <= 0) {
      continue;
    }

    const aliasRoot = importPath.slice(0, slashIndex);
    const remainder = importPath.slice(slashIndex + 1);
    if (!remainder) {
      continue;
    }

    const matchingFile = filePaths.find((path) => path.endsWith(remainder));
    if (!matchingFile) {
      continue;
    }

    const targetRoot = matchingFile.slice(0, matchingFile.length - remainder.length);
    if (!targetRoot) {
      continue;
    }

    const alias = aliasRoot.endsWith("/") ? aliasRoot : `${aliasRoot}/`;
    const target = targetRoot.endsWith("/") ? targetRoot : `${targetRoot}/`;

    const existing = remaps.get(alias);
    if (!existing || target.length < existing.length) {
      remaps.set(alias, target);
    }
  }

  return [...remaps.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([alias, target]) => `${alias}=${target}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isWithinPath(child: string, parent: string): boolean {
  const childResolved = resolve(child);
  const parentResolved = resolve(parent);

  if (process.platform === "win32") {
    const childLower = childResolved.toLowerCase();
    const parentLower = parentResolved.toLowerCase();
    return childLower === parentLower || childLower.startsWith(`${parentLower}${sep}`);
  }

  return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${sep}`);
}

async function findFoundryProjectRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);

  for (;;) {
    if (await pathExists(join(current, "foundry.toml"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function resolveExistingEntryPoint(sourceBundle: SourceBundle): Promise<string | null> {
  const firstPath = sourceBundle.files[0]?.path;
  if (!firstPath) {
    return null;
  }

  const candidates: string[] = [];
  if (isAbsolute(firstPath)) {
    candidates.push(firstPath);
  }
  candidates.push(resolve(process.cwd(), firstPath));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function materializeSourceBundle(
  sourceBundle: SourceBundle
): Promise<{ workDir: string; entryPoint: string }> {
  const workDir = await mkdtemp(join(tmpdir(), "sqr-slither-"));
  const relativePaths: string[] = [];

  for (let i = 0; i < sourceBundle.files.length; i += 1) {
    const file = sourceBundle.files[i];
    const relativePath = normalizeWorkspaceRelativePath(file.path, i);
    relativePaths.push(relativePath);

    const absolutePath = join(workDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
  }

  const entryRelativePath = relativePaths[0] ?? "PastedSnippet.sol";
  const entryPoint = join(workDir, entryRelativePath);

  if (!(await pathExists(entryPoint))) {
    await writeFile(entryPoint, sourceBundle.files[0]?.content ?? "", "utf8");
  }

  return {
    workDir,
    entryPoint
  };
}

async function createSlitherExecutionPlan(
  sourceBundle: SourceBundle,
  runtimeMode: SlitherRuntimeMode
): Promise<SlitherExecutionPlan> {
  if (runtimeMode === "snippet") {
    const workspace = await materializeSourceBundle(sourceBundle);
    return {
      compileFramework: "solc",
      entryPoint: workspace.entryPoint,
      cwd: workspace.workDir,
      standalone: true,
      cleanupDir: workspace.workDir
    };
  }

  const existingEntryPoint = await resolveExistingEntryPoint(sourceBundle);
  if (existingEntryPoint) {
    const foundryRoot = await findFoundryProjectRoot(dirname(existingEntryPoint));
    if (foundryRoot && isWithinPath(existingEntryPoint, foundryRoot)) {
      return {
        compileFramework: "foundry",
        entryPoint: existingEntryPoint,
        cwd: foundryRoot,
        standalone: false
      };
    }
  }

  const workspace = await materializeSourceBundle(sourceBundle);
  return {
    compileFramework: "solc",
    entryPoint: workspace.entryPoint,
    cwd: workspace.workDir,
    standalone: true,
    cleanupDir: workspace.workDir
  };
}

async function createFoundryExecutionPlan(
  sourceBundle: SourceBundle,
  runtimeMode: SlitherRuntimeMode
): Promise<FoundryExecutionPlan> {
  if (runtimeMode === "snippet") {
    const workspace = await materializeSourceBundle(sourceBundle);
    return {
      cwd: workspace.workDir,
      standalone: true,
      cleanupDir: workspace.workDir
    };
  }

  const existingEntryPoint = await resolveExistingEntryPoint(sourceBundle);
  if (existingEntryPoint) {
    const foundryRoot = await findFoundryProjectRoot(dirname(existingEntryPoint));
    if (foundryRoot && isWithinPath(existingEntryPoint, foundryRoot)) {
      return {
        cwd: foundryRoot,
        standalone: false
      };
    }
  }

  const workspace = await materializeSourceBundle(sourceBundle);
  return {
    cwd: workspace.workDir,
    standalone: true,
    cleanupDir: workspace.workDir
  };
}

function buildFoundryToml(sourceBundle: SourceBundle): string {
  const remappings = buildSolcRemappings(sourceBundle);
  const lines = [
    "[profile.default]",
    'src = "."',
    'out = "out"',
    'test = "test"',
    'script = "script"',
    'libs = ["lib", "node_modules"]'
  ];

  if (remappings.length > 0) {
    const remappingsLiteral = remappings.map((item) => `"${item}"`).join(", ");
    lines.push(`remappings = [${remappingsLiteral}]`);
  }

  return `${lines.join("\n")}\n`;
}

function buildForgeDiagnostics(params: {
  code: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}): string {
  const parts: string[] = [];
  if (params.stderr.trim()) {
    parts.push(`stderr=${params.stderr.trim()}`);
  }
  if (params.stdout.trim()) {
    parts.push(`stdout=${params.stdout.trim()}`);
  }
  if (params.errorMessage?.trim()) {
    parts.push(`spawnError=${params.errorMessage.trim()}`);
  }
  if (parts.length === 0) {
    parts.push(`exitCode=${params.code ?? "unknown"}`);
  }

  const compact = parts.join(" | ").replace(/\s+/g, " ");
  return truncateDiagnostic(compact);
}

async function readSlitherOutput(
  outputPath: string
): Promise<{ parsed: SlitherJsonOutput | null; parseError?: string }> {
  if (!(await pathExists(outputPath))) {
    return { parsed: null };
  }

  try {
    const raw = await readFile(outputPath, "utf8");
    return {
      parsed: JSON.parse(raw) as SlitherJsonOutput
    };
  } catch (error) {
    return {
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildSlitherDiagnostics(params: {
  code: number | null;
  stdout: string;
  stderr: string;
  outputError?: string | null;
  parseError?: string;
  errorMessage?: string;
}): string {
  const parts: string[] = [];
  if (params.outputError?.trim()) {
    parts.push(`outputError=${params.outputError.trim()}`);
  }
  if (params.parseError?.trim()) {
    parts.push(`outputParseError=${params.parseError.trim()}`);
  }
  if (params.stderr.trim()) {
    parts.push(`stderr=${params.stderr.trim()}`);
  }
  if (params.stdout.trim()) {
    parts.push(`stdout=${params.stdout.trim()}`);
  }
  if (params.errorMessage?.trim()) {
    parts.push(`spawnError=${params.errorMessage.trim()}`);
  }
  if (parts.length === 0) {
    parts.push(`exitCode=${params.code ?? "unknown"}`);
  }
  const compact = parts.join(" | ").replace(/\s+/g, " ");
  return truncateDiagnostic(compact);
}
function pushSolcMissingWarnings(params: {
  warnings: string[];
  solcPathSet: boolean;
  attemptedPath: string;
  reason: string;
}): void {
  params.warnings.push("SLITHER_SKIPPED_SOLC_MISSING");
  params.warnings.push(
    `SLITHER_SKIPPED_SOLC_MISSING_DETAIL: SOLC_PATH set=${String(params.solcPathSet)}; attempted=${params.attemptedPath}; reason=${params.reason}`
  );
}

function pushSolcResolutionWarnings(params: {
  warnings: string[];
  requestedPragma: string | null;
  filePath: string | null;
  strategy: string;
  reason: string;
}): void {
  params.warnings.push("SLITHER_SOLC_VERSION_UNRESOLVED");
  params.warnings.push(
    [
      "SLITHER_SOLC_VERSION_UNRESOLVED_DETAIL:",
      `pragma=${params.requestedPragma ?? "unknown"};`,
      `file=${params.filePath ?? "unknown"};`,
      `strategy=${params.strategy};`,
      `reason=${params.reason}`
    ].join(" ")
  );
}

function toSlitherFinding(detector: SlitherDetector): Finding {
  const filePath = detector.elements?.[0]?.source_mapping?.filename_relative ?? "unknown";
  const line = detector.elements?.[0]?.source_mapping?.lines?.[0];
  const description = detector.description?.trim() ?? detector.check ?? "Potential issue";
  const excerpt = description.slice(0, 220);
  const fingerprint = hashCanonical({
    check: detector.check,
    filePath,
    line,
    excerpt
  });

  return {
    id: fingerprint,
    title: detector.check ?? "Potential issue",
    severity: severityFromImpact(detector.impact ?? "low"),
    evidence: [
      {
        filePath,
        line,
        excerpt
      }
    ],
    whyItMatters:
      "The static scanner flagged this pattern as risky and it can change control flow or asset safety.",
    fixDirection:
      "Review the affected code path and apply a defensive pattern specific to this detector.",
    confidence: confidenceScore(detector.confidence ?? "medium"),
    needsManualCheck: false,
    fingerprint
  };
}

function toAderynFinding(issue: AderynIssue, severity: Severity): Finding {
  const instance = issue.instances?.[0];
  const filePath = instance?.contract_path ?? "unknown";
  const line = instance?.line_no;
  const title = issue.detector_name ?? issue.title ?? "aderyn-finding";
  const description = (issue.description ?? issue.title ?? "").trim().slice(0, 220);
  const fingerprint = hashCanonical({
    source: "aderyn",
    check: title,
    filePath,
    line
  });

  return {
    id: fingerprint,
    title,
    severity,
    evidence: [{ filePath, line, excerpt: description }],
    whyItMatters:
      description || "Aderyn flagged this pattern as a risk worth reviewing before deployment.",
    fixDirection: "Review the flagged location and apply the remediation Aderyn describes for this detector.",
    // Aderyn does not emit a per-finding confidence; use a fixed source-tagged value.
    confidence: severity === "HIGH" ? 75 : 55,
    needsManualCheck: false,
    fingerprint
  };
}

export function aderynIssuesToFindings(parsed: AderynJsonOutput): Finding[] {
  const findings: Finding[] = [];
  for (const issue of parsed.high_issues?.issues ?? []) {
    findings.push(toAderynFinding(issue, "HIGH"));
  }
  for (const issue of parsed.low_issues?.issues ?? []) {
    findings.push(toAderynFinding(issue, "LOW"));
  }
  return findings;
}

// Cyfrin Aderyn — a second static analyzer run alongside Slither so the report
// reflects more than one tool. Aderyn resolves its own solc (via svm) and reads a
// foundry.toml, so we materialize the bundle and drop a minimal config, mirroring
// the standalone Slither path. Findings merge into the shared, deduplicated set.
export async function runAderyn(params: {
  sourceBundle: SourceBundle;
  runtime: ScannerRuntime;
  aderynRequired: boolean;
}): Promise<ScannerOutput> {
  const scannerErrors: string[] = [];
  const warnings: string[] = [];

  const workspace = await materializeSourceBundle(params.sourceBundle);
  const reportPath = join(workspace.workDir, `aderyn-report-${randomUUID()}.json`);

  const fail = (label: string, diagnostic: string) => {
    if (params.aderynRequired) {
      scannerErrors.push(`ADERYN_ERROR:${diagnostic}`);
    } else {
      warnings.push(`ADERYN_WARNING:${diagnostic}`);
    }
    void label;
    return { findings: [] as Finding[], scannerErrors, warnings };
  };

  try {
    await writeFile(join(workspace.workDir, "foundry.toml"), buildFoundryToml(params.sourceBundle), "utf8");

    const result = await params.runtime.runCommand(
      config.ADERYN_COMMAND,
      [".", "--output", reportPath],
      { cwd: workspace.workDir, env: process.env, timeoutMs: config.ADERYN_TIMEOUT_MS }
    );

    if (!(await pathExists(reportPath))) {
      return fail(
        "no-report",
        truncateDiagnostic(
          `exit=${result.code ?? "unknown"} | ${result.stderr.trim() || result.errorMessage || result.stdout.trim()}`
        )
      );
    }

    let parsed: AderynJsonOutput;
    try {
      parsed = JSON.parse(await readFile(reportPath, "utf8")) as AderynJsonOutput;
    } catch (error) {
      return fail("parse", truncateDiagnostic(error instanceof Error ? error.message : String(error)));
    }

    return { findings: aderynIssuesToFindings(parsed), scannerErrors, warnings };
  } catch (error) {
    return fail("exception", truncateDiagnostic(error instanceof Error ? error.message : String(error)));
  } finally {
    await rm(workspace.workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runSlither(params: {
  sourceBundle: SourceBundle;
  runtime: ScannerRuntime;
  runtimeMode: SlitherRuntimeMode;
  slitherRequired: boolean;
}): Promise<ScannerOutput> {
  const scannerErrors: string[] = [];
  const warnings: string[] = [];
  let outputPath: string | null = null;

  const plan = await createSlitherExecutionPlan(params.sourceBundle, params.runtimeMode);

  try {
    let solcResolution: Awaited<ReturnType<typeof resolveSolcRuntimeForSource>> | null = null;
    if (plan.standalone) {
      solcResolution = await resolveSolcRuntimeForSource({
        sourceBundle: params.sourceBundle,
        cwd: plan.cwd,
        runCommand: params.runtime.runCommand
      });

      if (solcResolution.unresolvedPragmaConstraint && solcResolution.failureReason) {
        pushSolcResolutionWarnings({
          warnings,
          requestedPragma: solcResolution.requestedPragma,
          filePath: solcResolution.requestedPragmaFilePath,
          strategy: solcResolution.resolutionStrategy,
          reason: solcResolution.failureReason
        });
      }

      if (solcResolution.failureReason && solcResolution.resolutionStrategy !== "solc_select_unresolved") {
        pushSolcMissingWarnings({
          warnings,
          solcPathSet: solcResolution.solcPathSet,
          attemptedPath: solcResolution.attemptedPath,
          reason: solcResolution.failureReason
        });
        return {
          findings: [],
          scannerErrors,
          warnings
        };
      }
      const solcResult = await params.runtime.runCommand(solcResolution.command, ["--version"], {
        cwd: plan.cwd,
        env: solcResolution.commandEnv,
        timeoutMs: Math.min(config.SCANNER_TIMEOUT_MS, 15000)
      });
      if (solcResult.code !== 0) {
        const reason = buildSlitherDiagnostics({
          code: solcResult.code,
          stdout: solcResult.stdout,
          stderr: solcResult.stderr,
          errorMessage: solcResult.errorMessage
        });
        pushSolcMissingWarnings({
          warnings,
          solcPathSet: solcResolution.solcPathSet,
          attemptedPath: solcResolution.attemptedPath,
          reason
        });
        return {
          findings: [],
          scannerErrors,
          warnings
        };
      }
      const solcVersion = truncateDiagnostic(
        (solcResult.stdout.trim() || solcResult.stderr.trim() || "unknown version").replace(/\s+/g, " ")
      );
      void solcVersion;
    }
    outputPath = join(plan.cwd, `slither-output-${randomUUID()}.json`);
    const solcRemaps = plan.standalone ? buildSolcRemappings(params.sourceBundle) : [];
    const slitherArgs = [
      plan.entryPoint,
      "--json",
      outputPath,
      "--json-types",
      "detectors",
      "--fail-none",
      "--detect",
      SLITHER_DETECTORS.join(","),
      "--exclude-dependencies",
      "--compile-force-framework",
      plan.compileFramework
    ];
    if (plan.standalone && solcResolution) {
      slitherArgs.push("--solc", solcResolution.resolvedBinaryPath);
      slitherArgs.push("--solc-disable-warnings");
      if (solcRemaps.length > 0) {
        slitherArgs.push("--solc-remaps", solcRemaps.join(" "));
      }
    }

    const slitherEnv =
      plan.standalone && solcResolution
        ? (() => {
            const currentPath = process.env.PATH ?? process.env.Path ?? "";
            const solcDir = isAbsolute(solcResolution.resolvedBinaryPath)
              ? dirname(solcResolution.resolvedBinaryPath)
              : "";
            const mergedPath =
              solcDir && !currentPath.toLowerCase().includes(solcDir.toLowerCase())
                ? `${solcDir}${delimiter}${currentPath}`
                : currentPath;

            return {
              ...process.env,
              ...(solcResolution.commandEnv ?? {}),
              PATH: mergedPath,
              Path: mergedPath,
              SOLC: solcResolution.resolvedBinaryPath
            };
          })()
        : undefined;
    const commandResult = await params.runtime.runCommand("slither", slitherArgs, {
      cwd: plan.cwd,
      env: slitherEnv,
      timeoutMs: config.SCANNER_TIMEOUT_MS
    });
    const { parsed, parseError } = await readSlitherOutput(outputPath);

    if (commandResult.code !== 0 || parsed?.success === false) {
      const diagnostic = buildSlitherDiagnostics({
        code: commandResult.code,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        outputError: parsed?.error,
        parseError,
        errorMessage: commandResult.errorMessage
      });

      if (params.slitherRequired) {
        scannerErrors.push(`SLITHER_ERROR:${diagnostic}`);
      } else {
        warnings.push(`SLITHER_WARNING:${diagnostic}`);
      }

      return {
        findings: [],
        scannerErrors,
        warnings
      };
    }

    if (!parsed) {
      const diagnostic = buildSlitherDiagnostics({
        code: commandResult.code,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        parseError
      });

      if (params.slitherRequired) {
        scannerErrors.push(`SLITHER_ERROR:${diagnostic}`);
      } else {
        warnings.push(`SLITHER_WARNING:${diagnostic}`);
      }

      return {
        findings: [],
        scannerErrors,
        warnings
      };
    }

    const findings = (parsed.results?.detectors ?? []).map((detector) => toSlitherFinding(detector));
    return {
      findings,
      scannerErrors,
      warnings
    };
  } catch (error) {
    const diagnostic = truncateDiagnostic(error instanceof Error ? error.message : String(error));
    if (params.slitherRequired) {
      scannerErrors.push(`SLITHER_ERROR:${diagnostic}`);
    } else {
      warnings.push(`SLITHER_WARNING:${diagnostic}`);
    }

    return {
      findings: [],
      scannerErrors,
      warnings
    };
  } finally {
    if (outputPath) {
      await rm(outputPath, { force: true }).catch(() => undefined);
    }
    if (plan.cleanupDir) {
      await rm(plan.cleanupDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function runForge(params: {
  sourceBundle: SourceBundle;
  runtime: ScannerRuntime;
  runtimeMode: SlitherRuntimeMode;
  forgeRequired: boolean;
}): Promise<ScannerOutput> {
  const scannerErrors: string[] = [];
  const warnings: string[] = [];

  const plan = await createFoundryExecutionPlan(params.sourceBundle, params.runtimeMode);

  try {
    if (plan.standalone) {
      const foundryTomlPath = join(plan.cwd, "foundry.toml");
      await writeFile(foundryTomlPath, buildFoundryToml(params.sourceBundle), "utf8");
    }

    const commandResult = await params.runtime.runCommand("forge", ["build"], {
      cwd: plan.cwd,
      env: process.env,
      timeoutMs: config.FOUNDRY_TIMEOUT_MS
    });

    if (commandResult.code !== 0) {
      const diagnostic = buildForgeDiagnostics({
        code: commandResult.code,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        errorMessage: commandResult.errorMessage
      });

      if (params.forgeRequired) {
        scannerErrors.push(`FOUNDRY_ERROR:${diagnostic}`);
      } else {
        warnings.push(`FOUNDRY_WARNING:${diagnostic}`);
      }
    }

    return {
      findings: [],
      scannerErrors,
      warnings
    };
  } catch (error) {
    const diagnostic = truncateDiagnostic(error instanceof Error ? error.message : String(error));
    if (params.forgeRequired) {
      scannerErrors.push(`FOUNDRY_ERROR:${diagnostic}`);
    } else {
      warnings.push(`FOUNDRY_WARNING:${diagnostic}`);
    }

    return {
      findings: [],
      scannerErrors,
      warnings
    };
  } finally {
    if (plan.cleanupDir) {
      await rm(plan.cleanupDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function runHeuristicScan(sourceBundle: SourceBundle): Promise<Finding[]> {
  const rules: Array<{
    pattern: RegExp;
    title: string;
    severity: Severity;
    why: string;
    fix: string;
  }> = [
    {
      pattern: /delegatecall\s*\(/i,
      title: "Potential unsafe delegatecall",
      severity: "HIGH",
      why: "delegatecall executes external code in the caller context and can corrupt storage.",
      fix: "Restrict delegatecall targets and validate upgrade paths with strict access controls."
    },
    {
      pattern: /tx\.origin/i,
      title: "tx.origin used for authorization",
      severity: "MEDIUM",
      why: "tx.origin based auth can be bypassed via intermediary contracts.",
      fix: "Use msg.sender checks and explicit role-based authorization."
    },
    {
      pattern: /selfdestruct\s*\(|suicide\s*\(/i,
      title: "Contract destruction opcode present",
      severity: "HIGH",
      why: "Contract self-destruction can permanently remove logic and redirect funds.",
      fix: "Avoid selfdestruct in production contracts or protect it with strong governance controls."
    },
    {
      // A whole statement that is just `<expr>.call{value: ...}(...)` with no
      // assignment on the left drops the returned success flag silently. The
      // `^\s*[\w.\[\]]+\.call` anchor excludes `(bool ok, ) = x.call{...}(...)`.
      pattern: /^\s*[\w.\[\]]+\.call\s*\{\s*value\s*:[^}]*\}\s*\([^;]*\)\s*;\s*$/im,
      title: "Unchecked low-level call return value",
      severity: "MEDIUM",
      why: "A low-level call whose success value is ignored lets failures pass silently, which can strand funds or break invariants.",
      fix: "Capture the returned bool and require it, or use a checked transfer pattern."
    },
    {
      pattern: /\.call\s*\{\s*value\s*:/i,
      title: "Low-level value transfer call",
      severity: "LOW",
      why: "Low-level external calls with value warrant a checks-effects-interactions review, though they are not unsafe by themselves.",
      fix: "Apply checks-effects-interactions and optionally reentrancy guards before external calls."
    },
    {
      pattern: /unchecked\s*\{/i,
      title: "Unchecked arithmetic block",
      severity: "MEDIUM",
      why: "Unchecked arithmetic can overflow/underflow if assumptions are wrong.",
      fix: "Use unchecked only with documented invariants and test boundary conditions."
    },
    {
      // block.timestamp / blockhash / prevrandao fed into keccak or a modulo is
      // a weak randomness source a validator can influence.
      pattern: /(keccak256[\s\S]{0,80}(block\.(timestamp|number|prevrandao)|blockhash)|(block\.(timestamp|number|prevrandao)|blockhash)[\s\S]{0,80}%)/i,
      title: "Weak PRNG from block values",
      severity: "MEDIUM",
      why: "Randomness derived from block.timestamp/number/prevrandao/blockhash can be predicted or influenced by validators.",
      fix: "Use a verifiable randomness source (e.g. a VRF) instead of block values."
    },
    {
      pattern: /block\.timestamp/i,
      title: "Timestamp-dependent logic",
      severity: "LOW",
      why: "Block timestamp has miner/validator influence and should not gate critical security logic.",
      fix: "Use safer time windows and avoid strict equality checks on block.timestamp."
    }
  ];

  const findings: Finding[] = [];

  for (const file of sourceBundle.files) {
    for (const rule of rules) {
      if (!rule.pattern.test(file.content)) {
        continue;
      }

      const line = findLine(file.content, rule.pattern);
      const excerpt = extractLine(file.content, line);
      const fingerprint = hashCanonical({
        title: rule.title,
        filePath: file.path,
        line,
        excerpt
      });

      findings.push({
        id: fingerprint,
        title: rule.title,
        severity: rule.severity,
        evidence: [
          {
            filePath: file.path,
            line,
            excerpt
          }
        ],
        whyItMatters: rule.why,
        fixDirection: rule.fix,
        confidence: rule.severity === "LOW" ? 55 : 70,
        needsManualCheck: false,
        fingerprint
      });
    }
  }

  return dedupeFindings(findings);
}

export async function runStaticScan(
  sourceBundle: SourceBundle,
  options: {
    skipSlither?: boolean;
    skipForge?: boolean;
    skipAderyn?: boolean;
    scanMode?: SlitherRuntimeMode;
    slitherRequired?: boolean;
    forgeRequired?: boolean;
    aderynRequired?: boolean;
    runtime?: ScannerRuntime;
  } = {}
): Promise<ScannerOutput> {
  const scannerErrors: string[] = [];
  const warnings: string[] = [];
  let findings: Finding[] = [];
  const runtimeMode: SlitherRuntimeMode =
    options.scanMode ?? (sourceBundle.inputType === "PASTE_CODE" ? "snippet" : "project");
  const slitherRequired = options.slitherRequired ?? runtimeMode === "project";
  const forgeRequired = options.forgeRequired ?? true;
  const runtime = options.runtime ?? defaultScannerRuntime;

  const shouldRunSlither = config.slitherEnabled && !options.skipSlither;
  const shouldRunForge = config.foundryEnabled && !options.skipForge;
  const shouldRunAderyn = config.aderynEnabled && !options.skipAderyn;
  const aderynRequired = options.aderynRequired ?? false;

  if (shouldRunSlither) {
    const slitherResult = await runSlither({
      sourceBundle,
      runtime,
      runtimeMode,
      slitherRequired
    });
    scannerErrors.push(...slitherResult.scannerErrors);
    warnings.push(...slitherResult.warnings);
    findings = slitherResult.findings;
  }

  if (shouldRunForge) {
    const forgeResult = await runForge({
      sourceBundle,
      runtime,
      runtimeMode,
      forgeRequired
    });
    scannerErrors.push(...forgeResult.scannerErrors);
    warnings.push(...forgeResult.warnings);
    findings.push(...forgeResult.findings);
  }

  if (shouldRunAderyn) {
    const aderynResult = await runAderyn({ sourceBundle, runtime, aderynRequired });
    scannerErrors.push(...aderynResult.scannerErrors);
    warnings.push(...aderynResult.warnings);
    findings.push(...aderynResult.findings);
  }

  if (findings.length === 0) {
    findings = await runHeuristicScan(sourceBundle);
  }

  return {
    findings: dedupeFindings(findings),
    scannerErrors: dedupeMessages(scannerErrors),
    warnings: dedupeMessages(warnings)
  };
}

export async function readEvidenceExcerpt(filePath: string, line?: number): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    return extractLine(content, line);
  } catch {
    return "";
  }
}
