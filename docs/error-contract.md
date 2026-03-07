# Error Contract (API/UI)

This document is the canonical mapping for user-visible error handling in paste analysis and receipt flows.

## Mapping

| code | http | user-facing message | retriable |
| --- | ---: | --- | --- |
| `EMPTY_CODE` | 400 | Code cannot be empty. | No |
| `INVALID_SOLIDITY_INPUT` | 400 | Input does not look like Solidity source code. | No |
| `INCOMPLETE_SNIPPET` | 400 | Incomplete snippet, please paste a full contract. | No |
| `INVALID_PRAGMA` | 400 | Malformed pragma. Use a valid Solidity pragma declaration. | No |
| `CONTROL_CHARS_NOT_ALLOWED` | 400 | Input contains unsupported control characters. | No |
| `LINE_LIMIT_EXCEEDED` | 400 | Paste mode supports up to 200 lines. | No |
| `OWNER_MISMATCH` | 403 | Connected wallet does not match the report owner. Switch wallet and retry. | No |
| `INVALID_SIGNATURE` | 400 | Mint authorization signature is invalid. | No |
| `TX_NOT_FOUND_REQUIRED_NETWORK` | 400 | Transaction was not found on the required network. | Depends (after wrong tx hash fix) |
| `MINT_EVENT_NOT_FOUND` | 400 | ReceiptMinted event was not found in the transaction. | Depends |
| `HASH_MISMATCH` | 400 | Transaction report hash does not match this report. | No |
| `RECEIPT_CHAIN_UNAVAILABLE` | 503 | Receipt network is temporarily unavailable. Please try again. | Yes |

## Rules
- User mistakes must not surface as `500`.
- `OWNER_MISMATCH` uses HTTP `403` in both `prepare` and `confirm` mismatch paths.
- Paste-mode invalid input is rejected at API boundary (4xx), not queued.
- UI should resolve message by `error.code` first, fallback to API `error.message`.
