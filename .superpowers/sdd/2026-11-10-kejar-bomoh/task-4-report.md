# Task 4 Report: Generalize the organiser card-lifecycle layer over `legendary`

## What was implemented

Generalized the ~150-line organiser card-lifecycle layer in `app/api/_lib/actions.ts` (previously hardcoded to
`dato_stash`/`'dato'`) to take a `legendary: 'dato' | 'bomoh'` parameter, so the same logic now serves both
legendaries. Also fixed `settingsFrom`'s hardcoded `bomoh: 'off'` override, per Step 5.

### New/changed functions (new signatures)

- `type LegendaryKind = 'dato' | 'bomoh'` — new local type alias.
- `secretLettersFor(game: Game): SecretLetters` — unchanged signature; now reads both `dato_stash` and
  `bomoh_stash` letters instead of only `dato_stash`. Comment updated (no longer says "Bomoh isn't built").
- `expiredLobby(g, now)` — unchanged (legendary-agnostic, only cares about lobby age).
- `stashOf(g: Game, legendary): DatoStash | BomohStash | null | undefined` — **new** helper, picks the game's own
  stash field by legendary.
- `writeStash(ctx, gameId, legendary, stash): Promise<void>` — **new** helper, writes/clears the right field
  (`dato_stash` or `bomoh_stash`) via `ctx.store.updateGame`.
- `holdsCard(g, now, legendary: LegendaryKind): boolean` — added `legendary` param.
- `isDropped(s: DatoStash | BomohStash | null | undefined)` — widened param type, logic unchanged.
- `cardHolders(ctx, organisationId, legendary: LegendaryKind): Promise<Map<string, GameRow>>` — added `legendary`
  param.
- `freeDatoCard` → **`freeCard(ctx, organisationId, legendary: LegendaryKind, exceptGameId?): Promise<SecretCard | null>`**
  (renamed per brief).
- `stashOn(card)` — unchanged (structurally works for either stash shape; `DatoStash`/`BomohStash` are identical
  shapes).
- `releaseDatoCard` → **`releaseCard(ctx, game, legendary: LegendaryKind): Promise<void>`** (renamed per brief).
- `wantsDatoCard` → **`wantsCard(g, legendary: LegendaryKind)`** (renamed per brief).
- `assignFreeCard(ctx, gameId, organisationId, legendary: LegendaryKind): Promise<string | null>` — added
  `legendary` param.
- `reassignDatoCard` → **`reassignCard(ctx, game, organisationId, legendary: LegendaryKind): Promise<string | null>`**
  (renamed per brief).
- `recheckExpiredLobby(ctx, game, organisationId, legendary: LegendaryKind): Promise<string | null>` — added
  `legendary` param.
- `settleLobbyCard(ctx, game, organisationId, legendary: LegendaryKind): Promise<{ game; notice }>` — added
  `legendary` param.
- `needsRecheck(g, now, legendary: LegendaryKind): boolean` — added `legendary` param.
- `listSecretCards` (Action) — now merges `cardHolders` for **both** `'dato'` and `'bomoh'` into one `busy` map
  (previously only ever checked `dato_stash`, so a held purple card never showed `inGame: true`). This is a
  necessary consequence of `cardHolders` taking a `legendary` param and is within the brief's stated line range
  (155–393).
- `lobbyHolding(ctx, card, organisationId)` — now calls `cardHolders(ctx, organisationId, card.legendary)` instead
  of a hardcoded call (card already carries its own `legendary`).
- `retireSecretCard` (Action) — calls `reassignCard(ctx, lobby, organisationId, card.legendary)`.
- `reprintSecretCard` (Action) — uses `stashOf`/`writeStash` and `card.legendary` to patch the right stash field
  and clear the right `kit.placed.<legendary>` key.
- `settingsFrom` — last line changed from `s.legendaries = { dato: legendaries.dato, bomoh: 'off' }` to
  `s.legendaries = legendaries`, so Bomoh can now be turned on (the validation loop already checked both fields).
- **New exported constant**: `NO_FREE_BOMOH_CARD_NOTICE = 'Reprint a purple card to use Bomoh.'`, mirroring
  `NO_FREE_CARD_NOTICE`.

### Call sites outside the generalized range (preserved behavior, pass `'dato'` explicitly)

These call Dato-only actions/flows not touched by this task (`create`, `start`, `state`, `dropDatoSeri`, `setMode`)
and now pass `'dato'` explicitly to the generalized functions, to keep their exact existing behavior:

- `create`: `freeCard(ctx, organiser.organisation_id, 'dato')`.
- `start`: `settleLobbyCard(ctx, game, organiser.organisation_id, 'dato')`, `wantsCard(settled.game, 'dato')`.
- `state`: `needsRecheck(game, ctx.now, 'dato')`, `settleLobbyCard(ctx, game as GameRow, org, 'dato')`.
- `dropDatoSeri`: `settleLobbyCard(ctx, loaded, organiser.organisation_id, 'dato')`.
- `setMode`: `releaseCard(ctx, loaded, 'dato')`, `settleLobbyCard(ctx, { ...loaded, settings }, organiser.organisation_id, 'dato')`.

These five action entry points are intentionally **not** generalized to also handle Bomoh in this task — per the
brief's scope, wiring Bomoh into `create`/`start`/`setMode`/a Bomoh drop action is a later task's job. This task
only generalizes the underlying lifecycle engine so that a later task's admin actions (and a future
`claimBomoh`/`dropBomoh`) can call it with `'bomoh'`.

## Tests

### New tests (Bomoh admin flows), in `app/api/_lib/actions.test.ts`, nested inside `describe('secret card sets', ...)`

Added `describe("Bomoh's purple cards: the same organiser lifecycle as Dato Seri's yellow ones", ...)` with a
`bomohLobby()` fixture (a Full lobby with `legendaries: { bomoh: 'stash' }`, given a purple card directly via
`store.updateGame`/`store.setKitKey`, since no Bomoh drop/claim action exists yet — that's a later task):

1. **"retiring a lobby's purple card gives it another free purple card, or leaves it waiting with Bomoh's own
   notice (ruling R9)"** — mirrors the existing Dato test at (pre-change) line 2911. Retires the held card, checks
   reassignment to a fresh (undropped) card, then exhausts all three cards and checks the `NO_FREE_BOMOH_CARD_NOTICE`
   wording (`'Reprint a purple card to use Bomoh.'`) comes back, with `bomoh_stash` cleared and
   `settings.legendaries.bomoh` still `'stash'`.
2. **"reprinting a dropped lobby's purple card clears the drop and placed.bomoh, same as a yellow reprint (ruling
   R8)"** — mirrors the existing Dato test at (pre-change) line 3344. Drops the card (direct store write), ticks
   `kit.placed.bomoh` (direct `setKitKey`, since `SECRET_PLACE_IDS` doesn't include `'bomoh'` yet — that's a kit.ts
   concern for a later task), reprints, and checks `lat`/`lng`/`claimedBy`/`claimedAt` are back to `null`, the code
   changed, and `kit.placed.bomoh` is gone.
3. **"an expired lobby's unused purple card is freed to be reassigned, the same way Dato Seri's yellow card is
   (ruling R3)"** — checks `listSecretCards`'s `inGame` flag for the purple card flips from `true` to `false` once
   the lobby crosses the 24h `LOBBY_HOLD_MS` threshold without dropping the card. This directly exercises the
   generalized `cardHolders`/`holdsCard` logic for `'bomoh'`.

### Updated test (required by Step 5, not a Dato test)

`describe('setup settings and the packing list', ...)`: the test `'forces Bomoh off while it is not built'`
asserted the exact behavior Step 5 is required to remove. Renamed to `'lets Bomoh be turned on alongside Dato Seri,
now that its cards exist'` and changed its assertion from `bomoh === 'off'` to
`legendaries === { dato: 'stash', bomoh: 'stash' }`. This is the only existing test whose assertion changed, and it
documents Bomoh-specific (not Dato-specific) behavior that the brief explicitly mandates changing in Step 5.

### TDD Evidence

**RED** — after adding only the test changes (before any implementation change):

```
npm test -- actions.test
```
Result: `Tests  4 failed | 285 passed (289)`. The 4 failures were exactly the new/changed tests:
- `lets Bomoh be turned on alongside Dato Seri...` — `settingsFrom` still forced `bomoh: 'off'`.
- `retiring a lobby's purple card...` — `second!.card!.id` equaled `first.id` (nothing was reassigned: old
  `cardHolders` only ever checked `dato_stash`, so `lobbyHolding` found no holder for a purple card and
  `retireSecretCard` never touched the lobby's `bomoh_stash`).
- `reprinting a dropped lobby's purple card...` — the stash's `lat`/`lng` stayed at the dropped coordinates (same
  root cause: `lobbyHolding` found no holder, so `reprintSecretCard` never touched it).
- `an expired lobby's unused purple card is freed...` — `inGame` was `false` even while actively held (old
  `cardHolders` never looked at `bomoh_stash` at all, so a purple card never showed as held, before or after
  expiry).

All 285 pre-existing (unmodified) Dato/other tests still passed, confirming the RED tests failed for the intended
reason and nothing else broke yet.

**GREEN** — after implementing Steps 4–5:

```
npm run typecheck   # tsc -b && tsc -p api/tsconfig.json — clean, no errors
npm test -- actions.test
```
Result: `Tests  289 passed (289)`. All pre-existing Dato tests pass **unmodified**, and all 3 new Bomoh tests plus
the 1 required Step-5 test update pass.

```
npm test            # full suite
```
Result: `Test Files  81 passed (81)`, `Tests  1166 passed (1166)`.

```
npm run lint
```
Result: only pre-existing warnings in unrelated files (React hooks/purity warnings in `src/`, and two pre-existing
`no-unused-vars` warnings in `store.ts`/`actions.test.ts` unrelated to this change); nothing new introduced by this
change.

## Files changed

- `app/api/_lib/actions.ts` — the generalization described above.
- `app/api/_lib/actions.test.ts` — new Bomoh admin-flow tests, and the one required Step-5 test update.

## Self-review

- **Completeness**: every function named in the brief's Files list (`secretLettersFor`, `expiredLobby`,
  `holdsCard`, `isDropped`, `cardHolders`, `freeDatoCard`→`freeCard`, `stashOn`, `releaseDatoCard`→`releaseCard`,
  `wantsDatoCard`→`wantsCard`, `assignFreeCard`, `reassignDatoCard`→`reassignCard`, `recheckExpiredLobby`,
  `settleLobbyCard`, `needsRecheck`, `retireSecretCard`, `reprintSecretCard`, `settingsFrom`) was generalized or
  fixed as specified.
- **Discipline (YAGNI)**: did not touch `create`, `dropDatoSeri`, `claimDato`, or `setMode`'s Dato-only wiring
  beyond passing `'dato'` explicitly at their existing call sites to the now-parameterized functions — wiring
  Bomoh into those is explicitly a later task. Did not touch `kit.ts` (`SECRET_PLACE_IDS` still `['dato']`; tests
  write `kit.placed.bomoh` directly via `store.setKitKey` rather than through `setKit`, since that's correctly
  still out of scope). Did not touch `store.ts`/`supabaseStore.ts` (Tasks 1–3's job, already done).
- **Did I weaken or rewrite any existing Dato test assertion to force a pass?** No. I checked the full diff of
  `actions.test.ts`: the only existing test whose assertion changed is `'forces Bomoh off while it is not built'`,
  which is a **Bomoh**-behavior test (not a Dato test) whose premise the brief's Step 5 explicitly requires
  invalidating (Bomoh can now be turned on). Every Dato-specific test byte is untouched; I ran the diff to confirm
  this explicitly (`git diff api/_lib/actions.test.ts`) and verified no Dato assertion lines appear in the diff.
- **A gap I noticed but left alone (correctly out of scope)**: `MemoryStore.unfinishedGames` (in `store.ts`, not
  modified by this task) pre-filters candidate games with a hardcoded check
  `typeof g.dato_stash?.lat === 'number'` to decide whether an old-but-dropped lobby should still be considered.
  This means a *dropped* purple card on an old (>24h) lobby wouldn't be found by `cardHolders('bomoh')` the same
  way a dropped yellow card is. This is a latent store.ts gap for a future task (dropping Bomoh cards doesn't
  exist yet anyway), not something this task's brief asked me to touch, and I designed the new Bomoh expiry test
  to use an *undropped* card (matching the existing `unfinishedGames` behavior) to avoid relying on or being
  blocked by it.

## Concerns

None blocking. The one deliberate, out-of-scope item noted above (the `unfinishedGames` dropped-card pre-filter
being Dato-specific) should be flagged for whichever later task wires up `dropBomoh`, since it will need a small
`store.ts` fix (checking both `dato_stash?.lat` and `bomoh_stash?.lat`) to correctly keep an old, dropped Bomoh
lobby's card from being drawn by a new game.
