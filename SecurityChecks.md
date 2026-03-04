# Security Checks

## Purpose
Slither is the contract-level static security gate for this repository.
It complements tests by flagging risky Solidity patterns before merge.

## Foundry tests vs Slither
- `forge test`: validates expected behavior, invariants, and regressions.
- `slither`: searches for security anti-patterns and unsafe constructs.
- Both are required: passing tests do not guarantee absence of security issues.

## Gate policy
- Scope: `contracts/` production contracts.
- Excluded from findings: `contracts/test/`, `contracts/out/`, `scripts/`, `node_modules/`, `cache/`.
- CI fail threshold: `MEDIUM` and `HIGH` (`fail_on: medium`).
- `LOW` and `INFO` are non-blocking but should be reviewed.

## Compiler pin rationale
- `foundry.toml` pins `solc = "0.8.24"`.
- `contracts/ReceiptRegistry.sol` uses exact `pragma solidity 0.8.24;`.
- Exact pinning avoids compiler drift between machines/CI and removes `solc-version` detector noise from broad pragma ranges.

## Local commands
- Run local gate: `npm run security:slither`
- Run CI-equivalent gate: `npm run security:slither:ci`
- Start triage workflow (accepted findings only): `npm run security:slither:triage`

## Suppression rules
- Do not use inline source suppressions such as `slither-disable` in Solidity code.
- Fix real issues first; suppression is last resort.
- If a finding is accepted, record it in config-driven triage (`slither.db.json`) and document it here.
- Commit `slither.db.json` only when reviewed accepted findings must remain.

### Required documentation for each accepted finding
For every accepted finding, add an entry with:
1. Detector name (exact Slither detector id)
2. Detector documentation link (`https://github.com/crytic/slither/wiki/Detector-Documentation#...`)
3. Reason for acceptance
4. Why this specific contract usage is safe

Use this template:

| Detector | Link | Reason accepted | Contract-specific safety rationale |
| --- | --- | --- | --- |
| _example-detector_ | _exact detector doc URL_ | _why not fix now_ | _why behavior is safe here_ |

### Current accepted findings
| Detector | Link | Reason accepted | Contract-specific safety rationale |
| --- | --- | --- | --- |
| `timestamp` | https://github.com/crytic/slither/wiki/Detector-Documentation#block-timestamp | `block.timestamp` is used only for receipt metadata/event observability. | Timestamp does not gate minting, authorization, value transfer, or critical branch logic in `ReceiptRegistry`. |

## ReceiptRegistry detector checklist
Review these categories on every security pass:
1. Reentrancy
2. Dangerous external calls
3. Uninitialized state
4. Incorrect visibility
5. Shadowing
6. Missing state-change events
7. Denial-of-service patterns
8. `tx.origin` usage
9. Low-level calls
10. Assembly usage
11. ERC pattern checks (if ERC contracts are added)

## Triage flow (baseline)
1. Run `npm run security:slither:ci`.
2. Fix all blocking findings (`MEDIUM`/`HIGH`).
3. Run `npm run security:slither:triage` only for reviewed acceptable findings.
4. Commit `slither.db.json` with minimal accepted entries.
5. Keep CI strict (`fail_on: medium`) so any new findings still fail until reviewed.

## If Slither compilation fails
1. Ensure you run from repo root.
2. Ensure Foundry is installed and available: `forge --version`.
3. Confirm compiler pin from `foundry.toml` is unchanged (`solc = "0.8.24"`).
4. Run `forge build` to validate remappings/dependencies.
5. Re-run `npm run security:slither`.
6. If failure persists, inspect compilation stderr and fix project configuration first (do not bypass with broad suppression).
