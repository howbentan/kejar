# Task 5 Report: `claimBomoh` action, claim dispatch, and `dropBomohSeri`

> Fix round 1 report appended at the bottom, after the original report below.

## What I implemented

All in `app/api/_lib/actions.ts` (paths below are relative to the repo root; the worktree's working directory is itself named `.../kejar-bomoh/app`, so on disk these are under `app/api/_lib/...` from the plan's perspective but the file itself lives at `<worktree>/app/api/_lib/actions.ts`).

### Finding and reading `dropDatoSeri`

Grepped `actions.ts` for `dropDatoSeri` (brief said it hadn't been read yet) and found it at the line just after `claimDato`. Read both in full:

- `claimDato` (was lines 1220-1251): miss-limit check via a `stash-miss` event count, a `miss()` helper that records a miss and returns the given answer, a code-hash compare (`datoCodeFromQr` + `hashToken`) gated on `no secret in non-full mode`, `judgeDatoClaim`, `store.claimDato` (losing the race isn't a miss), retiring the card via `setSecretCard`, and an anonymized `legendary` feed event.
- `dropDatoSeri` (was lines 1258-1274): `requireOrganiser` (marshals and players both get 403 — confirmed from the existing "players and marshals cannot drop it" test, which rejects both a player token and a marshal token), a Full-mode-only check, `requireLobby`, `settleLobbyCard(ctx, loaded, organisationId, 'dato')` (Task 4's generalized lazy card-assignment), a "no card" 409 if still none, location/play-area validation, and an update that preserves the card's code across moves (`code ?? newDatoCode()` only fills it in if missing).

### `claimBomoh`

Added directly after `claimDato`, mirroring it step for step with Bomoh's own rules:
- Same miss-limit/miss-recording machinery, using `bomohCodeFromQr` and `game.bomoh_stash`.
- `judgeBomohClaim` (Task 3) instead of `judgeDatoClaim` — no jail check (chasers are never jailed), no `slotBusy`/hand-full check (Bomoh never occupies a hand slot), so no `powerUps`/`pings` need to be loaded or passed.
- `store.claimBomoh(game.id, me.id, new Date(ctx.now))` (Task 1's three-arg signature — it takes a `Date` for `claimedAt`, unlike `claimDato`'s two-arg form) instead of `store.claimDato`.
- Per the brief's deliberate omission: no `powerups` row is read back or returned, since `store.claimBomoh` only returns a boolean (Bomoh activates on claim, not via a hand slot).
- Returns `{ ok: true, kind: 'bomoh' }` on success; the same `{ ok: false, reason: ... }` shapes as `claimDato` on failure (`no-stash`/`too-far` become misses; `not-chasing`/`cannot-claim` are returned directly, uncounted).

### Claim dispatch

Added `if (isBomohQr(str(body.qr))) return claimBomoh(ctx, fresh as GameRow, me, str(body.qr))` in the `claim` action, right after the existing `isDatoQr` branch.

### `dropBomohSeri`

Added directly after `dropDatoSeri`, mirroring it with `bomoh_stash` substituted for `dato_stash` and the generalized Task 4 helpers called with `'bomoh'`: same organiser-only/Full-mode-only/lobby-only checks, `settleLobbyCard(ctx, loaded, organisationId, 'bomoh')`, `NO_FREE_BOMOH_CARD_NOTICE` (Task 1's existing export) when still no card, same location/play-area validation, same move-preserves-code update. Reused `newDatoCode()` for the fallback code generator rather than adding a `newBomohCode` — the codebase already uses `newDatoCode()` to mint codes for *both* legendaries' secret cards (see `store.ts`'s and `supabaseStore.ts`'s `secretCards()`, which call `newDatoCode()` for `bomoh` letters too), so a new identical function would just be a second name for the same thing.

One behavioral note worth flagging: `create`, `start`, and the organiser's `state` poll only call `settleLobbyCard(..., 'dato')`, not `'bomoh'` — that generalization wasn't part of Task 4's or this task's scope (Task 4's brief lists only the shared helper functions, not every call site). The practical effect: a Bomoh card is lazily assigned on the *first* `dropBomohSeri` call (via `settleLobbyCard`'s `wantsCard`/`assignFreeCard` path), not at game creation like Dato Seri's. This matches "ruling R9" (a lobby that wants a legendary but has none tries again whenever its card is next used) and is exercised directly in the new tests. I did not touch `create`/`start`/`state` since the brief didn't ask for it and it isn't needed for `claimBomoh`/`dropBomohSeri` to work correctly.

### Dispatch table

Added `dropBomohSeri,` to the exported `actions` object, next to `dropDatoSeri,`.

### `unfinishedGames` widening (carried forward from Task 4's review)

- `app/api/_lib/store.ts`, `MemoryStore.unfinishedGames`: added `|| typeof g.bomoh_stash?.lat === 'number'` alongside the existing `dato_stash` check.
- `app/api/_lib/supabaseStore.ts`, `SupabaseStore.unfinishedGames`: added `,bomoh_stash->>lat.not.is.null` to the PostgREST `.or(...)` filter string.
- `app/api/_lib/store.test.ts`: extended the existing `unfinishedGames` test with a second old lobby (`oldLobby2`) that gets a dropped-but-unclaimed `bomoh_stash` and is confirmed to still be listed, mirroring the existing Dato-stash case in the same test.

## What I tested

Mirrored `claimDato`'s/`dropDatoSeri`'s test suites in `app/api/_lib/actions.test.ts`, adding two new `describe` blocks right before `describe('Settle: Dato Seri frees its holder...')`:

**`Bomoh: the hidden stash (chaser-side legendary, mirrors Dato Seri above)`** — 8 tests:
- a chaser in reach of the dropped, unclaimed stash with the right code claims Bomoh; retires the card; no `powerups` row is added
- the feed names it anonymously (`Something legendary was found.`), never naming Bomoh or the finder
- a bare/foreign/made-up code is a silent `no-stash` miss, and someone else can still claim it after
- `STASH_MISS_LIMIT` consecutive misses locks a player out even at the right spot, but someone else can still claim it
- two chasers scanning at the same moment: exactly one wins (store-level race safety)
- a runner (not a chaser) is rejected `cannot-claim`, and it is *not* counted as a miss (verified via `store.events` having zero `stash-miss` rows, then confirming the chaser can still claim)
- with no stash dropped, scanning claims nothing

**`dropBomohSeri (mirrors dropDatoSeri above)`** — 4 tests:
- the organiser drops it, and dropping again before the start moves it (keeping the same code/card) — stub-asserts directly against `game.bomoh_stash` per the brief, since Task 6 hasn't wired `view.bomohStash` yet
- players and marshals cannot drop it; only the organiser can
- is Full mode only, inside the play area only, and fixed once the game starts
- with none of the organisation's purple cards free, dropping is refused with `NO_FREE_BOMOH_CARD_NOTICE` ("Reprint a purple card to use Bomoh.")

Added a `lobby()` helper (distinct from Dato's) that promotes Hafiz to a second chaser and adds a fourth player (Chong) as a second runner, so `validateTeams` still passes (`>=1 chaser`, `>=2 runners`, `chasers <= runners`) while giving the race test two chasers to race with.

## TDD Evidence

### RED (claimBomoh dispatch + dropBomohSeri export)

Temporarily commented out the `isBomohQr` dispatch line and removed `dropBomohSeri` from the `actions` export, then ran:

```
npm test -- actions.test
```

Result: 11 failures — e.g.
```
FAIL api/_lib/actions.test.ts > Bomoh: the hidden stash... > with no stash dropped, scanning claims nothing
AssertionError: expected { ok: false, reason: 'unknown-station' } to deeply equal { ok: false, reason: 'no-stash' }
  (claim fell through to the station-QR path since isBomohQr wasn't dispatched)

FAIL api/_lib/actions.test.ts > dropBomohSeri... > the organiser drops it...
TypeError: actions[action] is not a function
  (dropBomohSeri wasn't in the actions export)
```
11 failed | 289 passed (300) — exactly the new Bomoh tests failed; nothing else regressed.

Then restored both edits (dispatch line and export).

### RED (unfinishedGames widening)

Temporarily reverted the `store.ts` filter to drop the `bomoh_stash?.lat` check, then ran:

```
npm test -- store.test
```

Result:
```
FAIL api/_lib/store.test.ts > MemoryStore secret card sets > unfinishedGames lists the games...
AssertionError: expected [ 'g5', 'g6', 'g8' ] to deeply equal [ 'g5', 'g6', 'g8', 'g9' ]
```
1 failed | 47 passed (48). Then restored the widened filter.

### GREEN

```
npm test -- actions.test
```
→ `Test Files 1 passed (1)`, `Tests 300 passed (300)`

```
npm test -- store.test
```
→ `Test Files 2 passed (2)`, `Tests 48 passed (48)`

```
npm test
```
→ `Test Files 81 passed (81)`, `Tests 1177 passed (1177)` — full suite, no regressions.

```
npm run typecheck
```
→ clean (`tsc -b && tsc -p api/tsconfig.json`, no errors).

```
npm run lint
```
→ only pre-existing warnings in unrelated files (`store.ts:274` unused `organiser_id`, various React hook/ref warnings in `src/`, one pre-existing unused `durian` in `actions.test.ts`); nothing new from this change.

## Files changed

- `app/api/_lib/actions.ts` — imports (`bomohCodeFromQr`, `isBomohQr`, `judgeBomohClaim`), `claim` dispatch, `claimBomoh`, `dropBomohSeri`, `actions` export.
- `app/api/_lib/actions.test.ts` — import (`bomohQr`, `STASH_MISS_LIMIT`), two new `describe` blocks (12 tests total).
- `app/api/_lib/store.ts` — `unfinishedGames` widened to check `bomoh_stash?.lat` too.
- `app/api/_lib/store.test.ts` — `unfinishedGames` test extended with a Bomoh-stash case.
- `app/api/_lib/supabaseStore.ts` — `unfinishedGames`'s PostgREST `.or(...)` filter widened with `bomoh_stash->>lat.not.is.null`.

## Self-review findings

- Confirmed `dropDatoSeri`'s actual auth (organiser-only, not "organiser or marshal" as the brief's step 1 loosely suggested) by reading the code and its existing test, and wrote the Bomoh test to match reality rather than the brief's imprecise paraphrase.
- Confirmed `create`/`start`/`state` are not generalized to assign a Bomoh card eagerly (only Task 4's shared helpers are generic; call sites besides `dropBomohSeri` remain Dato-only) — adjusted tests to exercise the actual lazy-assignment-on-first-drop behavior instead of assuming eager assignment, and left those call sites untouched since wiring them is out of this task's scope (per the plan, likely Task 9's territory or implied elsewhere, not called out for Task 5).
- Verified `judgeBomohClaim` truly has no hand-slot check (confirmed by reading `shared/powerups.ts`) before omitting `powerUps`/`pings` from the call, matching the brief's "no hand-slot check" note.
- Reused `newDatoCode()` rather than inventing `newBomohCode()`, consistent with the existing (if misleadingly named) codebase convention of using it for both legendaries.
- No regressions: full suite (1177 tests), typecheck, and lint all clean.

## Issues or concerns

None blocking. One thing worth the controller/reviewer's awareness: Bomoh's card is only assigned lazily on the first `dropBomohSeri` call (not at game creation, unlike Dato Seri), because `create`/`start`/`state` haven't been generalized to settle the Bomoh card eagerly. This is correct behavior given Task 4's actual scope and produces working, race-safe results, but it is a visible asymmetry with Dato Seri that a later task (UI wiring, Task 9, or an end-to-end test in Task 10) should be aware of — an organiser who creates a Full+Bomoh game and immediately polls `state` before ever calling `dropBomohSeri` will see no `bomoh_stash` at all yet, which is fine since Task 6 (view exposure) and Task 8 (drop UI) haven't landed either.

**Note: this concern was addressed in Fix round 1 below — `create`/`start`/`state` are now all threaded for Bomoh, so the asymmetry described above no longer exists.**

---

## Fix round 1

Commit: `c1f00a6` "fix: thread Bomoh through create/start/the organiser poll/setMode"

### What the review found

My own original report had flagged that `create`, `start`, and the organiser's `state` poll only call `settleLobbyCard(..., 'dato')`, never `'bomoh'`, and I'd left it as a non-blocking concern. The review confirmed this was load-bearing, not cosmetic: it meant Bomoh's card was never assigned until the first `dropBomohSeri` call — backwards from how an organiser actually needs to work (print the physical card *before* hiding it, per ruling R15). It also found a real leak in `setMode`: switching a game from Full back to Core released a held Dato Seri card but never released a held Bomoh card, so the card stayed permanently assigned to that lobby (unusable by any other game in the organisation) even though the organiser believed they'd turned Bomoh off.

### What I changed, call site by call site

All four changes mirror the existing Dato Seri branch at the same call site, duplicated explicitly for `'bomoh'` rather than generalized into a loop (per the review's explicit instruction to follow Dato's existing pattern, not invent a new one):

1. **`create`** (`app/api/_lib/actions.ts`, ~line 618-652): added a second, independent `if (settings.mode === 'full' && settings.legendaries.bomoh === 'stash')` block right after Dato Seri's, calling `freeCard(ctx, organiser.organisation_id, 'bomoh')` and setting `bomohStash` the same way `stash` is set for Dato. The `createGame` call now spreads `bomoh_stash` conditionally alongside `dato_stash`.
2. **`start`** (~line 704-762): now calls `settleLobbyCard` for both `'dato'` and `'bomoh'` in sequence, chaining the freshest `game` through (the second call takes `datoSettled.game`, not the original `game`). Computes an `offLegendaries` patch covering both (`wantsCard(settled, 'dato')` / `'bomoh'`), so the game can start with either or both legendaries turned off if their card pool was exhausted on recheck.
3. **`state`**'s organiser-only poll recheck (~line 783-810): now checks `needsRecheck(game, ctx.now, 'bomoh')` alongside the existing `'dato'` check (combined into one guard so the `organiserById` lookup happens at most once), and calls `settleLobbyCard(..., 'bomoh')` when needed.
4. **`setMode`** (~line 1862-1883): `releaseCard(ctx, loaded, 'bomoh')` added alongside the existing `releaseCard(ctx, loaded, 'dato')` on leaving Full (this is the leak fix). On entering Full, `settleLobbyCard` is now called for both legendaries, chained (`bomoh` settles against `dato.game`).

**Notice combination:** `create`, `start`, and `setMode` can each now produce a notice from *either* legendary (e.g., "no yellow cards free" and/or "no purple cards free"). Rather than inventing a new multi-notice shape, I kept the existing single-`notice`-string contract and join non-null notices with a space — e.g. `'Reprint a yellow card to use Dato Seri. Reprint a purple card to use Bomoh.'` when both pools are exhausted at once.

### Tests fixed to match the corrected (eager) behavior

Three of my own round-1 tests in the `dropBomohSeri` describe block had been written assuming Bomoh's card was assigned lazily (the bug this fix closes), so they needed updating to match the now-correct eager-assignment behavior:
- `"players and marshals cannot drop it; only the organiser can"` — now asserts `bomoh_stash` already exists (assigned by `create`) with `lat: null, lng: null`, instead of asserting it's still `null`.
- `"with none of the organisation's purple cards free, ..."` — rewritten to exhaust the organisation's three purple cards across four `create` calls (mirroring the existing Dato "claiming the stash retires its card... third game gets notice" pattern), since retiring cards *after* creation no longer reproduces the "none free" scenario (the first game already grabbed one at creation time).
- `"the organiser drops it, and dropping again before the start moves it"` — renamed and extended to assert the card's `code`/`letter` shape right after `readyGame()` (proving eager assignment), before dropping.

### New tests covering the fix

Added a new `describe('Bomoh is threaded through create/start/the organiser poll/setMode, same as Dato Seri (fix round 1)')` block (`app/api/_lib/actions.test.ts`, right after the `dropBomohSeri` describe, before `Settle: Dato Seri...`), with 5 tests, each mirroring a specific existing Dato Seri test for the same call site:

1. `'create assigns a free purple card eagerly (ruling R15), so the organiser can print it before any drop happens'` — mirrors `'a Full game is assigned a free yellow card...'`.
2. `'with no free card for either legendary, create combines both notices'` — new coverage specific to the notice-joining behavior (no direct Dato equivalent, since only one legendary existed before Bomoh).
3. `'a confirmed-printed purple card is assigned on the organiser poll, same as Dato Seri (ruling R9)'` — mirrors `'a card confirmed printed is assigned on the organiser poll'`; also proves a player's own poll does *not* trigger the recheck (asserts `bomoh_stash` stays null after a player poll, only changing after the organiser's).
4. `"start re-checks an expired lobby's purple card the same way as Dato Seri, and starts with Bomoh off when none is left"` — mirrors `'an old lobby whose card was taken re-checks on start: ... starts with Dato Seri off'`.
5. `'setMode to Full assigns a purple card too, independently of Dato Seri; Core releases both, and Full reassigns fresh ones'` — mirrors `'setMode to Full assigns a card; Core releases it (ruling R8), and Full again assigns one fresh'`; this test directly proves the leak fix (asserts `bomoh_stash` is null after switching to Core, where before the fix it would have stayed assigned).

Also picked up one of the two Minor review items: added `'scans refused for not chasing or cannot claim are not misses either (ruling R4, mirrors Dato Seri)'` to the `Bomoh: the hidden stash` describe block, mirroring Dato's combined `'scans refused for not chasing, cannot claim, a full slot or a lost race are not misses (ruling R4)'` test (minus the hand-full case, which doesn't apply to Bomoh). The other Minor item (the 12-vs-11 test count in my original report) was a reporting-only discrepancy with no code to fix.

### TDD Evidence

**RED**, one call site at a time — reverted each fix individually, ran the specific new test proving it, confirmed failure, then restored:

1. **`create`**: replaced the new bomoh-assignment block with `const bomohStash = null; const noFreeBomohCard = false`.
   ```
   npm test -- actions.test -t "create assigns a free purple card eagerly"
   ```
   ```
   TypeError: Cannot read properties of undefined (reading 'card')
     at api/_lib/actions.test.ts:3124:63
   ```
2. **`start`**: replaced `const bomohSettled = await settleLobbyCard(...)` with a stub `{ game: datoSettled.game, notice: null }`.
   ```
   npm test -- actions.test -t "start re-checks an expired lobby"
   ```
   ```
   AssertionError: expected { startedAt: ... } to deeply equal { startedAt: Any<String>, notice: 'Reprint a purple card to use Bomoh.' }
   - "notice": "Reprint a purple card to use Bomoh."  (missing)
   ```
3. **`state` poll**: reverted the guard to only check/settle `'dato'`.
   ```
   npm test -- actions.test -t "confirmed-printed purple card is assigned"
   ```
   ```
   AssertionError: expected undefined to match object { card: { letter: 'B' }, lat: null, lng: null }
     at api/_lib/actions.test.ts:3164:57
   ```
4. **`setMode`**: removed the `bomoh` release and settle calls, leaving only `dato`'s.
   ```
   npm test -- actions.test -t "setMode to Full assigns a purple card too"
   ```
   ```
   TypeError: Cannot read properties of undefined (reading 'card')
     at api/_lib/actions.test.ts:3186:57
   ```

Each revert was restored immediately after confirming the failure; no `TEMP-RED` markers remain (`grep -rn "TEMP-RED" api/` → clean).

**GREEN**, after restoring all four fixes and updating the three stale round-1 tests:

```
npm test -- actions.test
```
→ `Test Files 1 passed (1)`, `Tests 306 passed (306)` (305 after round 1, +1 from the new not-chasing/cannot-claim test = 306).

```
npm test
```
→ `Test Files 81 passed (81)`, `Tests 1183 passed (1183)` — full suite, no regressions (1177 before this round + 6 new tests = 1183).

```
npm run typecheck
```
→ clean.

```
npm run lint
```
→ only the same two pre-existing warnings as before (`store.ts:274` unused `organiser_id`, `actions.test.ts:872` unused `durian`); nothing new.

### Files changed (this round)

- `app/api/_lib/actions.ts` — `create`, `start`, `state`, `setMode` each threaded for `'bomoh'` alongside their existing `'dato'` handling.
- `app/api/_lib/actions.test.ts` — 3 round-1 tests corrected to match eager assignment; 1 new combined miss-exemption test; 1 new describe block with 5 tests covering the four fixed call sites plus notice-combination.

### Self-review (this round)

- Verified by direct RED/GREEN toggling (not just reasoning) that each of the four call sites actually exercises the new code path, not just that the test suite happens to pass.
- Confirmed the fix doesn't change Dato Seri's own behavior for any existing test: full suite stayed at 1177 Dato-era tests passing, now 1183 with the 6 new ones, no Dato test needed changes.
- Re-examined Task 4's own `"Bomoh's purple cards: the same organiser lifecycle as Dato Seri's yellow ones"` describe block (which manually simulates a held card via direct `store.updateGame` rather than going through `create`) to check whether eager assignment at `create` would conflict with its manual card selection. It doesn't: `cardHolders`/`freeCard` compute "who holds which card" purely by reading `game.bomoh_stash.card.id` at query time, so overwriting the stash (as that describe's `bomohLobby()` helper does) correctly reassigns holding with no stale state left over. Confirmed empirically too — that describe block's 3 tests still pass unchanged.
- Confirmed no leftover debug/temp code from the RED verification process.

### Remaining concerns

None. The asymmetry flagged in my original report (Bomoh's card assigned lazily, only on first drop) is now resolved — Bomoh's card lifecycle is symmetric with Dato Seri's at every call site Task 4 generalized the shared helpers for.
