# Solidity Quick Review

## Short product summary
Solidity Quick Review is an automated Solidity risk-triage product for snippet and verified-contract analysis. It helps teams run fast screening, review structured findings, and decide what needs deeper manual audit. The product is not a formal audit platform and does not provide security certification.

For the HashKey Chain hackathon, we added a focused financial-contract review extension on top of the existing product while keeping Base support.

## Core use cases
- Solidity snippet review
- Verified contract review by address
- Structured findings with severity, evidence, and remediation direction
- Optional onchain proof/receipt flow for report artifact existence

## Supported networks
| Network | Status | Notes |
|---|---|---|
| Base Mainnet (8453) | Supported | Original product foundation |
| Base Sepolia (84532) | Supported | Staging/testing path |
| HashKey Testnet (133) | Supported (hackathon extension) | Featured financial-review demo workflow |
| HashKey Mainnet (177) | Partial | Receipt contract deployed and verified; UI default flow is still testnet-first |

Receipt status by network:
- HashKey testnet: active demo receipt flow
- HashKey mainnet: contract deployed and verified (`0x02d42a47cd33f3feefc7cf31b8e29657ed825ab8`)
- Base: support remains part of product architecture and story

## HashKey Chain hackathon extension
This extension adds a HashKey-focused financial risk-review workflow to Solidity Quick Review. It includes DeFi/PayFi-oriented report framing, audience-specific report views, and a lightweight ecosystem Risk Radar page.

Why this fits HashKey Chain: the extension focuses on practical financial-contract triage and integration-readiness signaling, instead of generic chain expansion.

## Key features
- Snippet and verified-address analysis
- DeFi / PayFi Review Mode (financial risk framing)
- Builder Report and Partner / Investor Report views
- Deterministic report hashing
- Optional receipt anchoring flow
- HashKey Ecosystem Risk Radar (curated entries)

## Demo flow
1. Open `https://solidity-scan.com`
2. Select `HashKey Testnet (133)`
3. Select `DeFi / PayFi Review Mode`
4. Analyze a verified contract address
5. Review financial sections and integration-readiness summary
6. Switch Builder / Partner report views
7. Mint receipt proof
8. Open Risk Radar detail entry

## Architecture overview
- Web app (Next.js): input, report, history, receipt UX
- API layer: analysis lifecycle, auth/ACL, report/receipt endpoints
- Analysis pipeline: source ingestion, static analysis, structure extraction, AI-assisted layer, report assembly
- Worker/queue execution for async analysis
- Receipt contract for onchain proof of report artifact existence

## Testing / validation
- `npm run build`
- `npm run typecheck`
- Integration tests: `tests/integration/hashkey-financial-mode.integration.test.ts`
- Unit tests: `tests/unit/report-financial-readiness.test.ts`
- Runtime verification scripts for deployment health (`npm run deploy:vps:verify`)

## Current limitations
- Not a replacement for manual smart contract audit
- No security guarantees or certification claims
- Risk Radar is curated MVP scope, not full ecosystem indexing
- HashKey mainnet analysis UX is not the default public demo path yet (UI selector remains Base Mainnet + HashKey Testnet)
- Some advanced multi-contract protocol flows still require manual interpretation of findings

## Additional docs
- HashKey hackathon explainer: `docs/hashkey-hackathon.md`
- HashKey integration parameters: `docs/hashkey-integration-params.md`
- Demo script: `docs/hashkey-demo-flow.md`

## Screenshots
![Homepage](docs/assets/hashkey/homepage-hashkey-extension.png)

![Receipt Proof Confirmation](docs/assets/hashkey/receipt-proof-confirmation.png)

![Risk Radar](docs/assets/hashkey/risk-radar-views.png)
