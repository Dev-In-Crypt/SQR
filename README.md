# Solidity Quick Review

## Project Overview

Solidity Quick Review is a web-based smart contract analysis platform. Users submit Solidity snippets or verified contract addresses, then receive a report in the web app. The report combines deterministic scanner findings with a separate AI review stage. Reports can be kept private, shared, or made public. A report can also be anchored onchain through an optional receipt flow on Base.

## User Workflow

1. User connects wallet.
2. User submits one of:
   - Solidity code snippet
   - verified contract address
3. System runs the asynchronous analysis pipeline.
   - Status page shows approximate progress phases (source prep, scanner, structure extraction, AI audit, report generation).
   - Failed runs are shown with categorized user-facing error states.
4. Report is generated and displayed in the web app.
5. User can:
   - keep report private
   - switch report to public
   - generate a share link
   - mint an onchain receipt
6. Reports are stored and accessible through history tied to user wallet/session ownership.

## Analysis Pipeline

Pipeline stages:

1. Source ingestion (snippet or verified contract source by address).
2. Source normalization and validation.
3. Static analysis scanner stage (Slither when available, with fallback behavior).
4. Structured contract context extraction.
5. AI audit stage.
6. Report assembly and persistence.

Analysis execution is asynchronous and processed through the worker pipeline (queue mode) or inline runtime mode, depending on deployment configuration.

## Report Model

Each report contains:

- scanner findings (deterministic)
- AI audit findings (heuristic)
- executive/scanner summary
- analysis coverage block (what stages/components completed)
- analysis metadata
- warnings and partial-analysis signals when applicable

Important behavior:

- AI findings do not affect deterministic report hashing.
- `reportHash` is derived from scanner-based deterministic report data.

This platform is an automated review layer and does not replace a full manual security audit.

## Report Visibility

Reports support owner-controlled visibility modes:

- **Private**: default mode; access is restricted to owner context and private share token links.
- **Public**: report can be viewed without private token.

Users can generate share links for private report access and can switch visibility mode from the report UI/API.

## Onchain Receipt

Users can mint an optional onchain receipt for a report.

- Receipt flow anchors the report's `reportHash`.
- Receipt minting is executed on Base.
- Stored receipt metadata links the offchain report and onchain transaction.
- The receipt provides proof that a specific report hash existed at a specific onchain event time.

## Supported Inputs

### Supported

- Solidity code snippets
- verified Solidity contract source
- contract addresses on supported Base networks

### Partial support

- multi-contract source bundles
- contracts with simple inheritance graphs

### Not fully supported yet

- upgradeable proxy systems
- delegatecall-heavy architectures
- large multi-file protocol repositories
- assembly-heavy contracts

## System Architecture

Main components:

- **Web application**: user submission, report view, visibility controls, receipt UI, history UI
- **API service**: analysis lifecycle, report access control, history, receipt endpoints
- **Analysis worker**: asynchronous analysis job execution
- **Scanner engine**: Slither-based static analysis stage
- **AI audit stage**: model-based heuristic review
- **Database**: users, sessions, analyses, reports, findings, receipts
- **Receipt contract**: onchain report receipt registry on Base

## Deployment

Typical production topology is VPS-based with separate web/API and worker processes.

Recommended process management is native `systemd` with two units:

- `sqr-web.service`
- `sqr-worker.service`

Reference setup is provided in `deploy/systemd/` with an operations guide in `docs/operations/systemd-vps.md`.

For production deploys on VPS, use the safe deploy flow:

```bash
npm run deploy:vps
npm run deploy:vps:verify
```

The deploy script builds the app, restarts `sqr-web`, checks health endpoints, and auto-rolls back to the previous
`.next` build if startup/health checks fail.

Run-time services:

- API/web service
- worker process
- database
- queue backend (when queue mode is enabled)

Major dependencies:

- Node.js
- PostgreSQL
- Redis
- Slither
- solc

## Environment Configuration

Environment configuration is organized by category:

- app runtime
- database
- redis/queue
- rpc/chain
- AI models
- feature flags
- timeout controls
- secrets

Use `.env.example` as the baseline and configure values for local, staging, or production runtime.

## Repository Structure

```text
app/        Next.js app routes and API endpoints
lib/        analysis pipeline, scanner, AI, queue, auth, receipt logic
contracts/  receipt contract and contract tests
scripts/    worker and operational scripts
tests/      unit, integration, and e2e suites
docs/       project documentation
```

## License

No repository-level license file is currently present.
