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

### Anchor the review onchain (optional)

Add a report-owner signing key and a Base RPC URL as **GitHub Secrets** and the
action mints a `ReceiptRegistry` receipt on Base — binding the report hash to your
owner address and analyzer version — so `/verify` shows it anchored. The key is
used only to sign the EIP-712 `MintAuthorization` and submit `mintWithSig`; it is
never logged.

```yaml
      - uses: Dev-In-Crypt/SQR/action@main
        with:
          contract-address: "0xYourVerifiedBaseContract"
          mint-key: ${{ secrets.SQR_MINT_KEY }}   # report-owner private key
          rpc-url: ${{ secrets.BASE_RPC_URL }}    # e.g. a Base mainnet RPC
          # registry-address defaults to the Base mainnet ReceiptRegistry
```

The mint is idempotent — if the exact report hash is already anchored, the action
reports it and does not re-submit. Minting requires the owner key to hold enough
ETH on the target chain for gas.

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
| `mint-key` | — | Report-owner private key (a Secret) to anchor the report hash onchain. Empty = skip. Never logged. |
| `rpc-url` | — | Base RPC URL for the mint transaction (required when `mint-key` is set). |
| `registry-address` | Base mainnet registry | `ReceiptRegistry` contract to anchor into. |

## Outputs

| Output | Description |
|---|---|
| `status` | Terminal status: `COMPLETED` \| `DONE_WITH_WARNINGS` \| `PARTIAL` \| `FAILED`. |
| `report-id` | Generated report id. |
| `report-hash` | Deterministic keccak256 report hash — the provenance anchor. |
| `top-severity` | Highest finding severity. |
| `verify-url` | Public URL to verify the report hash onchain. |
| `anchored` | `true` when a Base receipt was anchored onchain. |
| `receipt-id` | Onchain receipt id (when minted). |
| `receipt-tx` | Mint transaction hash (when newly minted). |

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
- **Onchain anchoring** is opt-in (see above): provide `mint-key` + `rpc-url` and the
  action mints a Base receipt so `/verify` shows it anchored. Without them it emits the
  deterministic hash + public verify link only.
