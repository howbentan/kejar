# Task 1 report: bomoh_stash column, claim_bomoh(), and the store layer

**Status:** DONE_WITH_CONCERNS
**Commit:** efbf3ad feat: add bomoh_stash column and claim_bomoh for Bomoh's grant

## What was implemented

- `supabase/migrations/0015_bomoh.sql`: adds `games.bomoh_stash jsonb`, and `claim_bomoh(p_game, p_player, p_at) returns boolean`. It mirrors `claim_dato()` in `0011_full_mode.sql`: same `for update` lock, same re-check (object, numeric lat, no `claimedBy`), same `claimedBy`/`claimedAt` stamp. It never inserts into `powerups`. Revoked from public/anon/authenticated and granted to service_role, as `claim_dato` is.
- `app/shared/types.ts`: `BomohStash` interface (same shape as `DatoStash`), and `Game.bomoh_stash?: BomohStash | null`.
- `app/api/_lib/store.ts`: `claimBomoh(gameId, playerId, at: Date): Promise<boolean>` added to the `GameStore` interface, and implemented on `MemoryStore`. It returns false when there is no game, no stash, no numeric lat, or it is already claimed. Otherwise it stamps `claimedBy` and `claimedAt = at.toISOString()` on a fresh object and returns true.
- `app/api/_lib/supabaseStore.ts`: `claimBomoh` calls the `claim_bomoh` RPC with `p_at: at.toISOString()` and returns `=== true`. `bomoh_stash` is added to `GAME_COLUMNS`, so the real store reads the column back. The brief did not list this, but without it the Supabase store would never return the stash.
- `app/api/_lib/store.test.ts`: new `describe('MemoryStore.claimBomoh')` with two tests:
  - Two simultaneous claims produce exactly one winner, the stash is stamped with the winner and `claimedAt`, and `powerUps(gameId)` is empty.
  - A stash that is not dropped, already claimed, or belongs to a missing game returns false.

## Deviations from the brief

- Paths: the brief named `app/shared/store.ts` and `app/shared/supabaseStore.ts` and `app/shared/store.test.ts`. The real files are `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts` and `app/api/_lib/store.test.ts`. I edited the real files. `claimDato` has no direct store-level test; the brief's "grep for it first" found only action-level tests, so the new test follows the store test file's own pattern.
- `GAME_COLUMNS` in `supabaseStore.ts` was updated (see above). The brief did not mention it.
- The `GameStore` interface in `store.ts` gained the `claimBomoh` signature. Required for the two implementations to type-check against it.

## TDD evidence

RED: `npx vitest run api/_lib/store.test.ts -t "claimBomoh"` (run from `app/`)
```
× goes to one of two simultaneous claims, stamps the stash, and inserts no powerups row
TypeError: store.claimBomoh is not a function
× refuses a stash that was never dropped, is already claimed, or belongs to no game
TypeError: store.claimBomoh is not a function
Tests  2 failed | 35 skipped (37)
```
This was expected: the method did not exist yet.

GREEN: same command after implementation
```
Test Files  1 passed (1)
Tests  2 passed | 35 skipped (37)
```

## Full suite and typecheck

- `npx vitest run` (from `app/`): `Test Files 81 passed (81)`, `Tests 1154 passed (1154)`.
- `npm run typecheck` (from `app/`, runs `tsc -b && tsc -p api/tsconfig.json`): exit 0, no output.

## Self-review

- Re-read the diff. `claimBomoh` in `MemoryStore` copies the stash object rather than mutating it, following the `claimDato` comment about shared shallow copies.
- The SQL is a line-for-line adaptation of `claim_dato` minus the insert, and returns boolean. It sits in the same style as the brief's text.
- The commit message ends with the Haiku 5.5 Co-Authored-By line.

## Concerns

- The SQL migration has not been executed against a real Postgres/Supabase instance. Nothing in this environment can run it. The function body is a direct copy of the tested `claim_dato` pattern, but the `claim_bomoh` path is only verified in-memory. Worth running the migration once against a Supabase branch before relying on it.
- Git warned that LF will become CRLF for `0015_bomoh.sql` on checkout. This is the repo's line-ending setting, not a content problem. Other migrations are likely affected the same way.
- `.superpowers/` was not committed, as it is ignored in this worktree. This report sits there alongside the other SDD files.
