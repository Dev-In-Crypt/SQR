# 5. Final launch sign-off template (filled draft, provable-only)

## Release identity

- Baseline SHA: `d190c3829a19bae5317d0ccfb2fb2e59f2f6e51a` (`PROVEN_FROM_REPO`)
- Release tag: `v0.2.3` (`PROVEN_FROM_REPO`)
- Release candidate branch: TODO (`UNVERIFIED`, `REQUIRES_USER_RUNTIME_SOURCE`)
- Sign-off date (UTC): TODO

## Required launch status fields

- must-fix status: `OPEN` (`UNVERIFIED`, missing launch evidence)
- smoke evidence status: `MISSING` (`UNVERIFIED`, no complete launch smoke evidence package in pinned repo)

## Approval table

| Area | Status (PASS/FAIL/BLOCKED) | Evidence link | Owner | Date |
| --- | --- | --- | --- | --- |
| Release freeze baseline pinned | BLOCKED | Baseline identified (`git rev-parse HEAD`, `git tag --points-at HEAD`), clean launch tree evidence TODO | TODO | TODO |
| Runtime matrix complete (staging + production) | BLOCKED | `docs/launch/runtime-matrix.template.md` (contains TODO/UNVERIFIED items) | TODO | TODO |
| Queue mode decision documented | BLOCKED | `docs/launch/launch-baseline-checklist.md` (decision criteria present; runtime proof TODO) | TODO | TODO |
| ReceiptRegistry staging evidence complete | BLOCKED | `docs/launch/receiptregistry-deployment-evidence.template.md` (staging block TODO) | TODO | TODO |
| ReceiptRegistry production evidence complete | BLOCKED | `docs/launch/receiptregistry-deployment-evidence.template.md` (production block TODO) | TODO | TODO |
| Staging full smoke complete | BLOCKED | TODO (`REQUIRES_DEPLOY_EVIDENCE`) | TODO | TODO |
| Production read-only smoke complete | BLOCKED | TODO (`REQUIRES_DEPLOY_EVIDENCE`) | TODO | TODO |
| Must-fix list empty | BLOCKED | TODO (must-fix register and closure evidence required) | TODO | TODO |

## Must-fix summary

- Open must-fix count: TODO (`UNVERIFIED`)
- Must-fix item IDs or links: TODO (`UNVERIFIED`)

## Smoke summary

- Staging smoke run ID/link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)
- Production read-only smoke run ID/link: TODO (`UNVERIFIED`, `REQUIRES_DEPLOY_EVIDENCE`)

## Missing-data checklist for user (required before launch)

- [ ] Provide staging runtime values from staging secret manager/platform env.
- [ ] Provide production runtime values from production secret manager/platform env.
- [ ] Provide staging ReceiptRegistry deploy tx hash, explorer links, and verification proof.
- [ ] Provide production ReceiptRegistry deploy tx hash, explorer links, and verification proof.
- [ ] Provide finalized staging full smoke evidence links.
- [ ] Provide finalized production read-only smoke evidence links.
- [ ] Provide named approvers and sign-off timestamps.
- [ ] Confirm clean release-candidate tree evidence for final launch baseline.

## Final launch decision

`LAUNCH APPROVED: NO (BLOCKED - REQUIRES USER-PROVIDED LAUNCH EVIDENCE)`

Approvers:
- Engineering: TODO
- Security: TODO
- Product/Operations: TODO
