# Solidity Quick Review

## Short product summary
Solidity Quick Review is an automated Solidity risk-triage product for snippet and verified-contract analysis. It helps teams run fast screening, review structured findings, and decide what needs deeper manual audit. The product is not a formal audit platform and does not provide security certification.

## Core use cases
- Solidity snippet review
- Verified contract review by address
- Free static-only quick scan at `/quick` — no wallet, no account
- Structured findings with severity, evidence, and remediation direction
- Optional onchain proof/receipt flow for report artifact existence
- Public receipt verification at `/verify` — anyone can check a report hash against the onchain registry

## Supported networks
| Network | Status | Notes |
|---|---|---|
| Base Mainnet (8453) | Supported | Production network |
| Base Sepolia (84532) | Supported | Staging/testing path |

The product is Base-only by design. Receipt anchoring uses the ReceiptRegistry contract on Base mainnet.

## Key features
- Snippet and verified-address analysis
- **Full review** (`/`): combined static analysis (Slither + Foundry checks) and AI-assisted logic review
- **Quick scan** (`/quick`): free, static-only, no wallet — a lightweight funnel into the full review
- Deterministic report hashing
- Optional receipt anchoring flow (EIP-712 signed mint on Base)
- Public receipt verification (`/verify`, `GET /api/v1/verify?hash=`) — checks the hash against the ReceiptRegistry, no account or report content exposed
- Private-by-default reports with share links and visibility controls
- Report export: Markdown download and print/PDF (`GET /api/v1/report/[reportId]/export?format=md`)
- Embeddable status badge (`GET /api/v1/badge/[reportId]`, SVG)
- Rate limits with a paid path (x402 USDC on Base) for analyses above the free daily limit; identical inputs reuse a recent report instead of re-running the pipeline

## Architecture overview
- Web app (Next.js App Router): input, report, history, receipt UX
- API layer: analysis lifecycle, auth/ACL, report/receipt/verify/badge endpoints
- Analysis pipeline: source ingestion → static analysis (Slither + Foundry) → structure extraction → AI-assisted layer → report assembly
- Worker/queue execution for async analysis (BullMQ + Redis; inline fallback without Redis)
- Postgres via Prisma; ReceiptRegistry contract on Base for onchain provenance

## Developer commands
| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests (spawns Postgres schema + anvil + app) |
| `npm run test:e2e` | Playwright end-to-end (incl. responsive + payment-flow specs) |
| `npm run test:contract` | Foundry contract tests (`forge test`) |
| `npm run benchmark:pipeline` | Detection-quality benchmark vs paired vulnerable/safe fixtures (add `--with-ai`, `--strict`) — see `docs/benchmark-quality.md` |
| `npm run llm:usage` | LLM token/cost summary from the `llm_usage` table (`--days N`, optional `LLM_PRICE_JSON`) |
| `npm run security:slither` | Slither security scan |
| `npm run deploy:vps` / `npm run deploy:vps:verify` | VPS deploy + runtime health verification |

## Continuous integration
- `.github/workflows/ci.yml` — typecheck, lint, and unit tests on every push and PR.
- `.github/workflows/slither.yml` — Slither security gate on the production contract.

## Local setup notes
A few config files are **intentionally gitignored** and must exist locally for the full toolchain, but are kept out of the repo on purpose:

- `foundry.toml`, `slither.config.json`, `slither.db.json` — the Foundry + Slither triage setup. Committing `foundry.toml` or `slither.config.json` makes the Slither CI action detect a Foundry project and compile+scan the intentionally-vulnerable `contracts/benchmark*` fixtures, turning the security gate red. Keep them local.
- `.env` — secrets and runtime config (see `.env.example` for the full key list).

`tsconfig.json` and `middleware.ts` **are** committed (required for the app to build from a clean clone).

## Current limitations
- Not a replacement for manual smart contract audit
- No security guarantees or certification claims
- Some advanced multi-contract protocol flows still require manual interpretation of findings
