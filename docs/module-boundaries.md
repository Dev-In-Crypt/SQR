# Module Boundaries (MVP-safe)

This document locks the safe-now structure policy without changing existing
runtime behavior.

## Facade entrypoints (additive)

- `@/lib/core`
- `@/lib/infra`
- `@/lib/runtime`
- `@/lib/domains/analysis`
- `@/lib/domains/auth`
- `@/lib/domains/receipt`

These facades are re-export only. They do not move implementation files and do
not change API contracts.

## Import policy

1. Existing imports from `@/lib/*` remain valid and should not be mass-rewritten
   during MVP.
2. New modules should prefer facade imports above instead of adding more
   root-level `lib/*` imports.
3. High-coupling modules stay in place until post-MVP (for example:
   `session`, `queue`, `source`, `scanner`, `report`, `receipt`,
   `pipeline/process-analysis`).
4. `lib/forge-std` stays where it is until an explicit Foundry remapping task.

## Post-MVP move strategy (shim-first)

When moving a file after MVP:

1. Move implementation to the new target location.
2. Leave a compatibility shim at the old path:

```ts
export * from "@/lib/domains/analysis/report";
```

3. Migrate imports incrementally across small PRs.
4. Remove shim only after imports are fully migrated and tests are green.

## Optional new-file guard (warning-only)

This repo includes an optional guard that checks only newly added `.ts`/`.tsx`
files in git (`added` + `untracked`) and warns when new code imports
non-facade `@/lib/*` paths.

Run:

```bash
npm run lint:boundaries:new
```

Behavior:

1. Default mode is warning-only and exits `0`.
2. Legacy `@/lib/*` imports stay valid and are not blocked.
3. Future tighten option: set `BOUNDARY_GUARD_STRICT=1` to return non-zero on
   violations.
