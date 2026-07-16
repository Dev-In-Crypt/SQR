# Solidity Quick Review

## Short product summary
Solidity Quick Review is an automated Solidity risk-triage product for snippet and verified-contract analysis. It helps teams run fast screening, review structured findings, and decide what needs deeper manual audit. The product is not a formal audit platform and does not provide security certification.

## Core use cases
- Solidity snippet review
- Verified contract review by address
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
- Combined static analysis (Slither + Foundry checks) and AI-assisted logic review
- Deterministic report hashing
- Optional receipt anchoring flow (EIP-712 signed mint, user pays only gas)
- Private-by-default reports with share links and visibility controls
- Embeddable status badge (`/api/v1/badge/[reportId]`)

## Architecture overview
- Web app (Next.js): input, report, history, receipt UX
- API layer: analysis lifecycle, auth/ACL, report/receipt endpoints
- Analysis pipeline: source ingestion, static analysis, structure extraction, AI-assisted layer, report assembly
- Worker/queue execution for async analysis
- Receipt contract for onchain proof of report artifact existence

## Testing / validation
- `npm run build`
- `npm run typecheck`
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- End-to-end tests: `npm run test:e2e`
- Contract tests: `npm run test:contract`
- Runtime verification scripts for deployment health (`npm run deploy:vps:verify`)

## Current limitations
- Not a replacement for manual smart contract audit
- No security guarantees or certification claims
- Some advanced multi-contract protocol flows still require manual interpretation of findings
