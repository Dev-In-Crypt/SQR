# HashKey integration parameters

Status: hackathon MVP verification snapshot.

## Verified now

- Testnet RPC: `https://testnet.hsk.xyz`
- Testnet `eth_chainId`: `0x85` (`133`)
- Testnet explorer base: `https://testnet-explorer.hsk.xyz`
- Testnet explorer API: `https://testnet-explorer.hsk.xyz/api`
- Mainnet RPC candidate: `https://mainnet.hsk.xyz`
- Mainnet `eth_chainId` from live RPC: `0xb1` (`177`)
- Mainnet explorer base: `https://hashkey.blockscout.com`
- Mainnet explorer API: `https://hashkey.blockscout.com/api`

## Mainnet ambiguity handling

- `https://hsk-mainnet.hashkey.com` did not resolve during implementation checks.
- Mainnet support remains feature-gated with `HASHKEY_MAINNET_ENABLED=false` by default.
- Mainnet receipt routing should only be enabled after final runtime and wallet compatibility checks.

## URL patterns

- Transaction: `{explorerBase}/tx/{txHash}`
- Address: `{explorerBase}/address/{address}`
- Contract: `{explorerBase}/address/{address}`

## Verified source retrieval

- Blockscout-compatible API method:
  - `GET {explorerApi}/?module=contract&action=getsourcecode&address={address}`
- ABI retrieval method:
  - same endpoint response includes `ABI`

## Rate limit notes

- No mandatory API key required for the current Blockscout endpoints used in MVP.
- App handles source-provider retry for timeout/429/503 conditions.

## Receipt target policy

- MVP default receipt chain: HashKey testnet (`RECEIPT_CHAIN_ID=133`)
- Mainnet receipt target remains opt-in until final chain config and deployment evidence are confirmed.

## Testnet deployment evidence (current run)

- Deployer wallet: `0xB49f03D4c6c3b7E1cdB4e2aE90e5D2bB153BCeC0`
- ReceiptRegistry deploy tx: `0x5e7e1aa184482dd69807ac5a0fb0694f6151238e17cd845afec800594cd14323`
- ReceiptRegistry address (HashKey testnet): `0x02d42a47cd33f3feefc7cf31b8e29657ed825ab8`
- End-to-end demo mint tx: `0xd90d588ee47666d6a262816c7810054a9fa4eab67fd5e0d8641c18fe26057402`
- Explorer verification status: `Pass - Verified` (Blockscout GUID `02d42a47cd33f3feefc7cf31b8e29657ed825ab869da6b48`)

## Mainnet deployment evidence (current run)

- Deployer wallet: `0xB49f03D4c6c3b7E1cdB4e2aE90e5D2bB153BCeC0`
- ReceiptRegistry deploy tx: `0xb7d59637011df5b1e60b95a13c32f0608e1f3363e97a89c9e9f8ab07659f8b94`
- ReceiptRegistry address (HashKey mainnet): `0x02d42a47cd33f3feefc7cf31b8e29657ed825ab8`
- Explorer verification status: `Pass - Verified` (Blockscout GUID `02d42a47cd33f3feefc7cf31b8e29657ed825ab869da8d3a`)

## Ops scripts

- Faucet claim helper (requires valid reCAPTCHA token): `npm run hashkey:faucet:claim`
- Receipt deployment (HashKey testnet): `npm run hashkey:receipt:deploy`
- End-to-end API+onchain demo flow: `npm run hashkey:demo`
