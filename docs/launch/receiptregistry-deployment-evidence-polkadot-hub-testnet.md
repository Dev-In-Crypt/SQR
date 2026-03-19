# ReceiptRegistry deployment evidence (Polkadot Hub testnet)

Baseline metadata:
- Baseline SHA: `0a4d8f1d4b524d0c704e2f28504cdb30175ae76c`
- Prepared at (UTC): `2026-03-17T17:36:14Z`
- Scope: Polkadot Hub testnet ReceiptRegistry deployment evidence

Provenance markers:
- `PROVEN_FROM_REPO`
- `PROVEN_FROM_RPC`
- `PROVEN_FROM_BLOCKSCOUT`
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

## Testnet evidence block

- Network: `Polkadot Hub Testnet`
- chainId: `420420417` (`PROVEN_FROM_RPC`, `eth_chainId=0x190f1b41`)
- contract address: `0x7FC4e0Aa40488588f66eB135C7326068F37cEb80` (`USER_PROVIDED`, `PROVEN_FROM_RPC`)
- deploy tx hash: `0x2f6656f1bb998f72a146dd2acbd9e101840fd6cddfcc9e1ac354c28f2b5c3a87` (`USER_PROVIDED`, `PROVEN_FROM_RPC`)
- tx receipt status: `0x1` (`PROVEN_FROM_RPC`)
- deploy block: `6499208` (`0x632b88`, `PROVEN_FROM_RPC`)
- deploy timestamp (UTC): `2026-03-17T09:13:12Z` (`PROVEN_FROM_RPC`)
- explorer tx link: `https://blockscout-testnet.polkadot.io/tx/0x2f6656f1bb998f72a146dd2acbd9e101840fd6cddfcc9e1ac354c28f2b5c3a87`
- explorer address link: `https://blockscout-testnet.polkadot.io/address/0x7FC4e0Aa40488588f66eB135C7326068F37cEb80`
- code-at-address check: `PASS` (`PROVEN_FROM_RPC`)
  - `eth_getCode(0x7FC4e0Aa40488588f66eB135C7326068F37cEb80, latest)` returns non-empty bytecode (`0x60806040...`)
- Blockscout address metadata check: `PASS` (`PROVEN_FROM_BLOCKSCOUT`)
  - `is_contract=true`
  - `creation_status=success`
  - `creation_transaction_hash=0x2f6656f1bb998f72a146dd2acbd9e101840fd6cddfcc9e1ac354c28f2b5c3a87`
- verification status: `unverified on Blockscout (is_verified=false)` (`PROVEN_FROM_BLOCKSCOUT`)

## Functional checks (Polkadot Hub testnet RPC)

- `nextReceiptId()` call (`0xcf89bb9e`) -> `0x...0002` (value `2`) (`PROVEN_FROM_RPC`)
- `nonces(0x0000000000000000000000000000000000000000)` call (`0x7ecebe00...`) -> `0x...0000` (value `0`) (`PROVEN_FROM_RPC`)

These read calls confirm the deployed address responds with expected ReceiptRegistry read methods.

## Runtime wiring note

- Configure runtime:
  - `FEATURE_POLKADOT_HUB_ENABLED=true`
  - `FEATURE_RECEIPT_POLKADOT_HUB_ENABLED=true`
  - `RECEIPT_DEFAULT_CHAIN_ID=420420417`
  - `POLKADOT_HUB_TESTNET_RECEIPT_CONTRACT_ADDRESS=0x7FC4e0Aa40488588f66eB135C7326068F37cEb80`
- `prepare` path resolves `verifyingContract` through configured chain contract mapping in `lib/receipt.ts`.
- `confirm` path accepts logs only from the configured contract (`readMintedEventFromTx` checks `log.address === expectedContract`).
