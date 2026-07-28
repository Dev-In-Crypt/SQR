import { severityRank } from "@/lib/report";
import type { Severity } from "@/lib/types";

// A finding's title comes from a fixed vocabulary (Slither detector names or the
// heuristic rule titles), not free-text prose, so exact title + file path is a
// reliable match key across two scans of the same evolving contract/address —
// unlike AI findings (lib/llm.ts consensus), which need fuzzy text matching.
export interface DiffableFinding {
  title: string;
  severity: Severity;
  filePath: string | null;
}

export interface FindingDelta {
  title: string;
  filePath: string | null;
  severity: Severity;
  previousSeverity?: Severity;
}

export interface ScanDiffResult {
  newFindings: FindingDelta[];
  resolvedFindings: FindingDelta[];
  severityChanges: FindingDelta[];
  unchangedCount: number;
  riskIncreased: boolean;
  topSeverity: Severity;
  previousTopSeverity: Severity;
}

function matchKey(finding: DiffableFinding): string {
  return `${finding.title}::${finding.filePath ?? ""}`;
}

// Duplicate (title, filePath) pairs — e.g. the same detector firing twice in one
// file at different lines — are matched positionally (first-to-first,
// second-to-second) rather than all collapsed into one bucket. A code shift
// that moves a finding's line number within the same file+title bucket won't
// spuriously show as resolved+new; an unrelated finding elsewhere never will.
function bucketByKey(findings: DiffableFinding[]): Map<string, DiffableFinding[]> {
  const buckets = new Map<string, DiffableFinding[]>();
  for (const finding of findings) {
    const key = matchKey(finding);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(finding);
    } else {
      buckets.set(key, [finding]);
    }
  }
  return buckets;
}

function topSeverityOf(findings: DiffableFinding[]): Severity {
  if (findings.length === 0) {
    return "INFO";
  }
  return findings.reduce<Severity>(
    (top, finding) => (severityRank[finding.severity] > severityRank[top] ? finding.severity : top),
    "INFO"
  );
}

/**
 * Compares two sets of static findings from separate scans of the same
 * tracked target (a verified contract address, scanned again after a proxy
 * upgrade or redeploy) and reports what's new, resolved, or escalated.
 * Pure and deterministic.
 */
export function diffFindings(previous: DiffableFinding[], current: DiffableFinding[]): ScanDiffResult {
  const previousBuckets = bucketByKey(previous);
  const currentBuckets = bucketByKey(current);

  const newFindings: FindingDelta[] = [];
  const resolvedFindings: FindingDelta[] = [];
  const severityChanges: FindingDelta[] = [];
  let unchangedCount = 0;

  const allKeys = new Set([...previousBuckets.keys(), ...currentBuckets.keys()]);

  for (const key of allKeys) {
    const prevBucket = previousBuckets.get(key) ?? [];
    const currBucket = currentBuckets.get(key) ?? [];
    const pairCount = Math.min(prevBucket.length, currBucket.length);

    for (let i = 0; i < pairCount; i += 1) {
      const prev = prevBucket[i];
      const curr = currBucket[i];
      if (prev.severity === curr.severity) {
        unchangedCount += 1;
      } else {
        severityChanges.push({
          title: curr.title,
          filePath: curr.filePath,
          severity: curr.severity,
          previousSeverity: prev.severity
        });
      }
    }

    for (let i = pairCount; i < currBucket.length; i += 1) {
      newFindings.push({ title: currBucket[i].title, filePath: currBucket[i].filePath, severity: currBucket[i].severity });
    }
    for (let i = pairCount; i < prevBucket.length; i += 1) {
      resolvedFindings.push({ title: prevBucket[i].title, filePath: prevBucket[i].filePath, severity: prevBucket[i].severity });
    }
  }

  const topSeverity = topSeverityOf(current);
  const previousTopSeverity = topSeverityOf(previous);

  const riskIncreased =
    severityRank[topSeverity] > severityRank[previousTopSeverity] ||
    newFindings.some((f) => severityRank[f.severity] >= severityRank.HIGH) ||
    severityChanges.some((f) => severityRank[f.severity] > severityRank[f.previousSeverity!]);

  return {
    newFindings,
    resolvedFindings,
    severityChanges,
    unchangedCount,
    riskIncreased,
    topSeverity,
    previousTopSeverity
  };
}
