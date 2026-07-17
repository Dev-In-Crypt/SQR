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

## Baseline — static-only, 2026-07-16 (after scanner tuning)

`TP=5 FN=4 FP=1 TN=5  precision=0.83 recall=0.56 F1=0.67`

| Detected (TP) | Missed (FN) | False positive (FP) |
|---|---|---|
| reentrancy, tx-origin, delegatecall, unchecked-call, weak-randomness | signature-replay*, init-hijack*, stale-oracle*, proxy-collision* | safe-nonce-wallet† |

`*` = `knownGapStatic`: expected miss for the static-only path — the benchmark2
pairs need the AI stage (`--with-ai`). A NEW detection on a `knownGapStatic`
case is a signal to remove the flag.

`†` = `knownFpStatic`: slither's `arbitrary-send-eth` fires on a send that is
guarded by a signature + nonce it cannot reason about. Silencing the detector
would hide real arbitrary-send bugs, so the FP is accepted and flagged.

### What changed vs the first baseline (P=0.50 R=0.33)
- Added slither detectors `unchecked-lowlevel`, `unchecked-send`, `weak-prng` —
  unchecked-call and weak-randomness now detected directly.
- Lowered the grep-fallback `.call{value:}` heuristic from HIGH to LOW and added
  a precise "unchecked low-level call return" rule (statement-anchored so it does
  not fire on `(bool ok, ) = x.call{...}`) — cleared the safe-vault / safe-escrow
  false positives.

`--strict` fails on any non-`knownGapStatic` FN or non-`knownFpStatic` FP; it
passes at this baseline and is ready to wire into CI as a regression guard.
