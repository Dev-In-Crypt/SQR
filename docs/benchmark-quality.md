# Detection-quality benchmark

`npm run benchmark:pipeline` runs the analysis pipeline against the paired
vulnerable/safe contracts in `contracts/benchmark` and `contracts/benchmark2`
and scores detection quality. Static-only by default; add `--with-ai` (requires
`OPENAI_API_KEY`) to include the AI audit stage, `--strict` to exit non-zero on
regressions.

- Manifest: `scripts/benchmark-expectations.ts` — one case per contract with
  bug class, severity floor, and title matchers.
- Runner: `scripts/benchmark-pipeline.ts` — builds a `SourceBundle` per case,
  runs `runStaticScan` (+ optional AI), scores TP/FN/FP/TN, writes
  `output/pipeline-benchmark.json` (gitignored).
- A vulnerable case is **detected** when any finding ≥ its severity floor
  (default MEDIUM) matches any matcher. A safe case is a **false positive**
  when any finding ≥ MEDIUM is reported.

## Baseline — static-only, 2026-07-16

`TP=3 FN=6 FP=3 TN=3  precision=0.50 recall=0.33 F1=0.40`

| Detected (TP) | Missed (FN) | False positive (FP) |
|---|---|---|
| reentrancy, tx-origin, delegatecall | unchecked-call*, weak-randomness*, signature-replay*, init-hijack*, stale-oracle*, proxy-collision* | safe-vault, safe-escrow, safe-nonce-wallet |

`*` = `knownGapStatic`: expected miss for the static-only path (the benchmark2
pairs need the AI stage; unchecked-call and weak-randomness are scanner-rule
gaps tracked for improvement). A NEW detection on a `knownGapStatic` case is a
signal to remove the flag.

`--strict` fails on any non-`knownGapStatic` FN or any FP. It is intentionally
NOT wired into CI yet — the FP cases above are real and must be addressed (or
reclassified) before strict mode is meaningful.
