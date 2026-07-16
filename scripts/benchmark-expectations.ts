export type BenchmarkSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface BenchmarkCase {
  /** Case id shown in reports. */
  id: string;
  /** Contract files combined into a single source bundle. */
  files: string[];
  expectVulnerable: boolean;
  bugClass: string;
  /** A vulnerable case counts as detected when any finding >= minSeverity matches any matcher. */
  matchers: RegExp[];
  /** Minimum severity for a finding to count (default MEDIUM). */
  minSeverity?: BenchmarkSeverity;
  /**
   * Known miss for the static-only pipeline (baseline 2026-07-16). A miss on
   * these cases is reported but does not fail --strict; a NEW detection here
   * should prompt removing the flag.
   */
  knownGapStatic?: boolean;
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // --- benchmark set 1: classic bugs ---
  {
    id: "reentrancy-bank",
    files: ["contracts/benchmark/VulnReentrancyBank.sol"],
    expectVulnerable: true,
    bugClass: "reentrancy",
    matchers: [/reentranc/i]
  },
  {
    id: "tx-origin-auth",
    files: ["contracts/benchmark/VulnTxOriginAuth.sol"],
    expectVulnerable: true,
    bugClass: "tx-origin-auth",
    matchers: [/tx.?origin/i]
  },
  {
    id: "controlled-delegatecall",
    files: ["contracts/benchmark/VulnControlledDelegatecall.sol"],
    expectVulnerable: true,
    bugClass: "delegatecall",
    matchers: [/delegatecall/i]
  },
  {
    // Baseline 2026-07-16: snippet-mode static scan surfaces the low-level call
    // but not as an "unchecked return" finding >= MEDIUM. Candidate for a
    // scanner-rule improvement; tracked as a known static gap, not a regression.
    id: "unchecked-call",
    files: ["contracts/benchmark/VulnUncheckedCall.sol"],
    expectVulnerable: true,
    bugClass: "unchecked-low-level-call",
    matchers: [/unchecked|low-level/i],
    knownGapStatic: true
  },
  {
    // Baseline 2026-07-16: weak-PRNG heuristic does not fire >= MEDIUM in
    // snippet mode. Known static gap; the AI stage is expected to cover it.
    id: "weak-randomness",
    files: ["contracts/benchmark/VulnWeakRandom.sol"],
    expectVulnerable: true,
    bugClass: "weak-randomness",
    matchers: [/weak.?prng|random|timestamp/i],
    knownGapStatic: true
  },
  {
    id: "safe-vault",
    files: ["contracts/benchmark/SafeVault.sol"],
    expectVulnerable: false,
    bugClass: "reentrancy",
    matchers: []
  },
  {
    id: "safe-access-control",
    files: ["contracts/benchmark/SafeAccessControl.sol"],
    expectVulnerable: false,
    bugClass: "tx-origin-auth",
    matchers: []
  },
  {
    id: "safe-escrow",
    files: ["contracts/benchmark/SafeEscrow.sol"],
    expectVulnerable: false,
    bugClass: "escrow",
    matchers: []
  },

  // --- benchmark set 2: subtler pairs ---
  {
    id: "signature-replay",
    files: ["contracts/benchmark2/VulnReplayWallet.sol"],
    expectVulnerable: true,
    bugClass: "signature-replay",
    matchers: [/replay|signature|nonce|ecrecover/i],
    knownGapStatic: true
  },
  {
    id: "init-hijack",
    files: ["contracts/benchmark2/VulnInitHijackVault.sol"],
    expectVulnerable: true,
    bugClass: "unprotected-initializer",
    matchers: [/initializ|unprotected|upgrade/i],
    knownGapStatic: true
  },
  {
    id: "stale-oracle",
    files: ["contracts/benchmark2/VulnStaleOracleConsumer.sol"],
    expectVulnerable: true,
    bugClass: "stale-oracle",
    matchers: [/oracle|stale|updatedat|timestamp/i],
    knownGapStatic: true
  },
  {
    id: "proxy-storage-collision",
    files: [
      "contracts/benchmark2/VulnProxyStorageCollision.sol",
      "contracts/benchmark2/VulnLogicCollision.sol"
    ],
    expectVulnerable: true,
    bugClass: "proxy-storage-collision",
    matchers: [/storage|collision|shadow|delegatecall/i],
    knownGapStatic: true
  },
  {
    id: "safe-nonce-wallet",
    files: ["contracts/benchmark2/SafeNonceWallet.sol"],
    expectVulnerable: false,
    bugClass: "signature-replay",
    matchers: []
  },
  {
    id: "safe-initializable-vault",
    files: ["contracts/benchmark2/SafeInitializableVault.sol"],
    expectVulnerable: false,
    bugClass: "unprotected-initializer",
    matchers: []
  },
  {
    id: "safe-oracle-consumer",
    files: ["contracts/benchmark2/SafeOracleConsumer.sol"],
    expectVulnerable: false,
    bugClass: "stale-oracle",
    matchers: []
  }
];
