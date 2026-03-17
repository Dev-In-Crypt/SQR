# Solidity Quick Review

## What it does

- Analyzes Solidity snippets and verified Base contract source.
- Combines deterministic static findings with an AI logic review.
- Returns a structured report with severities, evidence, and remediation direction.
- Keeps reports private by default with optional sharing/public visibility.
- Optionally anchors report integrity onchain via a Base receipt.

## Goals

- Provide a fast pre-audit checkpoint for Solidity teams and Base builders.
- Preserve report integrity through stable deterministic hashing.
- Make review outputs shareable without exposing private data by default.
- Add optional onchain proof that a specific report existed at a specific time.

## Live demo

- App: https://solidity-scan.com
- Health endpoint: https://solidity-scan.com/api/v1/health

## Demo materials

- Public product flow: submit snippet or verified Base address, wait for async analysis, inspect report.
- Receipt flow: connect wallet on required network, prepare EIP-712 payload, mint, then confirm transaction.
- Test coverage matrix: `docs/test-matrix.md`
- Impact metrics snapshot (manual weekly update): `docs/impact.md`

## Quickstart local

### Option A: Docker for data services (recommended)

1. Copy env template: `cp .env.example .env`
2. Start Postgres and Redis: `docker compose up -d postgres redis`
3. Install dependencies: `npm ci`
4. Generate Prisma client and apply schema: `npx prisma generate && npx prisma db push`
5. Start web app: `npm run dev`
6. Start worker in second terminal: `npm run worker`
7. Check health: `curl http://localhost:3000/api/v1/health`

### Option B: Manual dependencies

- PostgreSQL 16+
- Redis 7+
- Slither (`slither-analyzer`)
- `solc` 0.8.24 (matches `foundry.toml`)
- Foundry (`forge`) for contract tests

## Installation steps

1. Install Node.js 20+.
2. Install project dependencies: `npm ci`.
3. Configure environment from `.env.example` (do not commit secrets).
4. Ensure database and Redis are reachable.
5. Install scanner toolchain (`slither`, `solc 0.8.24`, optional Foundry for contract tests).
6. Initialize database: `npx prisma generate && npx prisma db push`.
7. Run app and worker (`npm run dev` and `npm run worker`).

## Working demo

1. Open https://solidity-scan.com
2. Submit Solidity snippet or verified Base contract address.
3. Review generated findings and metadata.
4. Optionally mint an onchain receipt from the report page.

## Production deployment

Production runtime uses a VPS with two `systemd` services:

- `sqr-web.service`
- `sqr-worker.service`

Safe deploy flow:

```bash
npm run deploy:vps
npm run deploy:vps:verify
```

Operational runbook: `docs/operations/systemd-vps.md`

## Base deployment

- Chain: Base mainnet (`8453`)
- ReceiptRegistry contract: `0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B`
- Verification link: https://basescan.org/address/0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B#code
- Onchain write model:
  - primary key: `reportHash`
  - stored metadata: `receiptId`, `owner`, `contractAddress`, `analyzerVersionHash`, `timestamp`
  - emitted event: `ReceiptMinted(reportHash, contractAddress, analyzerVersionHash, owner, minter, timestamp, receiptId)`
  - authorization protections: signed EIP-712 payload with `nonce` and `deadline`

## Polkadot Hub deployment

- Polkadot Hub Testnet (`420420417`): `https://eth-rpc-testnet.polkadot.io/`
- Polkadot Hub Mainnet (`420420419`): `https://eth-rpc.polkadot.io/`
- Explorers:
  - Testnet: `https://blockscout-testnet.polkadot.io`
  - Mainnet: `https://blockscout.polkadot.io`
- Deploy commands (requires `DEPLOYER_PRIVATE_KEY` in local env):
  - `npm run deploy:receipt:polkadot:testnet`
  - `npm run deploy:receipt:polkadot:mainnet`

## Security model

- Reports are private-by-default and owner-scoped unless explicitly shared/published.
- Deterministic `reportHash` is derived from scanner-grounded report data.
- AI findings are advisory and do not modify deterministic hash output.
- Receipt minting is signature-gated with EIP-712 typed data.
- Per-owner nonce enforcement prevents signature replay.
- Deadline enforcement limits signature lifetime.
- Receipt network is explicitly chain-gated by environment.
- Slither security gate blocks CI on `MEDIUM` and `HIGH` severities.
- Gitleaks scans commits and CI for accidental secret exposure.
- The platform is an automated review layer, not a replacement for manual audits.

See: `SecurityChecks.md`

## Analysis pipeline

1. Source ingestion (snippet or verified contract source by address)
2. Source normalization and validation
3. Static analysis scanner stage (Slither + Foundry build checks when available, with fallback behavior)
4. Structured contract context extraction
5. AI audit stage
6. Report assembly and persistence

Analysis runs asynchronously via worker queue mode or inline runtime mode, depending on deployment configuration.

## Supported inputs

### Supported

- Solidity code snippets
- Verified Solidity contract source
- Contract addresses on supported Base networks

### Partial support

- Multi-contract source bundles
- Contracts with simple inheritance graphs

### Not fully supported yet

- Upgradeable proxy systems
- Delegatecall-heavy architectures
- Large multi-file protocol repositories
- Assembly-heavy contracts

## System architecture

- **Web application**: submission UI, report UI, visibility controls, receipt flow, history
- **API service**: analysis lifecycle, access control, history, receipt endpoints
- **Analysis worker**: asynchronous pipeline execution
- **Scanner engine**: Slither-backed static analysis stage
- **AI audit stage**: model-based heuristic review
- **Database**: users, sessions, analyses, reports, findings, receipts
- **Receipt contract**: onchain report receipt registry on Base

## Environment configuration

Use `.env.example` as the baseline for local/staging/production configuration.

## Secret scanning

- Install local git hooks: `npm run hooks:install`
- Run local secret scan: `npm run security:gitleaks`
- CI workflow: `.github/workflows/gitleaks.yml`

## Repository structure

```text
app/        Next.js app routes and API endpoints
lib/        analysis pipeline, scanner, AI, queue, auth, receipt logic
contracts/  receipt contract and contract tests
scripts/    worker and operational scripts
tests/      unit, integration, and e2e suites
docs/       project documentation
```

## License

This project is licensed under the MIT License. See `LICENSE`.
