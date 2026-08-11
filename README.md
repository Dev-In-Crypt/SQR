# Solidity Quick Review

> **Archived, discontinued as of 2026-08-11.** The hosted product
> (`solidity-scan.com`) is offline and the domain will not be renewed —
> the project never reached sustainable traffic or revenue, and active
> development/distribution has stopped. The code stays here, public, for
> reference. Existing onchain receipts remain independently verifiable
> without the site — see "Verifying a receipt after the site is down"
> below.

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
| Arbitrum One (42161) | Behind `ENABLE_ARBITRUM` | Analysis + receipts once a ReceiptRegistry is deployed there (`ARBITRUM_RECEIPT_CONTRACT_ADDRESS`) |

Base is the default network. Arbitrum is available behind the `ENABLE_ARBITRUM` flag: analysis works out of the box (verified-source fetch is multichain), and onchain receipts require a ReceiptRegistry deployed on Arbitrum. Receipts anchor on the same chain the report was analyzed on; `/verify` checks every configured registry.

## Key features
- Snippet and verified-address analysis
- **Full review** (`/`): combined static analysis (Slither + Foundry checks, optional Cyfrin Aderyn) and AI-assisted logic review
- **Quick scan** (`/quick`): free, static-only, no wallet — a lightweight funnel into the full review
- Deterministic report hashing
- Optional receipt anchoring flow (EIP-712 signed mint on Base)
- Deploy-drift monitoring: flags when a reviewed contract's onchain code has changed since the review (e.g. a proxy upgraded to a new implementation) — `GET /api/v1/report/[reportId]/drift`, behind `ENABLE_DEPLOY_DRIFT`
- Scan-to-scan diff: for a re-analyzed verified contract address, shows what changed since the owner's last review of it (new/resolved findings, severity changes) — `GET /api/v1/report/[reportId]/diff`, owner-only
- Public receipt verification (`/verify`, `GET /api/v1/verify?hash=`) — checks the hash against the ReceiptRegistry, no account or report content exposed
- Private-by-default reports with share links and visibility controls
- Report export: Markdown download and print/PDF (`GET /api/v1/report/[reportId]/export?format=md`)
- Embeddable status badge (`GET /api/v1/badge/[reportId]`, SVG)
- Rate limits with a paid path (x402 USDC on Base) for analyses above the free daily limit; identical inputs reuse a recent report instead of re-running the pipeline

## Verifying a receipt after the site is down
The `/verify` page and `/api/v1/verify` endpoint are gone along with the
hosted app, but the underlying proof is not — receipts were anchored
onchain specifically so they wouldn't depend on the site staying up.

`ReceiptRegistry` on Base Mainnet: [`0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B`](https://basescan.org/address/0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B)

To check a report hash directly:
1. Open the contract on [Basescan](https://basescan.org/address/0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B#readContract).
2. Call `getByHash(bytes32 reportHash)` with the deterministic report hash
   (shown on the report page/export at the time it was generated, or in
   the GitHub Action's PR comment for CI-generated reports).
3. A non-empty result with a matching hash confirms the report existed
   and was anchored at that block — independent of this repo or server.

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
- `.github/workflows/benchmark.yml` — detection-quality benchmark gate (`benchmark:pipeline --strict`) with pinned Slither/solc.
- `.github/workflows/integration-e2e.yml` — integration tests (API + pipeline against ephemeral Postgres/anvil) and Playwright E2E (payment flow, responsive, zoom reflow) using the repo's hermetic test harnesses.
- `.github/workflows/slither.yml` — Slither security gate on the production contract.
- `.github/workflows/sqr-self-review.yml` — dogfoods the review action against our own deployed ReceiptRegistry.

## GitHub Action — provenance-anchored review in CI
`action/` is a composite GitHub Action that runs a Solidity review in any repo's CI and posts findings plus a deterministic, onchain-verifiable report hash to the pull request. It reviews a deployed **verified** Base contract by address, or a single self-contained `.sol` file. See `action/README.md`.

```yaml
- uses: Dev-In-Crypt/SQR/action@main
  with:
    contract-address: "0xYourVerifiedBaseContract"
    fail-on: high
    # optional: anchor the report hash onchain so /verify shows it anchored
    mint-key: ${{ secrets.SQR_MINT_KEY }}
    rpc-url: ${{ secrets.BASE_RPC_URL }}
```

Onchain anchoring (`mint-key` + `rpc-url`) is opt-in; the hermetic mint path is tested in `action-mint-test.yml` against a local anvil.

## Local setup notes
A few config files are **intentionally gitignored** and must exist locally for the full toolchain, but are kept out of the repo on purpose:

- `foundry.toml`, `slither.config.json`, `slither.db.json` — the Foundry + Slither triage setup. Committing `foundry.toml` or `slither.config.json` makes the Slither CI action detect a Foundry project and compile+scan the intentionally-vulnerable `contracts/benchmark*` fixtures, turning the security gate red. Keep them local.
- `.env` — secrets and runtime config (see `.env.example` for the full key list).

`tsconfig.json` and `middleware.ts` **are** committed (required for the app to build from a clean clone).

## Current limitations
- Not a replacement for manual smart contract audit
- No security guarantees or certification claims
- Some advanced multi-contract protocol flows still require manual interpretation of findings
