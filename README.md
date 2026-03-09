# Solidity Quick Review

Solidity Quick Review is a Next.js-based smart contract analysis service for fast, repeatable risk checks on Solidity source. It accepts pasted Solidity snippets and verified Base contracts by address, runs a deterministic static scanner stage, then adds an optional AI audit stage as a separate output channel. Reports are stored in PostgreSQL with private-by-default access controls, and can be linked to an optional onchain receipt on Base through `ReceiptRegistry`. The runtime supports inline processing or Redis/BullMQ worker processing, with VPS-style deployment as the intended production target.

## Core capabilities

- Analyze Solidity source from paste input (`PASTE_CODE`) and verified Base address input (`BASE_ADDRESS`).
- Run static analysis with Slither when available, with deterministic heuristic fallback when Slither is unavailable or returns no findings.
- Build deterministic scanner report artifacts (findings, warnings, scanner errors, report hash).
- Run a separate AI audit review stage and store AI findings independently from scanner findings.
- Generate structured audit context for AI input (when `ENABLE_STRUCTURED_AUDIT_CONTEXT=true`).
- Process analyses via worker queue (Redis + BullMQ) or inline mode when Redis is not configured.
- Optionally prepare and confirm an onchain receipt proof on Base via EIP-712 + `mintWithSig`.

## Architecture overview

- **Web app (`app/`)**: Next.js App Router UI for submit, status, report access, history, and receipt flow.
- **API (`app/api/v1/*`)**: request validation, source ingestion, queueing, report read/write, auth/session, receipt endpoints.
- **Worker (`scripts/worker.ts`, `lib/queue.ts`)**: BullMQ consumer that runs analysis pipeline jobs.
- **Scanner (`lib/scanner.ts`)**: Slither execution and heuristic static rules.
- **AI audit stage (`lib/llm.ts`)**: model calls for scanner summary and AI findings.
- **Database (`prisma/schema.prisma`)**: analyses, source bundles, reports, findings, receipts, sessions.
- **Receipt contract (`contracts/ReceiptRegistry.sol`)**: Base onchain receipt registry with signature-based minting.

## Analysis pipeline

1. **Input**: user submits pasted code or Base contract address.
2. **Source normalization**: sanitize input, validate pragma/syntax boundaries, fetch verified source for address mode.
3. **Static scanner stage**: run Slither (preferred) or fallback heuristic scanner.
4. **Structured audit context**: extract deterministic contract structure metadata (feature-flagged).
5. **AI audit stage**: generate AI findings from source + scanner context (if API key configured).
6. **Report generation**: store scanner findings, scanner summary, warnings, AI findings, metadata, and `reportHash`.
7. **Optional receipt flow**: prepare typed data, user mints onchain, confirm tx/event and persist receipt record.

## Supported scope

### Supported

- Solidity `0.8.x` contracts (current scanner and pragma policy are centered on 0.8.x).
- Single-file paste mode (up to 200 lines, complete contract body required).
- Verified contract source ingestion for Base networks (`8453`, `84532`) via BaseScan v2 and Sourcify fallback.
- Common security patterns detectable via configured Slither detectors and heuristic rules.
- Escrow/DeFi/vault-style logic analysis when provided as complete Solidity source.

### Partial support

- Multi-file verified sources: supported for ingestion and scanning, but analysis depth depends on available compiler/runtime setup.
- Contracts with imports and broader inheritance graphs: parsed and scanned, but findings may be less complete in complex layouts.
- Proxy-marked verified contracts: can be fetched/analyzed, but implementation-level conclusions may be incomplete.

### Not fully supported yet

- Full proxy/upgradeability reasoning across proxy + implementation + admin control planes.
- Heavy inline assembly / low-level opcode-heavy code paths.
- Large, deeply-coupled multi-contract systems requiring whole-system semantic reasoning.
- Bytecode-only analysis for unverified contracts (unverified source currently fails with `SOURCE_UNVERIFIED`).

## Security model and limitations

- Scanner findings and AI findings are separate outputs.
- `reportHash` is derived from deterministic scanner payload (scanner findings + metadata + warnings/errors/partial reasons).
- AI findings are excluded from `reportHash` by design.
- AI output is non-deterministic and can miss issues or produce weak suggestions.
- Static scanning is pattern-based and does not replace full adversarial/manual audit workflows.
- Proxy, upgradeable, fee-on-transfer, and system-level cross-contract behaviors can require manual review.

## Runtime and deployment modes

- Intended production target: Linux VPS deployment running separate web and worker processes.
- **Inline mode**: if `REDIS_URL` is unset, analysis jobs are processed in the API process.
- **Queue mode**: if `REDIS_URL` is set, analysis creation requires active workers; otherwise API returns `503 WORKER_UNAVAILABLE`.
- Slither/solc availability materially affects scanner depth and warning/error profile.
- AI summary/audit model execution is separate from scanner execution and requires configured model credentials.
- Structured audit context extraction is controlled by `ENABLE_STRUCTURED_AUDIT_CONTEXT`.

## Environment configuration

Configure `.env` from `.env.example`. Main groups:

- **App/runtime**: `NEXT_PUBLIC_APP_URL`, `APP_ENV`, `NODE_ENV`, session/cookie settings.
- **Database**: `DATABASE_URL`, `DATABASE_URL_DIRECT`.
- **Redis/queue**: `REDIS_URL`, `ANALYSIS_QUEUE_NAME`.
- **Chain/RPC**: `BASE_CHAIN_ID`, `STAGING_BASE_CHAIN_ID`, `BASE_RPC_URL`, `BASE_MAINNET_RPC_URL`, `BASE_SEPOLIA_RPC_URL`.
- **Source fetch**: `BASESCAN_API_URL`, `BASESCAN_API_KEY`, `SOURCIFY_API_URL`.
- **Scanner toolchain**: `ENABLE_SLITHER`, `SOLC_PATH`, `ENABLE_SOLC_AUTO_RESOLVE`, `SOLC_VERSION_MANAGER`, `SOLC_FALLBACK_PATH`.
- **AI models**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_GENERAL_MODEL`, `OPENAI_AUDIT_MODEL`, `OPENAI_TEMPERATURE`.
- **Feature flags**: `ENABLE_STRUCTURED_AUDIT_CONTEXT`.
- **Secrets**: `PRIVATE_LINK_SECRET`, and production receipt configuration including `RECEIPT_CONTRACT_ADDRESS`.

## Local development

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run db:push
npm run check:db
npm run dev
```

Run worker in a second process (required for queue mode):

```bash
npm run worker
```

## Production deployment (VPS)

1. Install runtime and tool dependencies (Node.js 20+, PostgreSQL, optional Redis, optional Slither/solc, optional Foundry for contract operations).
2. Provision `.env` with production values (`APP_ENV=production`), including chain RPC and receipt contract settings.
3. Build application:

```bash
npm ci
npm run prisma:generate
npm run build
```

4. Run web process:

```bash
npm run start
```

5. Run worker process (if using Redis queue mode):

```bash
npm run worker
```

6. Use a process manager (for example `systemd` or PM2) to supervise web + worker separately.

## Output model

Each completed report stores:

- `findings`: deterministic scanner findings.
- `scannerSummary` (and `executiveSummary` alias): scanner-oriented summary text.
- `aiAuditFindings`: separate AI audit findings list.
- `warnings`, `scannerErrors`, `partialReasons`: runtime and quality signals.
- `metadata`: analyzer/ruleset versions, chain/input metadata, source hash, timestamp.
- `reportHash`: deterministic hash of scanner payload only (AI findings excluded).

Receipt flow (optional):

- `prepare`: builds EIP-712 typed data and call metadata for `mintWithSig`.
- wallet signs and submits onchain tx.
- `confirm`: verifies tx/event/signature consistency and persists receipt linkage in DB.

## Known limitations

- Unverified contracts are rejected (no bytecode-only fallback analysis).
- Paste mode is limited to complete snippets up to 200 lines.
- Complex proxy/upgradeable systems need manual end-to-end review.
- Scanner quality depends on available Slither/solc runtime.
- AI stage can be unavailable or empty when model access is not configured.

## Repository structure

```text
app/        Next.js UI and API routes
lib/        analysis pipeline, scanner, AI, queue, auth, receipt logic
contracts/  Solidity receipt registry and contract tests
prisma/     database schema and client generation
scripts/    worker and test orchestration scripts
tests/      unit, integration, and e2e tests
docs/       project docs and testing references
```

## License

No repository-level license file is currently present.
