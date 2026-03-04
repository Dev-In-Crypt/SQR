# Test Matrix

| Feature | Unit Tests | Integration Tests | E2E Tests | Contract Tests |
| --- | --- | --- | --- | --- |
| Paste-code analysis lifecycle | N/A | `tests/integration/analysis-acl.integration.test.ts` | `tests/e2e/smoke.no-wallet.spec.ts` | N/A |
| Deterministic report hash | `tests/unit/canonical-json.test.ts` | `tests/integration/analysis-acl.integration.test.ts`, `tests/integration/receipt.integration.test.ts` | `tests/e2e/smoke.receipt.viem.spec.ts` | N/A |
| Private-by-default ACL | `tests/unit/acl.test.ts` | `tests/integration/analysis-acl.integration.test.ts` | `tests/e2e/smoke.no-wallet.spec.ts` | N/A |
| Visibility publish/unpublish | N/A | `tests/integration/analysis-acl.integration.test.ts` | `tests/e2e/smoke.no-wallet.spec.ts` | N/A |
| Share token generation/rotation | N/A | `tests/integration/analysis-acl.integration.test.ts` | `tests/e2e/smoke.no-wallet.spec.ts` | N/A |
| Wallet auth nonce replay protection | N/A | `tests/integration/auth-history-rate-limit.integration.test.ts` | N/A | N/A |
| Wallet-scoped report history | N/A | `tests/integration/auth-history-rate-limit.integration.test.ts` | N/A | N/A |
| Rate limiting (IP/wallet/mixed) | N/A | `tests/integration/auth-history-rate-limit.integration.test.ts` | N/A | N/A |
| Receipt prepare/confirm correctness | N/A | `tests/integration/receipt.integration.test.ts` | `tests/e2e/smoke.receipt.viem.spec.ts` | `contracts/test/ReceiptRegistry.t.sol` |
| Receipt duplicate determinism | N/A | `tests/integration/receipt.integration.test.ts` | N/A | `contracts/test/ReceiptRegistry.t.sol`, `contracts/test/ReceiptRegistry.fuzz.t.sol` |
| Analyzer-version binding for same hash | N/A | N/A | N/A | `contracts/test/ReceiptRegistry.t.sol`, `contracts/test/ReceiptRegistry.fuzz.t.sol`, `contracts/test/ReceiptRegistry.invariant.t.sol` |
| Zero-address policy (code-only reports) | N/A | N/A | N/A | `contracts/test/ReceiptRegistry.t.sol` |
| Receipt state immutability and uniqueness invariants | N/A | N/A | N/A | `contracts/test/ReceiptRegistry.invariant.t.sol` |
| Partial/failure handling without stuck processing | N/A | `tests/integration/failure-handling.integration.test.ts` | N/A | N/A |
