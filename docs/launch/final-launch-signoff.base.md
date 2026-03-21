# Final launch sign-off (Base release)

## Release identity

- Baseline SHA: `5b8e13a02bcb377aa69319908f39b29c449e78b1` (`PROVEN_FROM_GIT`)
- Release tag at SHA: none (`PROVEN_FROM_GIT`)
- Release candidate branch: `feat/polkadot-hub-mainnet-support` (`PROVEN_FROM_GIT`)
- Draft prepared at (UTC): `2026-03-21T21:49:00Z` (`PROVEN_FROM_CLI`)
- Scope: Base-only launch assessment

## Freeze evidence

- `git rev-parse HEAD` -> `5b8e13a02bcb377aa69319908f39b29c449e78b1` (`PROVEN_FROM_GIT`)
- `git tag --points-at HEAD` -> no tags (`PROVEN_FROM_GIT`)
- `git status --porcelain --branch` -> branch tracks `origin/feat/polkadot-hub-mainnet-support`; working tree is not clean because these untracked files exist (`PROVEN_FROM_GIT`):
  - `backup-pre-polkadot-hub-integration.bundle`
  - `benchmark2-slither.json`
  - `output/benchmark2-combined-report.json`
  - `output/benchmark2-combined-report.md`

## Automated validation evidence

- `npm run lint` -> `PASS` (`PROVEN_FROM_CLI`)
- `npm run typecheck` -> `PASS` (`PROVEN_FROM_CLI`)
- `npm run test:unit` -> `PASS` (`71/71` tests, `18/18` files) (`PROVEN_FROM_CLI`)
- `npm run build` -> `PASS` (Next.js production build completed successfully) (`PROVEN_FROM_CLI`)

## Live production evidence

- `https://solidity-scan.com` renders successfully (`PROVEN_FROM_WEB`).
- `https://solidity-scan.com/api/v1/health` returns `{"ok":true,"appEnv":"production","queue":{"enabled":true,"mode":"redis","workerCount":1,"ready":true}}` (`PROVEN_FROM_WEB`).
- `https://solidity-scan.com/api/v1/config` returns production receipt chain `8453` (`Base`) and Base mainnet RPC wiring (`PROVEN_FROM_WEB`).
- `https://solidity-scan.com/api/v1/session` returns a valid session payload (`PROVEN_FROM_WEB`).
- `https://solidity-scan.com/privacy` and `https://solidity-scan.com/terms` both render (`PROVEN_FROM_WEB`).

## Receipt evidence status (Base)

- Production Base ReceiptRegistry evidence exists in `docs/launch/receiptregistry-deployment-evidence.md:1`.
- Existing production evidence records Base mainnet `chainId=8453`, contract `0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B`, deploy tx `0x341a4a9987b2c13ef065f24951d050a83c6ae9b0199c399799ef551b7138cabf`, code-at-address `PASS`, and Sourcify full match.
- Staging ReceiptRegistry evidence for Base Sepolia is still missing from the launch package.

## Approval table

| Area | Status | Evidence | Owner | Date |
| --- | --- | --- | --- | --- |
| Release freeze baseline pinned | BLOCKED | Current SHA known, but no release tag at `HEAD` and working tree is not clean | TODO | TODO |
| Runtime matrix complete (staging + production) | PARTIAL | Production runtime is publicly verified; staging values still missing in `docs/launch/runtime-matrix.base.md:1` | TODO | TODO |
| Queue mode decision documented | PASS | Live production confirms `redis` mode with one ready worker via `/api/v1/health` | TODO | TODO |
| ReceiptRegistry staging evidence complete | BLOCKED | No Base Sepolia deployment evidence file in launch package | TODO | TODO |
| ReceiptRegistry production evidence complete | PASS | `docs/launch/receiptregistry-deployment-evidence.md:1` plus live `/api/v1/config` confirms Base mainnet receipt network is active | TODO | TODO |
| Staging full smoke complete | BLOCKED | No immutable evidence links attached | TODO | TODO |
| Production read-only smoke complete | PASS | Home, `/api/v1/health`, `/api/v1/config`, `/api/v1/session`, `/privacy`, and `/terms` are reachable on live site | TODO | TODO |
| Must-fix list empty | BLOCKED | No explicit must-fix register or closure evidence attached | TODO | TODO |

## Blocking items to close before audit-grade sign-off

- Clean the release candidate tree and pin a release tag at the final baseline SHA if you want a complete formal launch packet for this deployment.
- Provide staging runtime values from the deployment platform or secret manager.
- Provide masked production proof for hidden values only (`PRIVATE_LINK_SECRET`, DB/Redis secrets) if you want the launch packet to be fully evidence-backed.
- Add Base Sepolia ReceiptRegistry deployment evidence, or explicitly decide staging will not use receipt minting.
- Attach immutable links for staging full smoke and archive production smoke artifacts if you want audit-grade documentation.
- Provide must-fix closure record showing open count is zero.
- Add named approvers for Engineering, Security, and Product/Operations.

## Current status

`PRODUCTION STATUS: LIVE AND RESPONDING`

`FORMAL LAUNCH PACKET STATUS: INCOMPLETE`

Reason:
- The Base production deployment is verifiably live and healthy from public endpoints, but the formal release evidence package is still incomplete because freeze artifacts, staging evidence, hidden-secret proof, owner sign-off, and archived smoke links are missing.
