# Detection-quality benchmark

Every static-analysis vendor claims a low false-positive rate. None publish a
way to check it. This benchmark is our attempt to do the opposite: a small,
public, paired vulnerable/safe contract set with a scoring script anyone can
run against the exact pipeline in production — not a marketing number, a
command.

```bash
git clone https://github.com/Dev-In-Crypt/SQR
cd SQR && npm install
npm run benchmark:pipeline          # static-only, ~5s, no API key needed
npm run benchmark:pipeline -- --with-ai   # full pipeline, needs OPENAI_API_KEY
```

## Methodology

- **Manifest**: [`scripts/benchmark-expectations.ts`](../scripts/benchmark-expectations.ts) —
  one case per contract, with its bug class, expected verdict, and the
  regex(es) a finding must match to count as a hit.
- **Runner**: [`scripts/benchmark-pipeline.ts`](../scripts/benchmark-pipeline.ts) —
  builds a real `SourceBundle` per case and runs it through the same
  `runStaticScan` (+ optional AI audit) the product runs in production. No
  synthetic scoring layer; it's the actual pipeline.
- **Scoring**: a vulnerable case is a **true positive** when any finding at or
  above its severity floor (MEDIUM by default) matches its regex. A safe case
  is a **false positive** when any finding at or above MEDIUM fires on it at
  all. Nine vulnerable/safe pairs, 15 cases total, source in
  [`contracts/benchmark/`](../contracts/benchmark) and
  [`contracts/benchmark2/`](../contracts/benchmark2) — read them yourself,
  they're short.
- **CI gate**: `.github/workflows/benchmark.yml` runs `--strict` (static-only,
  no LLM) on every push and PR. It fails the build on any regression against
  the baseline below. This is the only number that's continuously enforced;
  the AI-inclusive numbers further down are illustrative, single-run
  measurements, not a CI gate (LLM calls cost money and have run-to-run
  variance, so we don't gate merges on them).

## Results — static-only (CI-gated baseline)

`TP=5  FN=4  FP=1  TN=5   precision=0.83  recall=0.56  F1=0.67`

| Caught | Missed | False positive |
|---|---|---|
| reentrancy, tx-origin auth, controlled delegatecall, unchecked low-level call, weak randomness | signature replay, unprotected initializer, stale oracle, proxy storage collision | `safe-nonce-wallet` |

The four misses are exactly the bugs that need semantic reasoning about
*intent* — "is this nonce actually checked against replay," "is this oracle
timestamp actually validated" — not just pattern-matching on syntax. That's a
real, structural limit of static analysis, not a tuning gap; see "why static
analysis stops here" below.

The one false positive: Slither's `arbitrary-send-eth` fires on a value
transfer that's fully guarded by a signature + nonce check it can't reason
about. We could special-case it away, but that would also hide *real*
unguarded sends — so it stays flagged, on purpose, as a known FP. This is the
kind of tradeoff a raw "false positive rate" number hides and a reproducible
benchmark exposes.

## Results — full pipeline (static + AI audit, illustrative)

Same 15 cases, same scoring, with the AI audit stage enabled
(`--with-ai`). Two runs, two different models, one finding worth stating
plainly: **which specific bugs get caught depends on the model, and not
monotonically** — a cheaper model catching something a stronger model misses
on a single run is a real, observed result here, not a hypothetical.

| Audit model | TP | FN | FP | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| `gpt-4.1-mini` | 7 | 2 | 1 | 0.88 | 0.78 | 0.82 |
| `claude-sonnet-4.5` (production default) | 8 | 1 | 1 | 0.89 | 0.89 | 0.89 |

- `gpt-4.1-mini` additionally catches **unprotected initializer** and **proxy
  storage collision** over the static-only baseline, but still misses
  signature replay and stale oracle.
- `claude-sonnet-4.5` additionally catches **signature replay** and **stale
  oracle** over the static-only baseline, but misses unprotected initializer
  on this run — a case the cheaper model caught.
- Neither model is caught doing something "wrong" here; this is exactly why
  we publish the case-by-case matrix instead of a single blended number. A
  benchmark that only reports an aggregate score would hide that the *set* of
  blind spots shifts with the model, which matters if you're deciding whether
  a given finding's absence means "the code is fine" or "this tool's current
  configuration didn't happen to look at it that way."
- These two runs are single measurements (no repeated-trial averaging yet) —
  treated as illustrative of the AI stage's real, measurable lift over
  static-only, not as a precise, reproducible-to-the-decimal number the way
  the static baseline is.

## Why static analysis stops here

Slither's detectors reason about syntax and dataflow: does this call return
value get checked, does this function use `tx.origin`, is this delegatecall
target user-controlled. The four static misses above all require reasoning
about whether a check is *semantically sufficient*, not just *present*: does
this nonce actually get incremented before use, is this price feed's
`updatedAt` actually compared to a freshness window anywhere in the call
graph. That's a knowledge-representation problem static analyzers aren't
built for — which is exactly the gap the AI-assisted layer exists to narrow,
and exactly why we measure and publish both stages separately instead of
quoting one "our tool has an X% detection rate" number that blends them.

## Contribute a case

Found a vulnerability class we miss, or a safe pattern that trips a false
positive? Add a paired vulnerable/safe contract under `contracts/benchmark2/`,
register it in `scripts/benchmark-expectations.ts`, and open a PR. A new
`knownGapStatic` case that later gets caught by an improved detector is a
signal to remove the flag — the benchmark is meant to move, in public, with a
paper trail.
