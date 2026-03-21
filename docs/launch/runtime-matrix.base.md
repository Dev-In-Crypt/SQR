# Runtime matrix (Base release)

Baseline metadata:
- Baseline SHA: `5b8e13a02bcb377aa69319908f39b29c449e78b1` (`PROVEN_FROM_GIT`)
- Release tag at SHA: none (`PROVEN_FROM_GIT`)
- Prepared at (UTC): `2026-03-21T21:49:00Z` (`PROVEN_FROM_CLI`)
- Scope: Base-only launch draft (`staging=Base Sepolia`, `production=Base mainnet`)

Provenance markers:
- `PROVEN_FROM_REPO`
- `PROVEN_FROM_GIT`
- `PROVEN_FROM_CLI`
- `PROVEN_FROM_WEB`
- `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH`
- `REQUIRES_USER_RUNTIME_SOURCE`
- `UNVERIFIED`

## Repo-proven facts

| Fact | Evidence |
| --- | --- |
| `APP_ENV` accepted values: `local`, `staging`, `production` | `lib/config.ts:5` |
| `NODE_ENV` accepted values: `development`, `test`, `production` | `lib/config.ts:4` |
| Base mainnet chain id is `8453` | `lib/base-network.ts:4` |
| Base Sepolia chain id is `84532` | `lib/base-network.ts:5` |
| Staging receipt default is Base Sepolia when `APP_ENV=staging` | `lib/base-network.ts:140` |
| Production receipt default is Base mainnet when `APP_ENV=production` | `lib/base-network.ts:144` |
| Base mainnet RPC resolution prefers `BASE_MAINNET_RPC_URL`, then `BASE_RPC_URL` | `lib/base-network.ts:116` |
| Base Sepolia RPC resolution prefers `BASE_SEPOLIA_RPC_URL`, then `BASE_RPC_URL` | `lib/base-network.ts:120` |
| Production requires `RECEIPT_CONTRACT_ADDRESS`, Base mainnet RPC, and non-default `PRIVATE_LINK_SECRET` | `lib/config.ts:74` |
| Base receipt contract address is shared for Base mainnet and Base Sepolia config slots | `lib/base-network.ts:170` |
| Queue mode is `inline` when `REDIS_URL` is unset, else BullMQ-backed Redis | `lib/queue.ts:13` |

## Auto-collected local observations (not launch proof)

These values come from local CLI/build context and do not prove deployed runtime configuration.

| Field | Local observation | Provenance | Launch usability |
| --- | --- | --- | --- |
| `APP_ENV` | `staging` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `NODE_ENV` | `development` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `DATABASE_URL` | `SET` (masked, localhost) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `REDIS_URL` | `SET` (`redis://localhost:6379`) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `BASE_CHAIN_ID` | `8453` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `STAGING_BASE_CHAIN_ID` | `84532` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `BASE_RPC_URL` | `SET` (masked provider URL) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `BASE_MAINNET_RPC_URL` | `MISSING` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `BASE_SEPOLIA_RPC_URL` | `MISSING` | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |
| `RECEIPT_CONTRACT_ADDRESS` | `SET` (`0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B`) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `REQUIRES_USER_RUNTIME_SOURCE` |
| `PRIVATE_LINK_SECRET` | `SET` (masked, length not independently archived) | `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH` | `UNVERIFIED` |

## Verified live production observations

These values were fetched from the live service at `https://solidity-scan.com` and are stronger than local-only observations, but still do not replace secret-manager evidence for hidden values.

| Field | Verified live production value | Provenance | Evidence |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://solidity-scan.com` | `PROVEN_FROM_WEB` | public site responds and renders home page |
| `APP_ENV` | `production` | `PROVEN_FROM_WEB` | `/api/v1/health` response |
| Queue mode | `redis` | `PROVEN_FROM_WEB` | `/api/v1/health` response |
| Queue readiness | `ready=true`, `workerCount=1` | `PROVEN_FROM_WEB` | `/api/v1/health` response |
| Analysis default chain | `8453` | `PROVEN_FROM_WEB` | `/api/v1/config` response |
| Receipt required chain | `8453` (`Base`) | `PROVEN_FROM_WEB` | `/api/v1/config` response |
| Base mainnet RPC URL | `https://base-mainnet.infura.io/v3/a9ca16c4f47441bab172d9910c9b34f7` | `PROVEN_FROM_WEB` | `/api/v1/config` response |
| Session API reachability | `PASS` | `PROVEN_FROM_WEB` | `/api/v1/session` returned a session id |
| Static policy pages reachability | `PASS` | `PROVEN_FROM_WEB` | `/privacy` and `/terms` rendered successfully |

## Base launch runtime matrix

| Field | Staging value | Production value | Required? | Validation status | Evidence / note |
| --- | --- | --- | --- | --- | --- |
| `APP_ENV` | expected `staging` | expected `production` | Yes | `PARTIAL` | Production verified from `/api/v1/health`; staging still needs platform proof |
| `NODE_ENV` | expected `production` | expected `production` | Yes | `UNVERIFIED` | Need platform env export |
| `DATABASE_URL` | TODO | TODO | Yes | `UNVERIFIED` | Need secret manager values or masked proof |
| `NEXT_PUBLIC_APP_URL` | TODO | `https://solidity-scan.com` | Yes | `PARTIAL` | Production verified from public site; staging still needs platform proof |
| `REDIS_URL` | TODO | set (exact value hidden) | Conditional | `PARTIAL` | Production queue is live in `redis` mode with one ready worker |
| `BASE_CHAIN_ID` | expected `8453` | expected `8453` | Yes | `UNVERIFIED` | Repo default in `lib/config.ts:11` |
| `STAGING_BASE_CHAIN_ID` | expected `84532` | optional/unused | Yes | `UNVERIFIED` | Repo default in `lib/config.ts:12` |
| `BASE_MAINNET_RPC_URL` | recommended | `https://base-mainnet.infura.io/v3/a9ca16c4f47441bab172d9910c9b34f7` | Recommended/Yes | `PARTIAL` | Verified from `/api/v1/config` |
| `BASE_SEPOLIA_RPC_URL` | required unless `BASE_RPC_URL` supplied | recommended | Yes/Recommended | `UNVERIFIED` | Need runtime proof |
| `BASE_RPC_URL` | optional fallback | optional fallback | Conditional | `UNVERIFIED` | Must not point to wrong network |
| `RECEIPT_CONTRACT_ADDRESS` | TODO | `0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B` | Yes | `PARTIAL` | Production deploy evidence exists in `docs/launch/receiptregistry-deployment-evidence.md:28`; public config confirms Base mainnet receipt flow is active |
| `PRIVATE_LINK_SECRET` | TODO | TODO | Yes | `UNVERIFIED` | Need non-default secret proof |
| `SESSION_COOKIE_NAME` | default `sqr_session` unless overridden | default `sqr_session` unless overridden | No | `UNVERIFIED` | Need runtime proof only if overridden |
| `SESSION_DAYS` | default `30` unless overridden | default `30` unless overridden | No | `UNVERIFIED` | Need runtime proof only if overridden |
| `BASESCAN_API_URL` | default `https://api.etherscan.io/v2/api` unless overridden | default `https://api.etherscan.io/v2/api` unless overridden | No | `UNVERIFIED` | Need runtime proof only if overridden |
| `BASESCAN_API_KEY` | TODO | TODO | Conditional | `UNVERIFIED` | Needed for reliable verified source fetch |
| `OPENAI_API_KEY` | optional | optional | No | `UNVERIFIED` | Runtime allows empty |
| `OPENAI_GENERAL_MODEL` | default `gpt-4.1-mini` unless overridden | default `gpt-4.1-mini` unless overridden | No | `UNVERIFIED` | `lib/config.ts:121` |
| `OPENAI_AUDIT_MODEL` | falls back to general model | falls back to general model | No | `UNVERIFIED` | `lib/config.ts:122` |
| `ENABLE_STRUCTURED_AUDIT_CONTEXT` | default `true` unless overridden | default `true` unless overridden | No | `UNVERIFIED` | `lib/config.ts:54` |
| `ENABLE_SLITHER` | default `true` unless overridden | default `true` unless overridden | No | `UNVERIFIED` | `lib/config.ts:46` |
| `SOLC_PATH` | optional | optional | No | `UNVERIFIED` | Need proof only if overridden |

## Remaining evidence needed from runtime owners

- Staging env export or screenshot proving active `APP_ENV`, `NODE_ENV`, RPC settings, queue mode, and contract address.
- Production secret-manager export is still useful only for hidden values like database DSN, Redis DSN, and secret lengths; public production runtime behavior is already verified from live endpoints.
- Masked confirmation that `PRIVATE_LINK_SECRET` is non-default and at least 32 chars in production.
- Confirmation whether staging uses the same `RECEIPT_CONTRACT_ADDRESS` as production or a distinct Base Sepolia contract.
