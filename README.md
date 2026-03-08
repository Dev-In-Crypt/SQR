# Solidity Quick Review (MVP)

Next.js fullstack application for Solidity quick risk review with:
- paste code (up to 200 lines)
- Base verified contract source by address
- deterministic report hash
- private-by-default report access
- optional Base onchain receipt

## Tech stack
- Next.js (App Router, TypeScript)
- PostgreSQL + Prisma
- Redis + BullMQ (worker queue)
- Slither (when available) + heuristic fallback
- Optional LLM executive summary
- Foundry (smart contract tests)
- Vitest (unit + integration)
- Playwright (E2E smoke)

## Module boundaries (MVP-safe)
- New additive facade entrypoints:
  - `@/lib/core`
  - `@/lib/infra`
  - `@/lib/runtime`
  - `@/lib/domains/analysis`
  - `@/lib/domains/auth`
  - `@/lib/domains/receipt`
- Existing `@/lib/*` imports remain valid during MVP and are not mass-rewritten.
- Post-MVP file moves should use compatibility shims at old paths.
- Detailed policy: `docs/module-boundaries.md`.

## Quick start
1. Copy env:
```bash
cp .env.example .env
```
2. Start infra (required for API integration/E2E):
```bash
docker compose up -d
```
3. Install deps:
```bash
npm install
```
4. Prisma:
```bash
npm run prisma:generate
npm run db:push
npm run check:db
```
5. Run app:
```bash
npm run dev
```
6. Run worker (if REDIS_URL is configured):
```bash
npm run worker
```

If Redis is not configured, analysis jobs are processed inline by the API process.

## Main routes
- `GET /` home
- `GET /analysis/[analysisId]`
- `GET /r/[reportId]?token=...`
- `GET /history`
- `GET /receipt/[reportId]`
- `GET /api/v1/health`

## API v1
- `POST /api/v1/analysis`
- `GET /api/v1/analysis/{analysisId}`
- `GET /api/v1/report/{reportId}?token=...`
- `POST /api/v1/report/{reportId}/visibility`
- `POST /api/v1/report/{reportId}/share-token`
- `GET /api/v1/history`
- `GET /api/v1/config`
- `GET /api/v1/health`
- `POST /api/v1/receipt/{reportId}/prepare`
- `POST /api/v1/receipt/{reportId}/confirm`
- `POST /api/v1/auth/nonce`
- `POST /api/v1/auth/verify`
- `POST /api/v1/auth/logout`
- `GET /api/v1/session`

### Receipt API semantics (v0.2.0)
- `POST /api/v1/receipt/{reportId}/prepare`:
  - requires authenticated owner wallet session
  - returns EIP-712 typed data (`domain`, `types`, `primaryType`, `message`) and call metadata for `mintWithSig`
  - uses canonical DB `reportHash` and onchain `nonces(owner)`
- `POST /api/v1/receipt/{reportId}/confirm`:
  - requires `txHash`, `owner`, `nonce`, `deadline`, `signature`
  - verifies recovered EIP-712 signer offchain against canonical report data
  - verifies onchain `ReceiptMinted` event hash/owner from configured registry

## Smart contract
- `contracts/ReceiptRegistry.sol`
- Foundry tests:
  - `contracts/test/ReceiptRegistry.t.sol`
  - `contracts/test/ReceiptRegistry.fuzz.t.sol`
  - `contracts/test/ReceiptRegistry.invariant.t.sol`

### Receipt ownership and duplicate policy (v0.2.0)
- Active mint path: `mintWithSig(reportHash, contractAddress, analyzerVersionHash, owner, nonce, deadline, signature)`.
- Authorization type: `MintAuthorization(reportHash, contractAddress, analyzerVersionHash, owner, nonce, deadline)` (EIP-712 domain binds name/version/chainId/verifyingContract).
- `owner` is the recovered signer; `minter` is `msg.sender` (transaction submitter).
- Legacy `mint(...)` remains in ABI for backward compatibility but always reverts with `MintDeprecatedUseMintWithSig`.
- Same `reportHash` + same `analyzerVersionHash` + same `owner`:
  - returns stable existing `receiptId`
  - `newlyMinted = false`
  - emits no second `ReceiptMinted` event
- Same `reportHash` + different `analyzerVersionHash`:
  - reverts with deterministic custom error `AnalyzerVersionMismatch`
- Same `reportHash` + different `owner`:
  - reverts with deterministic custom error `OwnerMismatch`
- Replay protection: per-owner nonce + authorization deadline.

## Test matrix
- See `docs/test-matrix.md` for feature-to-layer coverage mapping.

## Test commands

### 1) Lint
```bash
npm run lint
```

Optional boundary guard for new files only (warning-only by default):
```bash
npm run lint:boundaries:new
```

### 2) Unit tests
```bash
npm run test:unit
```

### 3) Unit coverage (Vitest)
```bash
npm run test:unit:cov
```

Coverage output is written to `coverage/`.

### 4) Contract tests (Foundry)
```bash
npm run test:contract
```

### 5) Contract coverage (Foundry)
```bash
forge coverage
```

### 6) API integration tests (real Postgres, optional Redis)
Requirements:
- Docker running
- `DATABASE_URL` reachable
- DB schema initialized (`npm run check:db`)
- `anvil` and `forge` available in PATH

Run core integration suite (Redis disabled, deterministic inline processing):
```bash
npm run test:integration
```

Run optional Redis queue lane:
```bash
SQR_WITH_REDIS=1 REDIS_URL=redis://localhost:6379 npm run test:integration:redis
```

### 7) Playwright E2E smoke tests
Requirements:
- Docker running (Postgres)
- Playwright browser installed

Install browser once:
```bash
npm run playwright:install
```

Run smoke suite:
```bash
npm run test:e2e
```

Run headed smoke suite:
```bash
npm run test:e2e:headed
```

Artifacts:
- screenshots and traces on failure under `output/playwright/`

### 8) Full suite (CI-style local orchestration)
```bash
npm run test:all
```

## Environment variables by layer

### Local app runtime
- `APP_ENV=local`
- `DATABASE_URL`
- `REDIS_URL` (optional)
- `BASE_RPC_URL` (fallback RPC for receipt prepare/confirm)
- `BASE_MAINNET_RPC_URL` (preferred Base mainnet RPC for receipt reads and wallet add/switch)
- `BASE_SEPOLIA_RPC_URL` (preferred Base Sepolia RPC for receipt reads and wallet add/switch)
- `RECEIPT_CONTRACT_ADDRESS` (required for receipt prepare/confirm)
- `TRUSTED_IP_HEADERS` (ordered trusted headers for client IP extraction)
- `TRUST_PROXY_HOPS` (trusted proxy hops used for `x-forwarded-for` parsing)
- `SOLC_PATH` (optional absolute path to `solc`/`solc.exe` used by snippet standalone Slither scans)
- `ENABLE_SOLC_AUTO_RESOLVE` (default `true`; when enabled the scanner attempts pragma-aware compiler selection)
- `SOLC_VERSION_MANAGER` (optional; set `solc-select` to use installed `solc-select` versions for pragma-compatible resolution)
- `SOLC_FALLBACK_PATH` (optional absolute fallback solc binary when `SOLC_PATH` is not set)
- `SOLC_CACHE_DIR` (optional compiler cache hint for local runtime tooling)
- `OPENAI_API_KEY` (optional; if empty, app uses local summary fallback)
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`; set `https://openrouter.ai/api/v1` for OpenRouter)
- `OPENAI_MODEL` (for OpenRouter use provider-prefixed model id, e.g. `openai/gpt-4.1-mini`)
- `OPENAI_HTTP_REFERER` and `OPENAI_APP_NAME` (optional OpenRouter attribution headers)

### Integration tests
Set from shell or CI:
- `DATABASE_URL` (or `INTEGRATION_DATABASE_URL`)
- `REDIS_URL` (only for `--redis` lane)
- Optional overrides:
  - `SQR_TEST_PORT`
  - `SQR_ANVIL_PORT`
  - `SQR_WITH_REDIS`
  - `SQR_NEXT_DIST_DIR` (optional; normally auto-managed by the integration harness)

### E2E tests
Set from shell or CI:
- `DATABASE_URL` (or `E2E_DATABASE_URL`)
- Optional overrides:
  - `SQR_E2E_PORT`
  - `SQR_E2E_ANVIL_PORT`
- `SQR_NEXT_DIST_DIR` (optional; normally auto-managed by the E2E harness)

## Production process set
- Required processes: `web` + `worker`.
- If `REDIS_URL` is configured and worker is down, analysis create now returns `503 WORKER_UNAVAILABLE` instead of accepting stuck queued jobs.
- Readiness probe: `GET /api/v1/health` returns `200` only when analysis queue mode is ready (or inline mode is active).

## Environments: local vs staging vs production
- `local`: developer and CI test runs, local Anvil for chain tests.
- `staging`: external shared environment (typically Base Sepolia and staging secrets).
- `production`: Base mainnet and production secrets, no test harness hooks.

## CI command sequence
Run this sequence in CI or for local CI-equivalent verification:
```bash
npm run lint
npm run test:unit:cov
forge coverage
npm run test:all
# optional security lane
npm run security:slither:ci
```

Parallel CI port override examples:
```bash
SQR_TEST_PORT=33111 SQR_ANVIL_PORT=34111 npm run test:integration
SQR_E2E_PORT=33211 SQR_E2E_ANVIL_PORT=34211 npm run test:e2e
```

If an override port is already in use, the harness now fails fast with a clear error message.

## Slither Security Checks

### Prerequisites
- Python 3.10+
- Foundry (`forge`) available in `PATH`
- Run commands from repository root

### Install Slither
Recommended (`pipx`):
```bash
pipx install slither-analyzer
```

Fallback (`pip` user install):
```bash
python -m pip install --user slither-analyzer
```

### Run Slither
Local security check:
```bash
npm run security:slither
```

CI-equivalent local gate:
```bash
npm run security:slither:ci
```

Interactive triage for accepted findings only:
```bash
npm run security:slither:triage
```

### Pass/fail policy
- CI fails on `HIGH` and `MEDIUM` findings (`fail_on: medium`).
- `LOW` and `INFO` are non-blocking but must be reviewed.
- JSON report output is written to `slither-report.json`.
- Full policy and suppression workflow: `SecurityChecks.md`.

### Compiler pin rationale
- The compiler is pinned in `foundry.toml` as `solc = "0.8.24"`.
- Contract pragma is pinned to `pragma solidity 0.8.24;` to match Foundry and avoid range drift.
- This removes the Slither `solc-version` detector warning caused by wide pragmas like `^0.8.20`.

### Accepted timestamp finding rationale
- Detector: `timestamp`
- Detector doc: https://github.com/crytic/slither/wiki/Detector-Documentation#block-timestamp
- Status: accepted for `ReceiptRegistry`.
- Why safe here:
  - `block.timestamp` gates signature expiry only (`deadline`) and stores receipt metadata.
  - No ETH/value transfer or external call behavior depends on timestamp.
  - Small validator skew can only shift expiry tolerance by seconds; users can request fresh authorizations.

### Triage workflow (`slither.db.json`)
1. Run CI-equivalent scan: `npm run security:slither:ci`.
2. Fix all `HIGH` and `MEDIUM` findings first.
3. If a finding is intentionally accepted, run: `npm run security:slither:triage`.
4. Accept only the specific reviewed finding(s), then commit generated `slither.db.json`.
5. Document each accepted finding in `SecurityChecks.md` with detector link and safety rationale.

### Common compile errors and fixes
- `slither: command not found`:
  - install Slither with `pipx` or `pip` and reopen shell.
- `forge: command not found`:
  - install Foundry and verify with `forge --version`.
- Slither compilation/remapping errors:
  - run `forge build` first and fix compile issues.
- Empty/incomplete analysis from wrong working directory:
  - rerun from repo root where `foundry.toml` and `slither.config.json` are present.
- Framework detection issues:
  - keep `compile_force_framework: foundry` in `slither.config.json`.
## Troubleshooting
- `forge-std/Test.sol not found`:
  - ensure `lib/forge-std/src/Test.sol` exists and `foundry.toml` has `libs = ["lib"]`.
- `docker command not found`:
  - install Docker Desktop and restart shell.
- Docker is installed but not running:
  - start Docker Desktop before running integration or E2E suites.
- integration tests stuck in `QUEUED`:
  - run core lane without Redis or start worker with valid `REDIS_URL`.
- Playwright errors about browsers:
  - run `npm run playwright:install`.
- Port is already in use for integration or E2E:
  - set `SQR_TEST_PORT`/`SQR_ANVIL_PORT` or `SQR_E2E_PORT`/`SQR_E2E_ANVIL_PORT` to free values and rerun.
- `The table public.sessions does not exist` or `DB_NOT_READY`:
  - run `npm run db:push`, then `npm run check:db` and retry request.
- `EPERM ... query_engine-windows.dll.node` on `npm run prisma:generate`:
  - stop running Node/Next processes, then retry `npm run prisma:generate` (or reboot if file lock persists).
- `EPERM ... .next/trace` during integration or E2E startup:
  - rerun the suite; each run uses an isolated `SQR_NEXT_DIST_DIR`, and stale processes are cleaned up automatically.
- `Slither standalone scan was skipped because solc is not available`:
  - set `SOLC_PATH` to the absolute compiler binary path (for example `C:\solc\solc.exe` on Windows).
- `No compatible local solc version was found for the source pragma`:
  - install matching compiler versions (for example with `solc-select`) and set `SOLC_VERSION_MANAGER=solc-select`.
- receipt confirm hash mismatch:
  - verify tx was minted for the same report and same deployed receipt registry.

## Notes
- Unverified Base contracts return `SOURCE_UNVERIFIED` and do not run bytecode-only analysis in MVP.
- Private link token is stored hashed in DB (`privateTokenHash`).
- Production address analysis enforces Base mainnet chainId 8453.
- Receipt owner semantics are signature-bound in v0.2.0; pre-v0.2.0 registries should be treated as deprecated for ownership claims.





