import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

import { config } from "@/lib/config";
import { hashCanonical } from "@/lib/hash";
import type { Finding, ScannerOutput, Severity, SourceBundle } from "@/lib/types";

const SLITHER_DETECTORS = [
  "reentrancy-eth",
  "reentrancy-no-eth",
  "unchecked-transfer",
  "arbitrary-send-eth",
  "tx-origin",
  "controlled-delegatecall",
  "unprotected-upgrade",
  "missing-zero-check"
];

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

async function runSlither(sourceBundle: SourceBundle): Promise<ScannerOutput> {
  const workDir = await mkdtemp(join(tmpdir(), "sqr-slither-"));
  const scannerErrors: string[] = [];

  try {
    for (const file of sourceBundle.files) {
      const absolutePath = join(workDir, file.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, "utf8");
    }

    const entryPoint = join(workDir, sourceBundle.files[0]?.path ?? "PastedSnippet.sol");
    const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(
        "slither",
        [
          entryPoint,
          "--json",
          "-",
          "--detect",
          SLITHER_DETECTORS.join(","),
          "--exclude-dependencies"
        ],
        {
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);

      child.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `slither exited with code ${code}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });

    const parsed = JSON.parse(output.stdout) as {
      results?: {
        detectors?: Array<{
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
        }>;
      };
    };

    const findings: Finding[] = (parsed.results?.detectors ?? []).map((detector) => {
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
    });

    return {
      findings,
      scannerErrors
    };
  } catch (error) {
    scannerErrors.push(
      error instanceof Error ? `SLITHER_ERROR:${error.message}` : `SLITHER_ERROR:${String(error)}`
    );
    return {
      findings: [],
      scannerErrors
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
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
      pattern: /\.call\s*\{\s*value\s*:/i,
      title: "Low-level value transfer call",
      severity: "HIGH",
      why: "Low-level external calls with value can introduce reentrancy and error handling bugs.",
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
  } = {}
): Promise<ScannerOutput> {
  const scannerErrors: string[] = [];
  let findings: Finding[] = [];

  const shouldRunSlither = config.slitherEnabled && !options.skipSlither;

  if (shouldRunSlither) {
    const slitherResult = await runSlither(sourceBundle);
    scannerErrors.push(...slitherResult.scannerErrors);
    findings = slitherResult.findings;
  }

  if (findings.length === 0) {
    findings = await runHeuristicScan(sourceBundle);
  }

  return {
    findings: dedupeFindings(findings),
    scannerErrors
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