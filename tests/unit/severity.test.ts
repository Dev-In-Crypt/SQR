import { describe, expect, it } from "vitest";

import { sortFindings, topSeverity } from "@/lib/report";
import type { Finding } from "@/lib/types";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: crypto.randomUUID(),
    title: "Issue",
    severity: "LOW",
    evidence: [],
    whyItMatters: "why",
    fixDirection: "fix",
    confidence: 50,
    needsManualCheck: false,
    fingerprint: crypto.randomUUID(),
    ...overrides
  };
}

describe("severity ordering", () => {
  it("sorts by severity then confidence", () => {
    const items = [
      finding({ severity: "MEDIUM", confidence: 60 }),
      finding({ severity: "HIGH", confidence: 55 }),
      finding({ severity: "HIGH", confidence: 80 }),
      finding({ severity: "LOW", confidence: 99 })
    ];

    const sorted = sortFindings(items);
    expect(sorted[0].severity).toBe("HIGH");
    expect(sorted[0].confidence).toBe(80);
    expect(sorted[1].severity).toBe("HIGH");
    expect(topSeverity(items)).toBe("HIGH");
  });
});
