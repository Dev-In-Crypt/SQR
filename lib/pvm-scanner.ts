import { spawn } from "node:child_process";

import { config } from "@/lib/config";
import { hashCanonical } from "@/lib/hash";
import type { PvmWarning, Severity, SourceBundle } from "@/lib/types";

const BYTECODE_LIMIT_BYTES = 24 * 1024;
const DIAGNOSTIC_LIMIT = 2400;

interface PvmCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

export interface PvmScannerRuntime {
  runCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      stdin?: string;
    }
  ): Promise<PvmCommandResult>;
}

interface PvmCompilerMessage {
  severity?: string;
  errorCode?: string;
  type?: string;
  message?: string;
  formattedMessage?: string;
}

export interface PvmScanOutput {
  compiler: string;
  status: "COMPLETED" | "FAILED";
  bytecodeBytes: number | null;
  warnings: PvmWarning[];
  errors: string[];
}

const defaultPvmScannerRuntime: PvmScannerRuntime = {
  async runCommand(command, args, options) {
    return await new Promise<PvmCommandResult>((resolvePromise) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"]
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

      const finish = (result: PvmCommandResult) => {
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

      if (options.stdin !== undefined && options.stdin.length > 0) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    });
  }
};

function truncateDiagnostic(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "no diagnostics captured";
  }

  if (compact.length <= DIAGNOSTIC_LIMIT) {
    return compact;
  }

  return `${compact.slice(0, DIAGNOSTIC_LIMIT - 14)}...(truncated)`;
}

function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function severityFromCompilerMessage(message: PvmCompilerMessage): Severity {
  const joined = `${message.type || ""} ${message.message || ""} ${message.formattedMessage || ""}`.toLowerCase();
  if (joined.includes("error")) {
    return "HIGH";
  }

  if (joined.includes("storage deposit")) {
    return "MEDIUM";
  }

  return "LOW";
}

function defaultExplanation(code: string): { title: string; explanation: string; fixDirection: string; blocking: boolean } {
  if (code === "PVM_UNSUPPORTED_OPCODE_SELFDESTRUCT") {
    return {
      title: "Unsupported opcode pattern: SELFDESTRUCT",
      explanation:
        "The source uses SELFDESTRUCT/SUICIDE semantics, which are not suitable for Polkadot Hub focused execution targets.",
      fixDirection:
        "Remove destructive opcode usage and replace with explicit lifecycle controls or upgrade-safe shutdown patterns.",
      blocking: true
    };
  }

  if (code === "PVM_UNSUPPORTED_OPCODE_PUSH0") {
    return {
      title: "Potential unsupported PUSH0 opcode usage",
      explanation:
        "Inline assembly appears to reference PUSH0. This opcode can be incompatible across non-standard EVM execution targets.",
      fixDirection:
        "Avoid PUSH0-specific assembly and rely on high-level Solidity or compatible assembly alternatives.",
      blocking: true
    };
  }

  if (code === "PVM_BYTECODE_LIMIT_EXCEEDED") {
    return {
      title: "Bytecode exceeds 24KB limit",
      explanation:
        "Compiled bytecode size is above 24KB. Large artifacts may fail deployment checks or increase execution constraints.",
      fixDirection:
        "Split contract responsibilities, remove dead code, and reduce inherited/linked modules to shrink bytecode size.",
      blocking: true
    };
  }

  if (code === "PVM_STORAGE_DEPOSIT_WARNING") {
    return {
      title: "Storage deposit warning",
      explanation:
        "Compiler diagnostics indicate storage deposit implications that can affect deploy/runtime costs on Polkadot Hub.",
      fixDirection:
        "Review storage-heavy structures and writes; reduce permanent storage usage and prefer compact state patterns.",
      blocking: false
    };
  }

  return {
    title: "PVM compiler warning",
    explanation: "The PVM compiler emitted a warning that may impact compatibility or execution behavior.",
    fixDirection: "Review the warning details and adjust source or build settings before deployment.",
    blocking: false
  };
}

function createWarning(params: {
  code: string;
  source: PvmWarning["source"];
  severity: Severity;
  message: string;
  evidence: string;
  explanation?: string;
  fixDirection?: string;
  title?: string;
  blocking?: boolean;
}): PvmWarning {
  const defaults = defaultExplanation(params.code);
  const title = params.title || defaults.title;
  const explanation = params.explanation || defaults.explanation;
  const fixDirection = params.fixDirection || defaults.fixDirection;
  const blocking = params.blocking ?? defaults.blocking;

  const id = hashCanonical({
    code: params.code,
    source: params.source,
    title,
    message: params.message,
    evidence: params.evidence
  });

  return {
    id,
    code: params.code,
    title,
    severity: params.severity,
    source: params.source,
    message: truncateDiagnostic(params.message),
    evidence: truncateDiagnostic(params.evidence),
    explanation,
    fixDirection,
    blocking
  };
}

function buildStandardJsonInput(sourceBundle: SourceBundle): string {
  const sources: Record<string, { content: string }> = {};

  sourceBundle.files.forEach((file, index) => {
    const key = file.path?.trim() || `Source${index + 1}.sol`;
    sources[key] = { content: file.content };
  });

  return JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: {
        enabled: false,
        runs: 200
      },
      outputSelection: {
        "*": {
          "*": ["evm.bytecode", "evm.deployedBytecode", "abi"]
        }
      }
    }
  });
}

function parseCompilerOutput(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractCompilerMessages(payload: Record<string, unknown> | null): PvmCompilerMessage[] {
  if (!payload || !Array.isArray(payload.errors)) {
    return [];
  }

  return payload.errors
    .filter((item): item is PvmCompilerMessage => item !== null && typeof item === "object")
    .map((item) => item);
}

function extractMaxBytecodeSize(payload: Record<string, unknown> | null): number | null {
  if (!payload || !payload.contracts || typeof payload.contracts !== "object") {
    return null;
  }

  let maxBytes = 0;
  let found = false;

  for (const byFile of Object.values(payload.contracts as Record<string, unknown>)) {
    if (!byFile || typeof byFile !== "object") {
      continue;
    }

    for (const artifact of Object.values(byFile as Record<string, unknown>)) {
      if (!artifact || typeof artifact !== "object") {
        continue;
      }

      const candidateBytecodeObjects: string[] = [];
      const artifactObject = artifact as Record<string, unknown>;

      const evm = artifactObject.evm as Record<string, unknown> | undefined;
      const evmBytecode = evm?.bytecode as Record<string, unknown> | undefined;
      if (typeof evmBytecode?.object === "string") {
        candidateBytecodeObjects.push(evmBytecode.object);
      }

      const directBytecode = artifactObject.bytecode as Record<string, unknown> | undefined;
      if (typeof directBytecode?.object === "string") {
        candidateBytecodeObjects.push(directBytecode.object);
      }

      const polkavm = artifactObject.polkavm as Record<string, unknown> | undefined;
      const polkavmBytecode = polkavm?.bytecode as Record<string, unknown> | undefined;
      if (typeof polkavmBytecode?.object === "string") {
        candidateBytecodeObjects.push(polkavmBytecode.object);
      }

      for (const rawBytecode of candidateBytecodeObjects) {
        const compact = rawBytecode.startsWith("0x") ? rawBytecode.slice(2) : rawBytecode;
        if (!compact || /[^0-9a-f]/i.test(compact)) {
          continue;
        }

        const byteSize = Math.floor(compact.length / 2);
        found = true;
        if (byteSize > maxBytes) {
          maxBytes = byteSize;
        }
      }
    }
  }

  return found ? maxBytes : null;
}

function detectUnsupportedPatternWarnings(sourceBundle: SourceBundle): PvmWarning[] {
  const warnings: PvmWarning[] = [];
  const patterns: Array<{ code: string; regex: RegExp; sourceText: string }> = [
    {
      code: "PVM_UNSUPPORTED_OPCODE_SELFDESTRUCT",
      regex: /\b(selfdestruct|suicide)\s*\(/i,
      sourceText: "SELFDESTRUCT/SUICIDE pattern"
    },
    {
      code: "PVM_UNSUPPORTED_OPCODE_PUSH0",
      regex: /\bpush0\b/i,
      sourceText: "PUSH0 assembly pattern"
    }
  ];

  for (const file of sourceBundle.files) {
    const sanitized = stripCommentsAndStrings(file.content);

    for (const pattern of patterns) {
      const match = sanitized.match(pattern.regex);
      if (!match) {
        continue;
      }

      warnings.push(
        createWarning({
          code: pattern.code,
          source: "pattern",
          severity: "HIGH",
          message: `Detected ${pattern.sourceText} in ${file.path}.`,
          evidence: `${file.path}: ${match[0]}`,
          blocking: true
        })
      );
    }
  }

  return warnings;
}

function normalizeCompilerWarningCode(message: PvmCompilerMessage): string {
  const joined = `${message.errorCode || ""} ${message.type || ""} ${message.message || ""}`.toLowerCase();
  if (joined.includes("storage deposit")) {
    return "PVM_STORAGE_DEPOSIT_WARNING";
  }

  const normalized = (message.errorCode || message.type || "warning")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return `PVM_COMPILER_${normalized || "WARNING"}`;
}

function dedupeWarnings(warnings: PvmWarning[]): PvmWarning[] {
  const unique = new Map<string, PvmWarning>();
  for (const warning of warnings) {
    if (!unique.has(warning.id)) {
      unique.set(warning.id, warning);
    }
  }
  return [...unique.values()];
}

function dedupeErrors(errors: string[]): string[] {
  return [...new Set(errors.map((item) => truncateDiagnostic(item)).filter((item) => item.length > 0))];
}

export async function runPvmScan(
  sourceBundle: SourceBundle,
  options: {
    runtime?: PvmScannerRuntime;
  } = {}
): Promise<PvmScanOutput> {
  const runtime = options.runtime ?? defaultPvmScannerRuntime;
  const compiler = config.PVM_COMPILER_BIN;
  const warnings: PvmWarning[] = [];
  const errors: string[] = [];

  warnings.push(...detectUnsupportedPatternWarnings(sourceBundle));

  const standardJsonInput = buildStandardJsonInput(sourceBundle);
  const commandResult = await runtime.runCommand(compiler, ["--standard-json"], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: config.PVM_COMPILER_TIMEOUT_MS,
    stdin: standardJsonInput
  });

  const combinedDiagnostics = [commandResult.errorMessage, commandResult.stderr, commandResult.stdout]
    .filter((item): item is string => Boolean(item && item.trim()))
    .join(" | ");

  if (commandResult.code === null && (commandResult.errorMessage || "").toLowerCase().includes("enoent")) {
    errors.push(`PVM_COMPILER_NOT_FOUND:${compiler}`);
    errors.push(`PVM_COMPILER_NOT_FOUND_DETAIL:${truncateDiagnostic(combinedDiagnostics)}`);
    return {
      compiler,
      status: "FAILED",
      bytecodeBytes: null,
      warnings: dedupeWarnings(warnings),
      errors: dedupeErrors(errors)
    };
  }

  const parsedOutput = parseCompilerOutput(commandResult.stdout);
  if (!parsedOutput) {
    errors.push("PVM_OUTPUT_PARSE_FAILED");
    errors.push(`PVM_OUTPUT_PARSE_FAILED_DETAIL:${truncateDiagnostic(combinedDiagnostics)}`);
    return {
      compiler,
      status: "FAILED",
      bytecodeBytes: null,
      warnings: dedupeWarnings(warnings),
      errors: dedupeErrors(errors)
    };
  }

  const compilerMessages = extractCompilerMessages(parsedOutput);
  const compilerWarnings = compilerMessages.filter((message) => (message.severity || "").toLowerCase() === "warning");
  const compilerErrors = compilerMessages.filter((message) => (message.severity || "").toLowerCase() === "error");

  for (const compilerWarning of compilerWarnings) {
    const message = compilerWarning.formattedMessage || compilerWarning.message || "Compiler warning";
    warnings.push(
      createWarning({
        code: normalizeCompilerWarningCode(compilerWarning),
        source: "compiler",
        severity: severityFromCompilerMessage(compilerWarning),
        message,
        evidence: message
      })
    );
  }

  if (compilerErrors.length > 0) {
    errors.push("PVM_COMPILATION_FAILED");
    for (const compilerError of compilerErrors.slice(0, 5)) {
      const message = compilerError.formattedMessage || compilerError.message || "Compiler error";
      errors.push(`PVM_COMPILATION_ERROR:${truncateDiagnostic(message)}`);
    }
  }

  if (commandResult.code !== 0 && compilerErrors.length === 0) {
    errors.push("PVM_COMPILATION_FAILED");
    errors.push(`PVM_COMPILATION_FAILED_DETAIL:${truncateDiagnostic(combinedDiagnostics)}`);
  }

  const bytecodeBytes = extractMaxBytecodeSize(parsedOutput);
  if (bytecodeBytes !== null && bytecodeBytes > BYTECODE_LIMIT_BYTES) {
    warnings.push(
      createWarning({
        code: "PVM_BYTECODE_LIMIT_EXCEEDED",
        source: "bytecode",
        severity: "HIGH",
        message: `Max compiled bytecode size is ${bytecodeBytes} bytes, above 24KB (${BYTECODE_LIMIT_BYTES} bytes).`,
        evidence: `maxBytecodeBytes=${bytecodeBytes}`,
        blocking: true
      })
    );
  }

  return {
    compiler,
    status: errors.length > 0 ? "FAILED" : "COMPLETED",
    bytecodeBytes,
    warnings: dedupeWarnings(warnings),
    errors: dedupeErrors(errors)
  };
}
