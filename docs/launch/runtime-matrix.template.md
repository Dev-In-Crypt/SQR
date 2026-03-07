# 2. Runtime matrix template (filled draft, provable-only)

Baseline metadata:
- Baseline SHA: `d190c3829a19bae5317d0ccfb2fb2e59f2f6e51a`
- Release tag: `v0.2.3`
- Prepared by: TODO
- Prepared at (UTC): TODO

Provenance markers:
- `PROVEN_FROM_REPO`
- `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH`
- `REQUIRES_USER_RUNTIME_SOURCE`
- `UNVERIFIED`
- `REQUIRES_DEPLOY_EVIDENCE`

## Repo-proven facts

| Fact | Evidence |
| --- | --- |
| `APP_ENV` accepted values: `local`, `staging`, `production` | `lib/config.ts:5` |
| Receipt required chain mapping: staging -> `84532`, production -> `8453` | `lib/base-network.ts:70-76` |
| Receipt RPC fallback order: chain-specific RPC then `BASE_RPC_URL` | `lib/base-network.ts:60`, `lib/base-network.ts:64` |
| Address analysis allows only `BASE_CHAIN_ID` and `STAGING_BASE_CHAIN_ID`; production gate requires mainnet chain | `lib/source/index.ts:169-174` |
| Wallet network config API is derived from required receipt network | `app/api/v1/config/route.ts:11-19` |
| Receipt runtime requires configured contract address and validates address format | `lib/receipt.ts:36-42` |

## Local-only observations (from `.env`, not launch proof)

Observed at: TODO

| Field | Local observation | Provenance | Launch usability |
| --- | --- | --- | --- |
| APP_ENV | `staging` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| NODE_ENV | `development` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| DATABASE_URL | `SET` (masked, localhost) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| REDIS_URL | `SET` (`redis://localhost:6379`) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| BASE_CHAIN_ID | `8453` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| STAGING_BASE_CHAIN_ID | `84532` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| BASE_RPC_URL | `SET` (masked provider URL) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| BASE_MAINNET_RPC_URL | `MISSING` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| BASE_SEPOLIA_RPC_URL | `MISSING` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| RECEIPT_CONTRACT_ADDRESS | `SET` (`0x8F37c06766882E60c8d2A406baEA45c57f826789`) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `REQUIRES_DEPLOY_EVIDENCE` |
| BASESCAN_API_KEY | `SET` (masked) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| OPENAI_API_KEY | `SET` (masked) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| PRIVATE_LINK_SECRET | `SET` (masked, length check required) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |

## Launch runtime matrix (staging vs production)

| Field | Staging value | Production value | Required? | Conditional rule | Source in codebase | Validation status | Owner | Last verified at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP_ENV | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Expected: `staging` (`PROVEN_FROM_REPO`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Expected: `production` (`PROVEN_FROM_REPO`) | Yes | Must map to target environment | `lib/config.ts:5`, `lib/base-network.ts:70-76` | `UNVERIFIED` | TODO | TODO |
| NODE_ENV | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Expected launch value: `production` | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Expected launch value: `production` | Yes | Deployed env should run with production node mode | `lib/config.ts:4`, `lib/config.ts:48` | `UNVERIFIED` | TODO | TODO |
| DATABASE_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes | Must point to correct environment database | `lib/config.ts:6`, `lib/db.ts` | `UNVERIFIED` | TODO | TODO |
| NEXT_PUBLIC_APP_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes | Must match externally reachable app URL | `lib/config.ts:29` | `UNVERIFIED` | TODO | TODO |
| REDIS_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Conditional | Required only if queue mode is `redis + worker` | `lib/config.ts:7`, `lib/queue.ts:13`, `scripts/worker.ts:8-11` | `UNVERIFIED` | TODO | TODO |
| BASE_CHAIN_ID | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo expectation for mainnet gate: `8453` | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo expectation for mainnet gate: `8453` | Yes | Production address-analysis path assumes mainnet chain id | `lib/config.ts:8`, `lib/source/index.ts:169-174` | `UNVERIFIED` | TODO | TODO |
| STAGING_BASE_CHAIN_ID | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo expectation: `84532` | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes | Staging chain allowlist value | `lib/config.ts:9`, `lib/source/index.ts:169` | `UNVERIFIED` | TODO | TODO |
| BASE_MAINNET_RPC_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes (prod), Rec (staging) | Preferred mainnet RPC before fallback | `lib/config.ts:11`, `lib/base-network.ts:60` | `UNVERIFIED` | TODO | TODO |
| BASE_SEPOLIA_RPC_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes (staging), Rec (prod) | Preferred sepolia RPC before fallback | `lib/config.ts:12`, `lib/base-network.ts:64` | `UNVERIFIED` | TODO | TODO |
| BASE_RPC_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Conditional | Fallback only; must not accidentally point to wrong network | `lib/config.ts:10`, `lib/base-network.ts:60`, `lib/base-network.ts:64` | `UNVERIFIED` | TODO | TODO |
| RECEIPT_CONTRACT_ADDRESS | TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`) | TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`) | Yes | Must be deployed ReceiptRegistry on target chain | `lib/config.ts:30`, `lib/receipt.ts:36-42` | `UNVERIFIED` | TODO | TODO |
| PRIVATE_LINK_SECRET | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Yes | Must be non-default, high entropy secret | `lib/config.ts:33`, `lib/crypto.ts` | `UNVERIFIED` | TODO | TODO |
| SESSION_COOKIE_NAME | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No (default exists) | Override only if security policy requires it | `lib/config.ts:31`, `lib/session.ts` | `UNVERIFIED` | TODO | TODO |
| SESSION_DAYS | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No (default exists) | Override only by session policy | `lib/config.ts:32`, `lib/session.ts` | `UNVERIFIED` | TODO | TODO |
| BASESCAN_API_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | No (default exists) | Override only if provider endpoint differs | `lib/config.ts:13` | `UNVERIFIED` | TODO | TODO |
| BASESCAN_API_KEY | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | Conditional | Required for reliable verified-source fetch | `lib/config.ts:14`, `lib/source/fetch-verified.ts` | `UNVERIFIED` | TODO | TODO |
| SOURCIFY_API_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | No (default exists) | Optional fallback source endpoint | `lib/config.ts:15-18`, `lib/source/fetch-verified.ts` | `UNVERIFIED` | TODO | TODO |
| OPENAI_API_KEY | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No | Optional; empty key is allowed by runtime | `lib/config.ts:23`, `lib/llm.ts` | `UNVERIFIED` | TODO | TODO |
| OPENAI_BASE_URL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | No (default exists) | Must be valid URL if overridden | `lib/config.ts:24` | `UNVERIFIED` | TODO | TODO |
| OPENAI_HTTP_REFERER | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No | Optional attribution header | `lib/config.ts:25` | `UNVERIFIED` | TODO | TODO |
| OPENAI_APP_NAME | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No | Optional attribution header | `lib/config.ts:26` | `UNVERIFIED` | TODO | TODO |
| OPENAI_MODEL | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | No (default exists) | Optional model override | `lib/config.ts:27` | `UNVERIFIED` | TODO | TODO |
| OPENAI_TEMPERATURE | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default exists | No (default exists) | Optional LLM tuning | `lib/config.ts:28` | `UNVERIFIED` | TODO | TODO |
| ENABLE_SLITHER | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default: `true` | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`). Repo default: `true` | No (default exists) | Scanner behavior flag | `lib/config.ts:21`, `lib/config.ts:49` | `UNVERIFIED` | TODO | TODO |
| SOLC_PATH | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`) | No | Optional local compiler binary path | `lib/config.ts:22`, `lib/scanner.ts` | `UNVERIFIED` | TODO | TODO |

## Missing user-provided launch data

- TODO: Full staging runtime values from staging secret manager.
- TODO: Full production runtime values from production secret manager.
- TODO: Runtime screenshots or command evidence showing active values in deployed environments.
- TODO: Chain/RPC confirmation evidence for staging and production.
