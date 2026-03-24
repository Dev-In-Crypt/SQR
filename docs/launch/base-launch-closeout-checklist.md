# Base launch closeout checklist

Purpose:
- Turn the remaining `PARTIAL` and `BLOCKED` items in the Base launch packet into concrete owner actions.

Related docs:
- `docs/launch/final-launch-signoff.base.md`
- `docs/launch/runtime-matrix.base.md`
- `docs/launch/receiptregistry-deployment-evidence.md`
- `docs/launch/launch-baseline-checklist.md`

## 1. Freeze baseline

Owner: Engineering

- [ ] Choose the final release commit SHA for the Base launch packet.
- [ ] Ensure the release-candidate working tree is clean.
- [ ] Record `git rev-parse HEAD` output for the chosen SHA.
- [ ] Record `git tag --points-at HEAD` output, or create a release tag if policy requires one.
- [ ] Update `docs/launch/final-launch-signoff.base.md` with the final SHA, tag, and date.

Completion evidence:
- clean `git status --porcelain`
- final SHA
- release tag or explicit note that no tag is used

## 2. Complete staging runtime matrix

Owner: Engineering / DevOps

- [ ] Confirm staging `APP_ENV=staging`.
- [ ] Confirm staging `NODE_ENV=production`.
- [ ] Confirm staging `NEXT_PUBLIC_APP_URL`.
- [ ] Confirm staging queue mode (`inline` or `redis`).
- [ ] Confirm staging RPC wiring (`BASE_SEPOLIA_RPC_URL` or `BASE_RPC_URL`).
- [ ] Confirm staging `RECEIPT_CONTRACT_ADDRESS`, or explicitly mark receipt minting disabled in staging.
- [ ] Update `docs/launch/runtime-matrix.base.md` with staging values and timestamps.

Completion evidence:
- platform env export, deployment dashboard screenshots, or runbook command output

## 3. Close ReceiptRegistry staging evidence

Owner: Engineering

- [ ] Capture Base Sepolia contract address if staging uses receipts.
- [ ] Capture deploy tx hash and explorer links.
- [ ] Confirm code exists at the deployed address.
- [ ] Confirm ABI compatibility (`mintWithSig`, `nonces`, `ReceiptMinted`).
- [ ] Confirm EIP-712 compatibility (`ReceiptRegistry`, `0.2.0`, correct `chainId`, correct `verifyingContract`).
- [ ] Add or update the staging evidence file linked from the sign-off doc.

Completion evidence:
- explorer links
- code-at-address proof
- ABI/EIP-712 compatibility note

## 4. Archive smoke evidence

Owner: Engineering / QA

- [ ] Link the staging full smoke run artifacts.
- [ ] Link the production read-only smoke artifacts.
- [ ] Ensure links are immutable or stored in a stable team location.
- [ ] Update the approval rows in `docs/launch/final-launch-signoff.base.md`.

Minimum smoke coverage:
- staging submit flow
- staging receipt prepare/confirm or explicit receipt-disabled note
- production home/config/session reachability
- production report read path
- queue-mode-specific validation

## 5. Confirm hidden production-only values

Owner: DevOps / Security

- [ ] Confirm `PRIVATE_LINK_SECRET` is non-default.
- [ ] Confirm `PRIVATE_LINK_SECRET` length is at least 32 chars.
- [ ] Confirm production DB and Redis values are set in the platform.
- [ ] Update `docs/launch/runtime-matrix.base.md` with masked confirmation notes.

Completion evidence:
- masked screenshot, secret manager metadata, or operator attestation

## 6. Close must-fix and approvals

Owner: Engineering / Security / Product

- [ ] Record the must-fix list for this release, even if empty.
- [ ] Set open must-fix count to `0` when complete.
- [ ] Add approver names for Engineering, Security, and Product/Operations.
- [ ] Add sign-off timestamps.
- [ ] Change final decision only after all required evidence is attached.

Completion evidence:
- must-fix register link or explicit empty record
- approver names and UTC timestamps

## Done condition

The Base launch packet is complete when all of the following are true:

- [ ] `docs/launch/final-launch-signoff.base.md` has no remaining required `BLOCKED` items.
- [ ] `docs/launch/runtime-matrix.base.md` has production and staging values filled to the level required by the release policy.
- [ ] Receipt evidence is complete for every environment that supports receipt minting.
- [ ] Smoke artifacts are linked.
- [ ] Must-fix count is `0`.
- [ ] Approvers and dates are filled.
