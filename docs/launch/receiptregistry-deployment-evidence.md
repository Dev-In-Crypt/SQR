# ReceiptRegistry deployment evidence (production)

Baseline metadata:
- Baseline SHA: `f629c5a5ecdb5f173fc59c08e38d8786fff5925a`
- Prepared at (UTC): `2026-03-12T10:40:24Z`
- Scope: production Base deployment evidence

Provenance markers:
- `PROVEN_FROM_REPO`
- `PROVEN_FROM_RPC`
- `PROVEN_FROM_SOURCIFY`
- `USER_PROVIDED`

## Repo-proven compatibility facts

- Contract source exists: `contracts/ReceiptRegistry.sol` (`PROVEN_FROM_REPO`)
- App runtime ABI anchor exists: `lib/receipt-shared.ts` (`PROVEN_FROM_REPO`)
- Runtime verification path exists: `lib/receipt.ts` (`PROVEN_FROM_REPO`)
- EIP-712 name expected by app: `ReceiptRegistry` (`PROVEN_FROM_REPO`)
- EIP-712 version expected by app: `0.2.0` (`PROVEN_FROM_REPO`)
- ABI expectations used by app (`PROVEN_FROM_REPO`):
  - `mintWithSig(bytes32,address,bytes32,address,uint256,uint256,bytes)`
  - `nonces(address)`
  - `event ReceiptMinted(...)`

## Production evidence block

- Environment: `production`
- chainId: `8453` (`PROVEN_FROM_RPC`, `eth_chainId=0x2105`)
- contract address: `0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B` (`USER_PROVIDED`, `PROVEN_FROM_RPC`)
- deploy tx hash: `0x341a4a9987b2c13ef065f24951d050a83c6ae9b0199c399799ef551b7138cabf` (`PROVEN_FROM_RPC`)
- deploy block: `43054220` (`0x290f48c`, `PROVEN_FROM_RPC`)
- deploy timestamp (UTC): `2026-03-07T15:36:27Z` (`PROVEN_FROM_RPC`)
- explorer tx link: `https://basescan.org/tx/0x341a4a9987b2c13ef065f24951d050a83c6ae9b0199c399799ef551b7138cabf`
- explorer address link: `https://basescan.org/address/0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B#code`
- code-at-address check: `PASS` (`PROVEN_FROM_RPC`)
  - `eth_getCode(0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B, latest)` returns non-empty bytecode (`0x60806040...`)
- verification status: `source-verified (Sourcify full_match)` (`PROVEN_FROM_SOURCIFY`)
  - metadata: `https://repo.sourcify.dev/contracts/full_match/8453/0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B/metadata.json`

## Functional checks (Base mainnet RPC)

- `nextReceiptId()` call (`0xcf89bb9e`) -> `0x...0001` (value `1`) (`PROVEN_FROM_RPC`)
- `nonces(0x0000000000000000000000000000000000000000)` call (`0x7ecebe00...`) -> `0x...0000` (value `0`) (`PROVEN_FROM_RPC`)

These read calls confirm the deployed address responds with the expected public interface.

## Compatibility note

- Onchain bytecode and Sourcify metadata match `contracts/ReceiptRegistry.sol` (`PROVEN_FROM_SOURCIFY`, `PROVEN_FROM_REPO`).
- App-required functions/events are present in verified metadata ABI (`PROVEN_FROM_SOURCIFY`).
