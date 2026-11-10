# Task 3 report: judgeBomohClaim pure logic

## Implemented
- `app/shared/powerups.ts`: exported `BomohClaimJudgement` and `judgeBomohClaim`, placed after `judgeDatoClaim`. Reuses module-private `withinClaimReach`. Checks in order: phase (`not-chasing`), role must be chaser (`cannot-claim`), `placedStash` present and unclaimed (`no-stash`), reach (`too-far`). No `powerUps`/`pings` input, no `slotBusy`, no jail check.
- Import of `BomohStash` added to the existing `./types.js` import.
- `app/shared/powerups.test.ts`: added `judgeBomohClaim` describe block (6 tests) and the import.

## TDD evidence
RED: `npx vitest run shared/powerups.test.ts` -> `Tests 6 failed | 25 passed (31)`; failures `TypeError: judgeBomohClaim is not a function`.
GREEN: `npx vitest run shared/powerups.test.ts` -> `Tests 31 passed (31)`.

## Full verification
- `npx vitest run` -> `Tests 1163 passed (1163)`
- `npx tsc --noEmit -p .` -> exit 0, no output.

## Files changed
- app/shared/powerups.ts
- app/shared/powerups.test.ts

Commit: 9128e72 feat: add judgeBomohClaim

## Concerns
- The brief says to mirror existing `judgeDatoClaim` test cases, but `powerups.test.ts` has no `judgeDatoClaim` tests. I wrote the Bomoh cases directly from the brief's list instead.
- `powerups.ts` is already large; the addition is small and follows the existing pattern, so I did not restructure it.
