import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { BENCHMARK_CASES, type BenchmarkCase, type BenchmarkSeverity } from "./benchmark-expectations";

const ROOT = process.cwd();
const OUTPUT_PATH = resolve(ROOT, "output/pipeline-benchmark.json");

const SEVERITY_RANK: Record<BenchmarkSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0
};

interface CaseResult {
  id: string;
  bugClass: string;
  expectVulnerable: boolean;
  knownGapStatic: boolean;
  detected: boolean;
  matchedTitles: string[];
  falsePositiveTitles: string[];
  findingCount: number;
  aiFindingCount: number;
  scannerErrors: string[];
  outcome: "TP" | "FN" | "TN" | "FP";
}

function severityAtLeast(severity: string, min: BenchmarkSeverity): boolean {
  return (SEVERITY_RANK[severity as BenchmarkSeverity] ?? 0) >= SEVERITY_RANK[min];
}

async function runCase(
  benchmarkCase: BenchmarkCase,
  withAi: boolean
): Promise<CaseResult> {
  const { runStaticScan } = await import("@/lib/scanner");
  const { hashCanonical } = await import("@/lib/hash");

  const files = await Promise.all(
    benchmarkCase.files.map(async (filePath) => ({
      path: basename(filePath),
      content: await readFile(resolve(ROOT, filePath), "utf8")
    }))
  );

  const sourceBundle = {
    inputType: "PASTE_CODE" as const,
    chainId: 8453,
    files,
    lineCount: files.reduce((total, file) => total + file.content.split("\n").length, 0),
    isVerifiedSource: false,
    sourceMeta: {},
    sourceHash: hashCanonical({ files })
  };

  const scan = await runStaticScan(sourceBundle, {});

  let aiTitles: string[] = [];
  if (withAi) {
    const { generateAIAuditFindings } = await import("@/lib/llm");
    const aiFindings = await generateAIAuditFindings({
      sourceBundle,
      scannerFindings: scan.findings,
      warnings: scan.warnings,
      scannerErrors: scan.scannerErrors,
      partialReasons: []
    });
    aiTitles = aiFindings.map(
      (finding) => `${finding.title ?? ""} ${(finding as { explanation?: string }).explanation ?? ""}`
    );
  }

  const minSeverity = benchmarkCase.minSeverity ?? "MEDIUM";
  const relevantTitles = [
    ...scan.findings
      .filter((finding) => severityAtLeast(finding.severity, minSeverity))
      .map((finding) => finding.title),
    ...aiTitles
  ];

  const matchedTitles = relevantTitles.filter((title) =>
    benchmarkCase.matchers.some((matcher) => matcher.test(title))
  );

  const detected = matchedTitles.length > 0;

  // A safe case is a false positive when the pipeline reports anything >= MEDIUM.
  const falsePositiveTitles = benchmarkCase.expectVulnerable
    ? []
    : scan.findings
        .filter((finding) => severityAtLeast(finding.severity, "MEDIUM"))
        .map((finding) => finding.title);

  const outcome: CaseResult["outcome"] = benchmarkCase.expectVulnerable
    ? detected
      ? "TP"
      : "FN"
    : falsePositiveTitles.length > 0
      ? "FP"
      : "TN";

  return {
    id: benchmarkCase.id,
    bugClass: benchmarkCase.bugClass,
    expectVulnerable: benchmarkCase.expectVulnerable,
    knownGapStatic: benchmarkCase.knownGapStatic ?? false,
    detected,
    matchedTitles: [...new Set(matchedTitles)],
    falsePositiveTitles: [...new Set(falsePositiveTitles)],
    findingCount: scan.findings.length,
    aiFindingCount: aiTitles.length,
    scannerErrors: scan.scannerErrors,
    outcome
  };
}

function computeMetrics(results: CaseResult[]) {
  const tp = results.filter((result) => result.outcome === "TP").length;
  const fn = results.filter((result) => result.outcome === "FN").length;
  const fp = results.filter((result) => result.outcome === "FP").length;
  const tn = results.filter((result) => result.outcome === "TN").length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { tp, fn, fp, tn, precision, recall, f1 };
}

async function main() {
  const withAi = process.argv.includes("--with-ai");
  const strict = process.argv.includes("--strict");

  if (withAi && !process.env.OPENAI_API_KEY) {
    console.error("--with-ai requires OPENAI_API_KEY");
    process.exitCode = 1;
    return;
  }

  console.log(`[benchmark] running ${BENCHMARK_CASES.length} cases (mode: ${withAi ? "static+AI" : "static-only"})`);

  const results: CaseResult[] = [];
  for (const benchmarkCase of BENCHMARK_CASES) {
    process.stdout.write(`[benchmark] ${benchmarkCase.id} ... `);
    const result = await runCase(benchmarkCase, withAi);
    results.push(result);
    console.log(result.outcome + (result.knownGapStatic && result.outcome === "FN" ? " (known gap)" : ""));
  }

  const metrics = computeMetrics(results);

  console.log("\ncase                        expected    result  matched");
  console.log("-".repeat(80));
  for (const result of results) {
    const expected = result.expectVulnerable ? "vulnerable" : "safe";
    const matched =
      result.outcome === "FP"
        ? `FP: ${result.falsePositiveTitles.join(", ")}`
        : result.matchedTitles.join(", ") || "-";
    console.log(
      `${result.id.padEnd(28)}${expected.padEnd(12)}${result.outcome.padEnd(8)}${matched}`
    );
  }

  console.log("-".repeat(80));
  console.log(
    `TP=${metrics.tp} FN=${metrics.fn} FP=${metrics.fp} TN=${metrics.tn}  ` +
      `precision=${metrics.precision.toFixed(2)} recall=${metrics.recall.toFixed(2)} F1=${metrics.f1.toFixed(2)}`
  );

  await mkdir(resolve(ROOT, "output"), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ mode: withAi ? "static+ai" : "static-only", metrics, results }, null, 2)
  );
  console.log(`[benchmark] report written to ${OUTPUT_PATH}`);

  if (strict) {
    const regressions = results.filter(
      (result) =>
        (result.outcome === "FN" && !result.knownGapStatic) || result.outcome === "FP"
    );
    if (regressions.length > 0) {
      console.error(
        `[benchmark] STRICT FAILURE: ${regressions.map((result) => `${result.id}(${result.outcome})`).join(", ")}`
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
