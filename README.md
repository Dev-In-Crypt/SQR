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

## API v1
- `POST /api/v1/analysis`
- `GET /api/v1/analysis/{analysisId}`
- `GET /api/v1/report/{reportId}?token=...`
- `POST /api/v1/report/{reportId}/visibility`
- `POST /api/v1/report/{reportId}/share-token`
- `GET /api/v1/history`
- `POST /api/v1/receipt/{reportId}/prepare`
- `POST /api/v1/receipt/{reportId}/confirm`
- `POST /api/v1/auth/nonce`
- `POST /api/v1/auth/verify`
- `POST /api/v1/auth/logout`
- `GET /api/v1/session`

## Smart contract
- `contracts/ReceiptRegistry.sol`
- Foundry tests:
  - `contracts/test/ReceiptRegistry.t.sol`
  - `contracts/test/ReceiptRegistry.fuzz.t.sol`
  - `contracts/test/ReceiptRegistry.invariant.t.sol`

### Receipt duplicate/analyzer policy
- Same `reportHash` + same `analyzerVersionHash`:
  - returns stable existing `receiptId`
  - `newlyMinted = false`
  - emits no second `ReceiptMinted` event
- Same `reportHash` + different `analyzerVersionHash`:
  - reverts with deterministic custom error `AnalyzerVersionMismatch`

## Test matrix
- See `docs/test-matrix.md` for feature-to-layer coverage mapping.

## Test commands

### 1) Unit tests
```bash
npm run test:unit
```

### 2) Contract tests (Foundry)
```bash
npm run test:contract
```

### 3) API integration tests (real Postgres, optional Redis)
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

Notes:
- Integration harness creates an isolated schema per run and drops it in teardown.
- Integration harness starts local Anvil, deploys `ReceiptRegistry`, and runs Next API tests over HTTP.

### 4) Playwright E2E smoke tests
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

## Environment variables by layer

### Local app runtime
- `APP_ENV=local`
- `DATABASE_URL`
- `REDIS_URL` (optional)
- `BASE_RPC_URL` (optional unless receipt confirm reads chain)
- `RECEIPT_CONTRACT_ADDRESS` (required for receipt mint prepare)
- `SOLC_PATH` (optional absolute path to `solc`/`solc.exe` used by snippet standalone Slither scans)

### Integration tests
Set from shell or CI:
- `DATABASE_URL` (or `INTEGRATION_DATABASE_URL`)
- `REDIS_URL` (only for `--redis` lane)
- Optional overrides:
  - `SQR_TEST_PORT`
  - `SQR_ANVIL_PORT`
  - `SQR_WITH_REDIS`

### E2E tests
Set from shell or CI:
- `DATABASE_URL` (or `E2E_DATABASE_URL`)
- Optional overrides:
  - `SQR_E2E_PORT`
  - `SQR_E2E_ANVIL_PORT`

## Environments: local vs staging vs production
- `local`: developer and CI test runs, local Anvil for chain tests.
- `staging`: external shared environment (typically Base Sepolia and staging secrets).
- `production`: Base mainnet and production secrets, no test harness hooks.

## CI notes
Recommended job split:
1. `unit`: `npm run test:unit`
2. `contract`: `npm run test:contract`
3. `integration-core`: `npm run test:integration`
4. `integration-redis` (optional): `npm run test:integration:redis`
5. `e2e-smoke`: `npm run test:e2e`
6. `slither-security`: GitHub workflow `.github/workflows/slither.yml` (pull requests + `main`)

Keep external chain checks (Sepolia/mainnet) optional/nightly.

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
  - `block.timestamp` is stored/emitted only as receipt metadata.
  - It is not used for authorization, pricing, randomness, fund flows, or critical control flow.
  - A small validator-controlled timestamp skew cannot change ownership or mint rules in this contract.

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
- integration tests stuck in `QUEUED`:
  - run core lane without Redis or start worker with valid `REDIS_URL`.
- Playwright errors about browsers:
  - run `npm run playwright:install`.
- `The table public.sessions does not exist` or `DB_NOT_READY`:
  - run `npm run db:push`, then `npm run check:db` and retry request.
- `EPERM ... query_engine-windows.dll.node` on `npm run prisma:generate`:
  - stop running Node/Next processes, then retry `npm run prisma:generate` (or reboot if file lock persists).
- `Slither standalone scan was skipped because solc is not available`:
  - set `SOLC_PATH` to the absolute compiler binary path (for example `C:\solc\solc.exe` on Windows).
- receipt confirm hash mismatch:
  - verify tx was minted for the same report and same deployed receipt registry.

## Notes
- Unverified Base contracts return `SOURCE_UNVERIFIED` and do not run bytecode-only analysis in MVP.
- Private link token is stored hashed in DB (`privateTokenHash`).
- Production address analysis enforces Base mainnet chainId 8453.
