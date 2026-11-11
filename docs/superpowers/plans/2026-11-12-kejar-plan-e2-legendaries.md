# Plan E2: one legendary per side, Super Ring and Mak Kau Hijau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full games get at most one runner legendary (Dato Seri or Super Ring) and one chaser legendary (Bomoh or Mak Kau Hijau), picked by the app. The two new legendaries are built as the spec describes.

**Architecture:** Internally the game keeps one `'off' | 'stash'` value per legendary (`legendaries: { dato, bomoh, ring, hijau }`), so all of today's per-legendary card machinery (`stashOf`, `freeCard`, `settleLobbyCard`, `holdsCard`, kit, walk) just gains two more kinds. The organiser's per-side switch is translated into that shape when a game is created or the mode is switched to Full. Super Ring is a `ring` power-up row plus a `players.arrest` record. Every route into Penjara goes through one new helper, `jailOrArrest`. Mak Kau Hijau is a `games.hijau` record. With no server tick, `advance()` sends its push and judges its deadline on any poll, the same way it handles pings.

**Tech Stack:** TypeScript, React 19 + Motion, Vitest, Supabase Postgres (plpgsql), Vercel function `api/game.ts`.

**Spec:** `docs/superpowers/specs/2026-11-12-kejar-new-powerups-design.md` (§6, plus §5.1 freeze blocking the Mak Kau Hijau stash).

**Depends on:** Plan E1 merged (`frozenForMs`, `COMBO_EXCLUDED`, migration 0019).

## Global Constraints

- Everything in Plan E1's Global Constraints applies. This plan's migration is `0020_legendaries.sql`.
- Legendaries are never named to players or marshals before they're found. The hint zone's colour is the only difference players see. Only the organiser's own views and the organiser-only print link carry a secret card's code, letter or stash spot.
- Colours: Dato Seri yellow (existing tokens), Bomoh purple (existing tokens), **Super Ring cheese orange**, **Mak Kau Hijau deep green**. The green must read clearly apart from Volt lime `#C6FF3D`, and the orange apart from Dato Seri's yellow. Add `--ring-1/2/3/-ink` and `--hijau-1/2/3/-ink` to `tokens.css`, with the same structure as `--bomoh-*`.
- Numbers (spec §6): house arrest **2:36** (`ARREST_MS = 156_000`), circle **26 m** (`ARREST_RADIUS_M = 26`), **60 s** to open Kejar after a non-catch route (`ARREST_OPEN_MS = 60_000`), release fix no older than **20 s**, fixes worse than **50 m** ignored (`LUAR_GARISAN_MAX_ACCURACY_M`). Mak Kau Hijau **45 s** (`HIJAU_MS = 45_000`), push needs **25 s** of warning (reuse `fairlyWarned` from fair-play §1.1).
- Copy is exactly as in the spec where it's quoted. Everything else follows the copy rules (English, light Malaysian twist, no em-dashes).

## Review Focus

1. **A runner under house arrest stops sending fixes (pockets the phone).** At 2:36 there's no fix from the last 20 s, so they go to Penjara (Task 4 test).
2. **The game is paused during house arrest or during Mak Kau Hijau's 45 s.** Both clocks move later by the pause length (Task 1 resume test, plus a Task 4 and a Task 5 action test).
3. **Nobody polls for minutes during Mak Kau Hijau** (all phones locked). The first poll after the deadline judges it exactly once, against the recorded push time. Taps after the deadline don't count (Task 5 test).
4. **No free card of the picked colour.** The app falls back to the other legendary on that side, and with neither free it follows R9 (Task 2 test).
5. **Mak Kau Hijau puts the last free runners in Penjara.** The 60 s final whistle runs, and a marshal's `Phone problem: undo` during it calls the whistle off (Task 5 test).

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/0020_legendaries.sql` | Create: widen `secret_cards.legendary` and `powerups_kind_check` (`ring`), add `games.ring_stash`, `games.hijau_stash`, `games.hijau`, `players.arrest`, functions `claim_ring`, `claim_hijau`, `claim_hijau_push`, `claim_hijau_settle`, `start_arrest`/`end_arrest`, `steal_card` excluding `ring`, and `resume_game` shifting `arrest` and `hijau` |
| `app/shared/types.ts` | `LegendaryKind` (moved here, exported), `Settings.legendaries`, `RingStash`, `HijauStash`, `HijauRun`, `Arrest`, `Player.arrest`, `PowerUpKind 'ring'`, events |
| `app/shared/legendaries.ts` | Create: side pairs, `pickLegendaries`, `legendariesFromSides`, `sidesOf` |
| `app/shared/ids.ts` | `ringQr`, `isRingQr`, `ringCodeFromQr`, `hijauQr`, `isHijauQr`, `hijauCodeFromQr` |
| `app/shared/arrest.ts` | Create: house-arrest rules (pure) |
| `app/shared/hijau.ts` | Create: Mak Kau Hijau timing rules (pure) |
| `app/shared/catch.ts`, `powerups.ts`, `kit.ts`, `views.ts` | Arrest refusal and locks, ring slot rules, kit items, zones and view fields |
| `app/api/_lib/store.ts`, `supabaseStore.ts` | New store methods |
| `app/api/_lib/actions.ts` | Settings, create/setMode picking, `claim` for the two new QRs, `jailOrArrest`, `advance` hooks, `location` hook, `touchGreen` action, `undoKejar` for arrests, flare refusal |
| `app/src/...` | HostNew per-side switch, print cards, zones, house-arrest screen, the green takeover, Jail copy, stickers |
| `docs/...` | Rules doc, HANDOFF |

---

### Task 1: Data model, migration and store methods

**Files:**
- Create: `supabase/migrations/0020_legendaries.sql`
- Modify: `app/shared/types.ts`, `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`

**Interfaces:**
- Produces (types):
  - `export type LegendaryKind = 'dato' | 'bomoh' | 'ring' | 'hijau'` in `types.ts`. Delete the local copy in `actions.ts`.
  - `Settings.legendaries: { dato: 'off' | 'stash'; bomoh: 'off' | 'stash'; ring: 'off' | 'stash'; hijau: 'off' | 'stash' }`. `DEFAULT_SETTINGS.legendaries = { dato: 'stash', bomoh: 'off', ring: 'off', hijau: 'off' }`. Readers spread defaults over stored values, as `kit.ts` already does.
  - `RingStash` and `HijauStash` have the same shape as `BomohStash`. They're stored on `games.ring_stash` and `games.hijau_stash`.
  - `HijauRun = { claimedBy: string; claimedAt: string; startsAt: string; deadline: string; sentAt: string | null; settledAt: string | null; tapped: string[] }` on `games.hijau`.
  - `Arrest = { firedAt: string; route: 'catch' | 'auto-jail' | 'hijau'; by: string | null; center: LatLng | null; startedAt: string | null; ringId: string; catchEventId: string | null }` on `players.arrest` (null when not arrested). `center`/`startedAt` are null while waiting for the runner to open Kejar.
  - `PowerUpKind` gains `'ring'`.
  - `EventType` gains `'arrested'` (target: runner, data: `{ route }`), `'arrest-ended'` (target: runner, data: `{ outcome: 'free' | 'revoked' | 'undone' }`), `'ring-locked'` (actor: chaser, target: runner), `'hijau'` (data: `{ deadline }`), `'hijau-done'` (data: `{ jailed: number; void: boolean }`).
- Produces (store, both implementations):
  - `claimRing(gameId: string, playerId: string): Promise<PowerUp | null>`: mirrors `claimDato`, but the card kind is `ring`.
  - `claimHijau(gameId: string, playerId: string, run: Omit<HijauRun, 'claimedBy' | 'claimedAt' | 'sentAt' | 'settledAt' | 'tapped'>): Promise<boolean>`: marks `hijau_stash` claimed and writes `games.hijau`, both in one atomic step. Only one caller wins.
  - `claimHijauPush(gameId: string, atIso: string): Promise<boolean>`: sets `hijau.sentAt` once.
  - `tapHijau(gameId: string, playerId: string, atIso: string): Promise<boolean>`: adds the player to `hijau.tapped` only if `atIso < hijau.deadline` and they aren't already in it.
  - `claimHijauSettle(gameId: string, atIso: string): Promise<HijauRun | null>`: sets `settledAt` once and returns the run, otherwise null.
  - `startArrest(playerId: string, arrest: Arrest): Promise<boolean>`: only if `arrest` is null and the player isn't jailed.
  - `updateArrest(playerId: string, patch: Partial<Arrest>): Promise<void>`
  - `endArrest(playerId: string, firedAt: string): Promise<boolean>`: clears `arrest` only if its `firedAt` matches. Only one caller wins.
  - `stealFrom` never takes a `ring` card, just as it never takes `dato`.
  - `resumeGame` moves `arrest.startedAt` (or `firedAt` while waiting) and `hijau.startsAt`/`hijau.deadline` later by the pause, using the same "only times after `paused_at`" rule as `final_whistle_at`.

- [ ] **Step 1: Write the failing MemoryStore tests** in `store.test.ts`. Cover each method's "once" behaviour: two `claimHijauPush` calls give `true, false`; a `tapHijau` at or after the deadline is false; `endArrest` with a stale `firedAt` is false. Add the resume shift test: arrest started at T0+1min, paused T0+2min to T0+3min, so `startedAt` becomes T0+2min. Add the hijau deadline shift test the same way.
- [ ] **Step 2: Run them and check they fail.** `cd app && npx vitest run api/_lib/store.test.ts`: FAIL.
- [ ] **Step 3: Implement the types and the MemoryStore methods.**
- [ ] **Step 4: Write `0020_legendaries.sql`.** Mirror each method, following `claim_dato`/`claim_bomoh` in `0011` and `0015`. Copy `resume_game` from its latest definition (it may have changed in `0019`) and add the two shifts. Add the `ring` exclusion to `steal_card` next to the existing `dato` one.
- [ ] **Step 5: Add the SupabaseStore wrappers.** Add `arrest` to `PLAYER_COLUMNS`. The three new `games` columns come back through the existing `select('*')`. Add a wrapper test for each, following `supabaseStore.test.ts`.
- [ ] **Step 6: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0020_legendaries.sql app/shared/types.ts app/api/_lib
git commit -m "feat: data model for Super Ring, Mak Kau Hijau and per-side legendaries"
```

---

### Task 2: One legendary per side, picked by the app (setting, cards, kit, print)

**Files:**
- Create: `app/shared/legendaries.ts`
- Modify: `app/shared/ids.ts`, `app/shared/kit.ts`, `app/api/_lib/actions.ts` (`settingsFrom`, `create`, `setMode`, `secretLettersFor`, notices), `app/src/screens/HostNew.tsx`, `app/src/screens/PrintCard.tsx`, the kit page (`/host/kit`) component, `app/src/game/Map.tsx` (`Pin.tone`), `app/src/styles/tokens.css` (or wherever `--bomoh-*` live)
- Test: `app/shared/legendaries.test.ts`, `app/shared/kit.test.ts`, `app/api/_lib/actions.test.ts`, `app/src/screens/HostNew.test.tsx`

**Interfaces:**
- Produces (`legendaries.ts`):
  - `SIDE_PAIRS = { runner: ['dato', 'ring'], chaser: ['bomoh', 'hijau'] } as const`
  - `type SideSwitch = { runner: 'off' | 'on'; chaser: 'off' | 'on' }`
  - `sidesOf(l: Settings['legendaries']): SideSwitch`: a side is on if either of its pair is `stash`.
  - `pickLegendaries(sides: SideSwitch, rng: () => number): Settings['legendaries']`: for each side that's on, one of its pair is `stash` at random, and everything else is `off`.
  - `fallbackFor(kind: LegendaryKind): LegendaryKind`: the other one in its pair.
- Produces (`ids.ts`): `ringQr(code)` → `KEJAR:RING:<code>`, `hijauQr(code)` → `KEJAR:HIJAU:<code>`, plus `is…Qr` and `…CodeFromQr` with the same regexes as the Bomoh ones.
- Behaviour:
  - `settingsFrom` accepts the organiser's `legendarySides: SideSwitch` (the new HostNew field). It turns it into `legendaries` with `pickLegendaries(sides, ctx.rng)`. A request that still sends the old `legendaries` shape is read through `sidesOf` first, so the side is what counts and the app still picks.
  - `create` and `setMode` (to Full) run the existing per-legendary card assignment for whichever two kinds are `stash`. **Fallback:** if `assignFreeCard` finds no card for the picked kind but its `fallbackFor` has one, switch the setting to the fallback and assign that card. With neither free, keep the picked kind and follow R9 as today. `setMode` Full → Core → Full re-picks.
  - Notices: add `NO_FREE_RING_CARD_NOTICE = 'Reprint an orange card to use Super Ring.'` and `NO_FREE_HIJAU_CARD_NOTICE = 'Reprint a green card to use Mak Kau Hijau.'`, used exactly where the yellow and purple notices are used now.
  - `drop` actions: add `dropRing` and `dropHijau` mirroring `dropBomoh` (organiser only, Full only, lobby only).
  - `kit.ts`: `SecretLetters` gains `ring` and `hijau`. `packItems` and `placeItems` add the orange and green secret steps exactly as for Bomoh (organiser only, never counted in a marshal's `OF N`).
  - Kit page and `PrintCard`: each organisation gets four secret sets (A to C each), with the orange and green cards made on first read as the yellow and purple ones are.
  - HostNew Legendary cards setting: two rows, `Dikejar legendary` and `Kejar legendary`, each Off/On (defaults: Dikejar On, Kejar Off). The help line is `The app secretly picks which one. You'll see which card to hide.`
  - The organiser's lobby view names the picked legendaries (the organiser hides them). No player or marshal view does.

- [ ] **Step 1: Write the failing tests**
  - `legendaries.test.ts`: `pickLegendaries` with both sides on gives exactly one `stash` per pair, over a seeded run of 50 picks hitting both members of each pair. With a side off, both of its pair are `off`. `sidesOf` reads old `{ dato: 'stash', bomoh: 'off' }` as `{ runner: 'on', chaser: 'off' }`.
  - Actions: `create with both sides on assigns one card per side and names them in the organiser view only`. `no free orange card falls back to a free yellow one` (Review Focus 4). `neither free: R9 notice`. `Full → Core → Full re-picks and re-assigns`. `a marshal's and a player's view never carry ring or hijau names, codes or spots`.
  - Kit: `placeItems for the organiser lists the orange step when ring is stash; a marshal's never does`.
  - HostNew: `sends legendarySides`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS. Existing tests that send `legendaries: { dato, bomoh }` keep working through `sidesOf`. Update any whose assertions depend on the old fixed choice to seed `rng` or check either member of the pair.
- [ ] **Step 5: Commit**

```bash
git add app supabase
git commit -m "feat: one legendary per side, picked by the app, with orange and green cards"
```

---

### Task 3: Finding the two new stashes

**Files:**
- Modify: `app/api/_lib/actions.ts` (`claim`, new `claimRing`, `claimHijau`), `app/shared/powerups.ts`, `app/shared/views.ts`
- Test: `app/api/_lib/actions.test.ts`, `app/shared/powerups.test.ts`

**Interfaces:**
- Consumes: `claimRing`, `claimHijau` (store), `frozenForMs`, `hijauStartsAt` (Task 5; until then pass `startsAt = now`, and Task 5 replaces it).
- Produces:
  - `judgeRingClaim` (runner, free, slot empty: same as `judgeDatoClaim`). `judgeHijauClaim` (chaser, not frozen: same as `judgeBomohClaim` plus E1's `frozen` refusal).
  - `claim` routes `isRingQr` and `isHijauQr` the way it routes the Bomoh QR, with the shared 3-missed-scans limit (`stashMisses` tagged `data.legendary`). A Luar Garisan player gets `Nothing here.` The feed line is `Something legendary was found.`
  - On a Super Ring claim: a `ring` row in the slot (unused). Reply `{ ok: true, kind: 'ring' }`. Private copy: `Super Ring! Next time you'd go to Penjara, it's house arrest instead.`
  - On a Mak Kau Hijau claim: `games.hijau` is written (Task 5 fills in the timing). Reply `{ ok: true, kind: 'hijau' }`.
  - `slotBusy`: an unused `ring` row is busy (`running: false`). A used `ring` row is running while the player's `arrest` is set. `usePowerup` on `ring` refuses `{ ok: false, reason: 'automatic' }`. `COMBO_EXCLUDED` adds `'ring'`.
  - Views: `ringZone` and `hijauZone` (the same shape and fuzz as `bomohZone`, 100 to 200 m, seeded with the secret seed). `ringZone` is shown to runners and chasers, like Dato Seri's. `hijauZone` is shown to runners and chasers, like Bomoh's. Each is null once claimed.
- [ ] **Step 1: Write the failing tests:** the first free runner within reach claims Super Ring. A chaser can't claim Super Ring, and a runner can't claim Mak Kau Hijau. A full slot refuses Super Ring with `hand-full`. A frozen chaser can't claim Mak Kau Hijau (`frozen`). The wrong-scan limit applies. Toyol can't take a `ring` card. Zones appear and then disappear once claimed. A Luar Garisan player gets `Nothing here.`
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat: hidden stashes for Super Ring and Mak Kau Hijau"
```

---

### Task 4: Super Ring's house arrest

**Files:**
- Create: `app/shared/arrest.ts`
- Modify: `app/shared/catch.ts`, `app/api/_lib/actions.ts` (`jailOrArrest`, `catchAction`, `advance`, `location`, `undoKejar`), `app/shared/views.ts`
- Test: `app/shared/arrest.test.ts`, `app/api/_lib/actions.test.ts` (new `describe('Super Ring')`)

**Interfaces:**
- Produces (`arrest.ts`, pure):
  - `ARREST_MS = 156_000`, `ARREST_RADIUS_M = 26`, `ARREST_OPEN_MS = 60_000`, `ARREST_FIX_FRESH_MS = 20_000`
  - `arrestEndsAt(a: Arrest): number | null`: `startedAt + ARREST_MS`, or null while waiting.
  - `usableFix(p: Position): boolean`: accuracy ≤ `LUAR_GARISAN_MAX_ACCURACY_M`.
  - `insideArrest(a: Arrest, p: Position): boolean`: distance to `center` ≤ `ARREST_RADIUS_M + accuracy_m`.
  - `releaseVerdict(a: Arrest, latest: Position | null): 'free' | 'revoked'`: free only if `latest` is usable, no older than `ARREST_FIX_FRESH_MS` before the end, at or before the end, and inside.
- Produces (actions):
  - `async function jailOrArrest(ctx: Ctx, game: Game, runner: Player, by: Player | null, route: Arrest['route'], catchEventId: string | null): Promise<'jailed' | 'arrested'>`. If the runner holds an unused `ring` row: `markUsed` it, then `startArrest`.
    - On a catch, the arrest has `center` = the runner's fix if it's ≤20 s old, otherwise the chaser's fix, and `startedAt = now`. Add the `ring-locked` event (actor chaser, target runner).
    - On other routes, `center`/`startedAt` are null, and push `Super Ring! Open Kejar within 60 s to start house arrest.`
    - Add the `arrested` event either way. Otherwise call `store.catchRunner(runner.id, by?.id ?? null)` as today. Every current `catchRunner` call that sends a runner to Penjara (the catch in `catchAction`, auto-jail in `advance`) goes through it.
  - `judgeCatch` gains `ringLocks: { chaserId: string; runnerId: string }[]` (from `ring-locked` events) → `{ ok: false, reason: 'ring-locked' }` for that pair forever. A runner with `arrest` set → `{ ok: false, reason: 'arrest' }`. Neither refusal records anything.
  - Catch reply copy (chaser): on the catch that fires it, `Super Ring! You can't catch {name} again this game. Hand the tag back.` Later, `ring-locked` gets `Super Ring! You can't catch {name} again this game.` and `arrest` gets `House arrest. Can't catch them right now.`
  - `location`: when the sender has an `arrest`:
    - Waiting with a usable fix → `updateArrest(center = fix, startedAt = now)`.
    - Started with a usable fix outside → `endArrest`, then `catchRunner`, push `Bail revoked. To Penjara.`, and `arrest-ended { outcome: 'revoked' }`.
    - Before the game ends, run `allOutCheck` after a revoke.
  - `advance`: for each arrested runner:
    - Waiting past `firedAt + ARREST_OPEN_MS` → `endArrest` and `catchRunner` (Super Ring spent).
    - Past `arrestEndsAt` → judge with `releaseVerdict` on their latest fix at or before the end. `free` → `endArrest`, push `Free! Super Ring is spent.`; `revoked` → Penjara as above.
    - Paused games are skipped.
  - `undoKejar`: also accepts the `eventId` of an `arrested` event with `route: 'catch'` while that arrest is live. It ends the arrest (`arrest-ended { outcome: 'undone', firedAt }`), lifts the lock, and gives the `ring` card back (`used_at: null`). The lock is lifted by the reader: `ring-locked` events carry `data.firedAt`, and `catchAction` builds `ringLocks` leaving out any lock whose `firedAt` has a matching `arrest-ended` with `outcome: 'undone'`. The marshal view lists live catch arrests where it lists undoable catches today.
  - Views:
    - Chasers don't see a runner with `arrest` set: no dot, no "never checked in" note.
    - `View.arrest: { endsAt: number | null; center: LatLng | null; openBy: number | null } | null` for the arrested runner.
    - Feed for everyone: `Something legendary saved a Dikejar.` (on `arrested`).
- [ ] **Step 1: Write the failing tests**
  - `arrest.test.ts`: `releaseVerdict` free inside with a fresh fix. Revoked outside. Revoked with a 21 s old fix (Review Focus 1). Revoked with a 60 m accuracy fix. Revoked with no fix.
  - Actions:
    - `a catch on a Super Ring holder puts them under house arrest, not Penjara`: `jailed` is false, `arrest` is set, and the chaser's reply carries the lock line.
    - `the catching chaser can never catch them again; another chaser can after release`.
    - `nobody can catch them during house arrest`.
    - `chasers don't see them on the map`.
    - `stays inside with Kejar open for 2:36: free, ring spent, and they don't use their freed-once`.
    - `steps outside early: Penjara at once`.
    - `stops sending fixes: Penjara at 2:36` (Review Focus 1).
    - `paused for 1 min during house arrest: release comes 1 min later` (Review Focus 2).
    - `auto-jail with Super Ring: push to open Kejar; first fresh fix starts it there; no fix in 60 s means Penjara`.
    - `undo kejar on the arrest ends it, lifts the lock and gives Super Ring back`.
    - `the game ends during house arrest: they count as free (Dikejar win if nobody else is free)`.
    - `Luar Garisan still applies during house arrest`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat: Super Ring's house arrest instead of Penjara"
```

---

### Task 5: Mak Kau Hijau

**Files:**
- Create: `app/shared/hijau.ts`
- Modify: `app/api/_lib/actions.ts` (`claimHijau`, `advance`, new `touchGreen` action registered in `actions`, `usePowerup` flare refusal), `app/shared/views.ts`, `app/api/game.ts` if action names are listed there
- Test: `app/shared/hijau.test.ts`, `app/api/_lib/actions.test.ts` (new `describe('Mak Kau Hijau')`)

**Interfaces:**
- Produces (`hijau.ts`, pure):
  - `HIJAU_MS = 45_000`
  - `hijauStartsAt(claimedAt: number, windows: { alertAt: number; revealAt: number }[]): number`: the earliest moment ≥ `claimedAt` such that `[t, t + HIJAU_MS]` overlaps no check-in window (scheduled 45 s or Mat Rempit 30 s windows, alert to reveal). Loop: while some window overlaps `[t, t + 45 s]`, set `t` to that window's `revealAt`.
  - `hijauCounts(run: HijauRun, mode: Settings['checkinMode']): boolean`: `fairlyWarned(sentAt, deadline, mode)`.
  - `hijauTargets(players: Player[]): Player[]`: runners who are free, not Luar Garisan, not removed and not under house arrest.
- Produces (actions):
  - `claimHijau` computes `startsAt` with `hijauStartsAt` from the game's scheduled windows and pending bonus pings. `deadline = startsAt + HIJAU_MS`. A `startsAt` past the game's end means the card does nothing: claim it, then settle it as void at once (Claude's call: it can't run).
  - `usePowerup` refuses Mat Rempit with `{ ok: false, reason: 'hijau-running' }` from claim until settle, so no new window can appear inside the 45 s.
  - `advance`:
    - When `now ≥ startsAt` and `sentAt` is null, run `claimHijauPush` then push to `hijauTargets` in one batch: `{ type: 'hijau', code, deadline }`, with the notification body `Mak kau hijau! Tap the green in 45 s or go to Penjara.` Add the `hijau` event.
    - When `now ≥ deadline`, run `claimHijauSettle`. If `hijauCounts` is false, add `hijau-done { void: true, jailed: 0 }` and nobody is jailed. Otherwise every target not in `tapped` goes through `jailOrArrest(ctx, game, p, null, 'hijau', null)`. A jailed one gets an `auto-jailed` event with `data.cause: 'hijau'`, so the existing auto-jail screen and the marshals' `Phone problem: undo` (`undoAutoJail`) work unchanged. Then add `hijau-done { void: false, jailed: n }` and run `allOutCheck(ctx, game, 'hijau')`.
    - Paused games are skipped. `resumeGame` already shifted the times (Task 1).
  - `touchGreen` action: body `{ code, token }`. Requires a free runner listed in `hijauTargets`. Calls `tapHijau(game.id, me.id, iso(now))` and replies `{ ok: true }`, or `{ ok: false, reason: 'too-late' }` once the deadline has passed.
  - Views:
    - `View.hijau: { startsAt: number; deadline: number; tapped: boolean } | null`, for runners in `hijauTargets` while the run is unsettled, from `startsAt`.
    - Chasers get a feed line instead.
    - Feed: on `hijau`, chasers see `Mak kau hijau! Dikejar have 45 s.` and runners see `Mak kau hijau! Tap the green.` (act: true). On `hijau-done` (not void), everyone sees `Mak kau hijau: {n} Dikejar to Penjara.` On void, chasers see `Mak kau hijau fizzled. The alert went out too late.`
    - A runner who tapped sees `Safe! You touched green.`
  - `allOutCheck`'s `WhistleCause` gains `'hijau'`. The final-whistle line for it is `No Dikejar left free! Final whistle in 60 s.` (the non-catch wording).
- [ ] **Step 1: Write the failing tests**
  - `hijau.test.ts`: `hijauStartsAt` with no windows is the claim time. With an open window it's that window's reveal. With a window opening 20 s after the claim, it's that window's reveal. With back-to-back windows it chains.
  - Actions:
    - `claiming it pushes every free runner once and jails those who don't tap in 45 s`: Aina taps, Hafiz doesn't. Hafiz is jailed with `auto-jailed` `data.cause: 'hijau'`; Aina is free.
    - `a tap after the deadline doesn't count` and `nobody polls until 3 minutes later: judged once, same result` (Review Focus 3).
    - `push went out late (first poll 30 s after start): void, nobody jailed`.
    - `a runner with push turned off is not immune`.
    - `Super Ring holder who misses gets house arrest instead`.
    - `Luar Garisan, jailed and arrested runners are left out`.
    - `Mat Rempit is refused while it runs`.
    - `paused during the 45 s: the deadline moves by the pause` (Review Focus 2).
    - `jails the last free runners: final whistle; Phone problem undo during the 60 s calls it off` (Review Focus 5).
    - `claimed during a check-in window: starts when it closes`.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat: Mak Kau Hijau, tap green in 45 s or go to Penjara"
```

---

### Task 6: Screens, art and docs

**Files:**
- Modify: `app/src/game/stickerArt.ts`, `app/src/game/Map.tsx` (zone colours), `app/src/game/PowerUpHand.tsx` (ring slot), `app/src/game/powerInfo.ts` (`ring` entry), `app/src/screens/RunnerChase.tsx`, `app/src/screens/Jail.tsx` (Mak Kau Hijau wording on the auto-jailed variant), `app/src/screens/GameScreen.tsx` (route to the arrest screen), `app/src/screens/MarshalLive.tsx` (undo on live catch arrests), the legendary card component used for Dato Seri and Bomoh (`PowerCard.tsx` / `LuckyDip.tsx`), `app/src/game/CheckinBanner.tsx` style reference, `docs/superpowers/specs/2026-10-30-kejar-rules.md`, `docs/HANDOFF.md`
- Create: `app/src/screens/HouseArrest.tsx`, `app/src/game/HijauTakeover.tsx`
- Test: `HouseArrest.test.tsx`, `HijauTakeover.test.tsx`, `Map.test.tsx`, `Jail.test.tsx`, `GameScreen.test.tsx`, `MarshalLive.test.tsx`

**Interfaces:**
- Consumes: `View.arrest`, `View.hijau`, `View.ringZone`, `View.hijauZone`, `touchGreen`.
- Produces:
  - `HouseArrest({ view })`:
    - Shows the 26 m circle on the map with the runner's own dot, and the countdown `m:ss` frozen while paused. It says `House arrest: stay within 26 m for 2:36.` and `Keep Kejar open.`
    - While waiting, it says `Open Kejar to start house arrest` with the 60 s count.
    - Bail revoked goes to the normal Penjara screen. Release shows `Free! Super Ring is spent.` and returns to the chase screen.
    - `GameScreen` routes to it when `view.arrest` is set (before the chase screen).
    - It keeps a Screen Wake Lock (reuse `useWakeLock`) and sends location the way the chase screen does.
  - `HijauTakeover({ view, onTap })`:
    - A full-screen takeover on the runner chase screen while `view.hijau && !view.hijau.tapped`. It says `Mak kau hijau!`, has one large deep-green button `Tap the green` and a 45 s countdown to `deadline`. A tap calls `touchGreen`.
    - On success it says `Safe! You touched green.` On `too-late` it shows nothing new (the Penjara screen follows on the next poll).
    - The service worker's notification click for `type: 'hijau'` opens `/g/{code}`.
  - Legendary card faces for `ring` (cheese orange) and `hijau` (deep green), with the Dato Seri/Bomoh structure: gradient face, foil, glow and sticker art. Super Ring is a cheese ring and Mak Kau Hijau a green leaf with a playground hand.
  - `Map.tsx`: `ringZone` in orange and `hijauZone` in green, unlabelled, like the existing yellow and purple zones. `Pin.tone` adds `'orange' | 'green'` for the walk.
  - `INFO.ring = { name: 'Super Ring', effect: "Next time you'd go to Penjara: house arrest instead", used: 'Super Ring is on' }`. The slot shows it with no Use button, like Dato Seri's `Use it at Penjara`, reading `ON · WAITING`.
  - Jail auto-jailed variant: when the event's `cause` is `hijau`, the heading line reads `Mak kau hijau got you.` and the struck-out check-ins list is hidden.
  - Marshal live view: live catch arrests are listed with `Undo kejar`, the same as catches.
- [ ] **Step 1: Write the failing component tests:**
  - The takeover shows with a countdown and calls `touchGreen` once. It hides after `tapped`.
  - HouseArrest shows the countdown, and the waiting state shows `Open Kejar to start house arrest`.
  - GameScreen routes to HouseArrest when `arrest` is set.
  - Map draws the orange and green zones.
  - Jail shows the Mak Kau Hijau line for `cause: 'hijau'`.
  - The marshal view offers `Undo kejar` on a live catch arrest.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement the UI.** Mock the takeover, the house-arrest screen and the two legendary cards first, as static HTML in `docs/superpowers/mockups/2026-11-12-new-legendaries/` in the existing motion style, then build to match.
- [ ] **Step 4: Update the docs.** Rules doc §3: replace the Dato Seri and Bomoh rows with "one legendary per side, picked by the app" and add both new legendaries. Add §4 lines for house arrest (26 m, 2:36, 60 s to open Kejar) and Mak Kau Hijau (45 s, 25 s warning rule). Rules §5a printed kit: four secret colour sets. HANDOFF: status entry, `run supabase/migrations/0020_legendaries.sql before merging`, and a reminder to print orange and green cards.
- [ ] **Step 5: Run the suite and the type check.** `cd app && npm test && npx tsc -b`: PASS.
- [ ] **Step 6: Check it in the browser.** Screenshot the takeover, the house-arrest screen, both legendary cards and the zones in the dev preview, using `testView.ts` fixtures where `/api` isn't available locally.
- [ ] **Step 7: Commit**

```bash
git add app/src docs
git commit -m "feat: house arrest screen, the green takeover, legendary cards and docs"
```
