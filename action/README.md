# SQR Solidity Review — GitHub Action

Run a provenance-anchored Solidity security review in CI. The action screens a
**deployed, verified Base contract** (by address) or a **single self-contained
Solidity file**, then posts the findings to your pull request together with a
**deterministic report hash** and a public **`/verify` link** that anyone can
check onchain — without seeing your report content.

It is a security gate that produces a *verifiable artifact*, not just a log line.

## Usage

```yaml
name: Solidity Review
on: [pull_request]

permissions:
  contents: read
  pull-requests: write   # required for the PR comment

jobs:
  sqr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Review a deployed, verified Base contract
      - uses: Dev-In-Crypt/SQR/action@main
        with:
          contract-address: "0xYourVerifiedBaseContract"
          fail-on: high        # fail the check on HIGH or CRITICAL findings

      # …or review a single self-contained .sol file (≤ 200 lines)
      - uses: Dev-In-Crypt/SQR/action@main
        with:
          file: contracts/Vault.sol
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `contract-address` | — | Deployed, **verified** Base contract to review. Mutually exclusive with `file`. |
| `file` | — | Path to one self-contained Solidity file (≤ 200 lines). Mutually exclusive with `contract-address`. |
| `chain-id` | `8453` | Base mainnet `8453` or Base Sepolia `84532`. |
| `fail-on` | `none` | Fail the check when top severity ≥ this level: `none \| low \| medium \| high \| critical`. |
| `comment` | `true` | Post/update a PR comment (needs `pull-requests: write`). |
| `api-url` | `https://solidity-scan.com` | SQR API base URL. |
| `github-token` | `${{ github.token }}` | Token used to post the PR comment. |

## Outputs

| Output | Description |
|---|---|
| `status` | Terminal status: `COMPLETED` \| `DONE_WITH_WARNINGS` \| `PARTIAL` \| `FAILED`. |
| `report-id` | Generated report id. |
| `report-hash` | Deterministic keccak256 report hash — the provenance anchor. |
| `top-severity` | Highest finding severity. |
| `verify-url` | Public URL to verify the report hash onchain. |

## What it proves

The `report-hash` is a deterministic keccak256 over the static findings plus input
identity (input type, chain, contract address, source hash) and the analyzer/ruleset
versions — reproducible offline, independent of AI output and wall-clock time. The
`/verify` endpoint reads the Base `ReceiptRegistry` directly, so a third party can
confirm a review of this exact form existed, without access to its contents.

## Notes & limits

- **Static-only.** This uses the free, wallet-free quick-scan path (Slither). It is
  screening, not a full audit, and does not include the AI-assisted layer.
- **Input shape.** The API takes one verified deployed address or one self-contained
  `.sol` file (≤ 200 lines). It does not yet accept a multi-file source upload — for
  a whole contract set, review the deployed **verified** address.
- **Rate limits** are per-IP (shared CI runners contend); reused identical inputs are
  cached and don't count.
- **Onchain anchoring** (minting a receipt from CI with a signing key) is the next
  increment; today the action emits the deterministic hash + public verify link.
