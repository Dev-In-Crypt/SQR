# 4. ReceiptRegistry evidence template (filled draft, provable-only)

Baseline metadata:
- Baseline SHA: `d190c3829a19bae5317d0ccfb2fb2e59f2f6e51a` (`PROVEN_FROM_REPO`)
- Release tag: `v0.2.3` (`PROVEN_FROM_REPO`)

Provenance markers:
- `PROVEN_FROM_REPO`
- `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH`
- `UNVERIFIED`
- `REQUIRES_DEPLOY_EVIDENCE`

## Repo-proven compatibility facts

- Contract source exists: `contracts/ReceiptRegistry.sol` (`PROVEN_FROM_REPO`)
- App runtime ABI anchor exists: `lib/receipt-shared.ts` (`PROVEN_FROM_REPO`)
- Runtime verification path exists: `lib/receipt.ts` (`PROVEN_FROM_REPO`)
- EIP-712 name: `ReceiptRegistry` (`PROVEN_FROM_REPO`)
- EIP-712 version: `0.2.0` (`PROVEN_FROM_REPO`)
- ABI expectations used by app (`PROVEN_FROM_REPO`):
  - `mintWithSig(bytes32,address,bytes32,address,uint256,uint256,bytes)`
  - `nonces(address)`
  - `event ReceiptMinted(...)`

## Local-only observations (not launch proof)

- Local `.env` contract address observed:
  - `0x8F37c06766882E60c8d2A406baEA45c57f826789`
  - provenance: `LOCAL_ONLY_UNVERIFIED_FOR_LAUNCH`
  - launch status: `UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`

## Staging evidence block

- Environment: `staging`
- chainId: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`). Repo expected required receipt chain for staging: `84532` (`PROVEN_FROM_REPO`)
- contract address: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- deploy tx hash: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- explorer tx link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- explorer address link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- code-at-address check (pass/fail + command or explorer proof): TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- verification status (unverified / explorer-verified / source-verified): TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- ABI compatibility note:
  - Expected by app (`PROVEN_FROM_REPO`): `mintWithSig`, `nonces`, `ReceiptMinted`
  - Deployed address matches expected ABI: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- EIP-712 compatibility note:
  - name expected by app: `ReceiptRegistry` (`PROVEN_FROM_REPO`)
  - version expected by app: `0.2.0` (`PROVEN_FROM_REPO`)
  - chainId matches staging required network: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
  - verifyingContract matches configured address: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- reviewer: TODO
- reviewed at (UTC): TODO
- evidence links:
  - deployment log: TODO (`REQUIRES_DEPLOY_EVIDENCE`)
  - verification record: TODO (`REQUIRES_DEPLOY_EVIDENCE`)
  - smoke run showing prepare/confirm: TODO (`REQUIRES_DEPLOY_EVIDENCE`)

## Production evidence block

- Environment: `production`
- chainId: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`). Repo expected required receipt chain for production: `8453` (`PROVEN_FROM_REPO`)
- contract address: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- deploy tx hash: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- explorer tx link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- explorer address link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- code-at-address check (pass/fail + command or explorer proof): TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- verification status (unverified / explorer-verified / source-verified): TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- ABI compatibility note:
  - Expected by app (`PROVEN_FROM_REPO`): `mintWithSig`, `nonces`, `ReceiptMinted`
  - Deployed address matches expected ABI: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- EIP-712 compatibility note:
  - name expected by app: `ReceiptRegistry` (`PROVEN_FROM_REPO`)
  - version expected by app: `0.2.0` (`PROVEN_FROM_REPO`)
  - chainId matches production required network: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
  - verifyingContract matches configured address: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- reviewer: TODO
- reviewed at (UTC): TODO
- evidence links:
  - deployment log: TODO (`REQUIRES_DEPLOY_EVIDENCE`)
  - verification record: TODO (`REQUIRES_DEPLOY_EVIDENCE`)
  - production read-only smoke (no mint) proof: TODO (`REQUIRES_DEPLOY_EVIDENCE`)

## Evidence completion rule

- [ ] Both environment blocks are fully filled.
- [ ] chainId/address/tx hash are internally consistent.
- [ ] ABI and EIP-712 compatibility notes are marked compatible.
