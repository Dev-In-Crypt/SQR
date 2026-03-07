# 1. Launch baseline checklist

Launch package scope: documentation and audit artifacts only.

Baseline source policy: pinned commit only (not local dirty tree).

Current pinned baseline snapshot:
- Baseline SHA: `d190c3829a19bae5317d0ccfb2fb2e59f2f6e51a`
- Release tag at SHA: `v0.2.3`

## Freeze and reproducibility

- [ ] Record baseline SHA (single source of truth).
- [ ] Record release tag that points to baseline SHA.
- [ ] Confirm release candidate tree is clean before final sign-off.
- [ ] Archive command outputs in release evidence:
  - [ ] `git rev-parse HEAD`
  - [ ] `git tag --points-at HEAD`
  - [ ] `git status --porcelain`

## Must-fix gate logic

- [ ] All launch-critical blockers are explicitly tracked.
- [ ] `Must-fix before launch` list is empty.
- [ ] If at least one must-fix is open, launch decision is automatically `NO`.
- [ ] Sign-off is allowed only when all required smoke checks are in `PASS`.

## Sign-off prerequisites

- [ ] Runtime matrix is fully populated for staging and production.
- [ ] Queue mode decision is documented and approved.
- [ ] ReceiptRegistry deployment evidence exists for staging and production.
- [ ] Final launch sign-off template is filled and approved.

# 3. Queue mode decision note

Source anchors in current codebase:
- Queue mode toggle by Redis presence: `lib/queue.ts:13`
- Queue enqueue path: `lib/queue.ts:62`, `lib/queue.ts:76`
- Worker start path: `lib/queue.ts:79`, `scripts/worker.ts:8-11`
- Analysis create route enqueues without readiness endpoint in pinned baseline:
  `app/api/v1/analysis/route.ts:7`, `app/api/v1/analysis/route.ts:134`

## Decision criteria (MVP-safe)

Use `inline` mode when:
- Redis/worker operational ownership is not yet stable.
- Simplicity and deterministic behavior are higher priority than throughput.
- Expected analysis volume is low to moderate and acceptable for API process load.

Use `redis + worker` mode when:
- Redis availability is production-grade.
- Worker process supervision and restart policy are in place.
- Higher throughput or queue isolation is required.

## Go / no-go rules

Go for `inline` if all are true:
- [ ] `REDIS_URL` is unset in target runtime.
- [ ] Smoke confirms no stuck analyses in launch scenario.
- [ ] API latency/load is acceptable for projected launch traffic.

Go for `redis + worker` if all are true:
- [ ] `REDIS_URL` is set in target runtime.
- [ ] Worker process is deployed and supervised.
- [ ] Controlled restart test confirms jobs continue processing.
- [ ] Smoke confirms queued jobs reach terminal states.

No-go for launch:
- [ ] `REDIS_URL` is set but worker is not guaranteed running.
- [ ] Queue mode choice is not documented in sign-off.

# 5. Final smoke checklist artifacts

## Staging full smoke (required)

Attach evidence link per row (run log, screenshot, trace, API transcript).

| Check | Status (PASS/FAIL/BLOCKED) | Evidence link | Owner | Date |
| --- | --- | --- | --- | --- |
| Home page loads and analysis submission works |  |  |  |  |
| Auth nonce/verify/logout flow |  |  |  |  |
| Report read path (`/r/:id`) |  |  |  |  |
| Share link + private/public visibility flow |  |  |  |  |
| Receipt prepare flow (typed data) |  |  |  |  |
| Receipt confirm flow with valid tx |  |  |  |  |
| Receipt negative checks (signature/owner/network mismatch) |  |  |  |  |
| Config route network payload (`/api/v1/config`) |  |  |  |  |
| Queue-mode specific path (inline or redis+worker) |  |  |  |  |

## Production read-only smoke (required)

No onchain minting in production pre-launch smoke.

| Check | Status (PASS/FAIL/BLOCKED) | Evidence link | Owner | Date |
| --- | --- | --- | --- | --- |
| Home page and static assets |  |  |  |  |
| Read APIs reachable (`/api/v1/config`, `/api/v1/session`) |  |  |  |  |
| Report read path for existing report |  |  |  |  |
| Network/config payload matches production expectations |  |  |  |  |
| No critical runtime errors in logs during smoke window |  |  |  |  |

## Smoke completion gate

- [ ] Staging full smoke: all required rows `PASS`.
- [ ] Production read-only smoke: all required rows `PASS`.
- [ ] All evidence links are stored and immutable for audit.
