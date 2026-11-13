# Plan E3: the endgame (Bomba, Hang Hebat, PKP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game with an endgame switched on rolls one at start, keeps it secret, and reveals it on every phone at its moment: Bomba (faster pings and an exact last call), Hang Hebat (one wanted runner decides the game) or PKP (Penjara closes, stations give ×2).

**Architecture:** One pure module, `app/shared/endgame.ts`, holds every endgame rule (the roll, when it's due, who is wanted, Bomba's times, masking). The roll is stored server-side on `games.endgame` at start, like `deck_seed`. `pingTimes` reads it for Bomba's schedule, so ping rows and auto-jail need no new machinery. With no server tick, `advance()` claims the reveal once on any poll, the same way it claims `5 minutes left!`. Hang Hebat hooks the three whistle functions (`allOutCheck`, `settleWhistle`, `callOffWhistle`) and `computeResults`. PKP adds one "closed" check in front of every way out of Penjara and a twin on station claims. Views mask the endgame until its reveal, so nothing reaches a client early.

**Tech Stack:** TypeScript, React 19 + Motion, Vitest, Supabase Postgres (plpgsql), Vercel function `api/game.ts`.

**Spec:** `docs/superpowers/specs/2026-11-13-kejar-endgame-design.md` (approved 2026-11-13). Mockup: `docs/superpowers/mockups/2026-11-13-endgame/` (logo SVGs in `live/main.tsx`, the `LOGO` record).

**Depends on:** Plan E2 merged (migration 0020, `jailOrArrest`, `penjaraLockLeft`, `applyCombo`, `COMBO_EXCLUDED`).

## Global Constraints

- Everything in Plan E1's and E2's Global Constraints applies. This plan's migration is `0021_endgame.sql`. It's safe to run again: one transaction, every step guarded.
- Endgame keys in code: `'bomba' | 'hebat' | 'pkp' | 'banjir'`. `banjir` is never rolled and its switch is always `'off'` (a "Coming soon" row in setup).
- **The secret:** no view, feed line, push, ping time, settings field or API answer lets any client (players, marshals or the organiser) learn the endgame before `games.endgame.revealedAt` is set. Only the on/off switches in `settings.endgames` are visible, and only to the organiser, as today's settings are.
- Times (spec §6.3, §7.1): reveal at **10 min left** (Bomba, Hang Hebat) and **5 min left** (PKP), on the chase clock with pauses. Bomba reveals at **8, 6, 5, 4, 3, 2** minutes left, then the **last call at 1**. Every Bomba ping is a scheduled ping with the usual **45 s** alert.
- Colours (spec §6.4): Bomba `#E63946` with black ink, Hang Hebat `#F1E3C3` with ink `#3A2410`, PKP `#FF5FA2` with black ink, Banjir Kilat `#3D8BFD`. Add `--bomba`, `--hebat`, `--hebat-ink`, `--pkp` and `--banjir` to `tokens.css`.
- Copy is exactly the spec's where it's quoted (titles `bomba!`, `hang hebat!`, `pkp!`, the rule cards and lines in §7–§9, "DIKEHENDAKI · HANG HEBAT", "You're wanted.", "Penjara is closed (PKP)", "Last call!"). Everything else follows the copy rules: English, a light Malaysian twist, no em-dashes.
- Older games (no `settings.endgames`) are read as all off and never get an endgame.

## Review Focus

1. **Nobody polls across the 10-minute mark** (every phone locked). The first poll after it reveals exactly once, before it sends any Bomba alert, and a Bomba alert already overdue is skipped as stale, as today (Task 4 test).
2. **A pause straddles the reveal moment.** The reveal moves later by the pause, never goes out while paused, and Bomba's times shift with it (Task 3 and Task 4 tests).
3. **Hang Hebat's wanted runner goes out by a route other than a catch** (auto-jail on a missed Bomba ping, Mak Kau Hijau, Luar Garisan, Super Ring house arrest). Each one blows the whistle, and the result is a Kejar win (Task 5 test, one case per route).
4. **A teammate frees the wanted runner during the 60 s hold** (a rescue, the reel, Settle). The whistle isn't called off and the Kejar still win. Only `undoKejar` or `undoAutoJail` brings the bounty back (Task 5 test).
5. **A runner's view before the reveal in a Bomba game** shows the same `nextRevealAt`, check-in banner and feed as a game with no endgame (Task 3 test comparing the two views).

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/0021_endgame.sql` | Create: `games.endgame jsonb`; functions `claim_endgame_reveal`, `claim_bounty`, `clear_bounty`, `set_wanted` |
| `app/shared/endgame.ts` | Create: every endgame rule, pure |
| `app/shared/types.ts` | `EndgameKind`, `EndgameState`, `Settings.endgames`, `Game.endgame`, events `'endgame'` and `'wanted'` |
| `app/shared/clock.ts` | `pingTimes` gains Bomba's schedule and a `lastCall` flag |
| `app/shared/results.ts` | Hang Hebat's winner rule |
| `app/shared/views.ts` | Mask the endgame; `View.endgame`; wanted dot; last-call dots; feed lines; PKP reveal replaces the plain 5-left line |
| `app/shared/howToPlay.ts` | One "Endgame" card for both sides |
| `app/api/_lib/store.ts`, `supabaseStore.ts` | `claimEndgameReveal`, `claimBounty`, `clearBounty`, `setWanted`, `addTwin`; `endgame` in game columns |
| `app/api/_lib/actions.ts` | `settingsFrom` endgames; `start` rolls; `advance` reveal; whistle, `finish`, undo and `removePlayer` hooks; PKP checks in `jailbreak`, `settleRescue`, `pullReel`, `settle`; ×2 in `claim` |
| `app/src/game/EndgameLogo.tsx`, `EndgameTakeover.tsx`, `EndgameChip.tsx`, `WantedPoster.tsx` | Create: the logos, the takeover, the chip and the poster |
| `app/src/screens/GameScreen.tsx`, `RunnerChase.tsx`, `ChaserChase.tsx`, `MarshalLive.tsx`, `Jail.tsx`, `Results.tsx`, `HostNew.tsx`, `src/game/Map.tsx`, `SettlePanel.tsx`, `tokens.css` | Mount, chip, wanted ring, closed copy, results line, setup switches, colours |
| `docs/superpowers/specs/2026-10-30-kejar-rules.md`, `docs/HANDOFF.md` | The endgame section; status |

---

### Task 1: Endgame types and pure rules

**Files:**
- Create: `app/shared/endgame.ts`, `app/shared/endgame.test.ts`
- Modify: `app/shared/types.ts`, `app/api/_lib/actions.ts` (`settingsFrom` only)
- Test: `app/shared/endgame.test.ts`, `app/api/_lib/actions.test.ts` (settings cases)

**Interfaces:**
- Produces (types, in `types.ts`):
  - `export type EndgameKind = 'bomba' | 'hebat' | 'pkp' | 'banjir'`
  - `export interface EndgameState { kind: EndgameKind; revealedAt: string | null; wanted: string | null; bountyAt: string | null }`. `wanted` is a player id (Hang Hebat only). `bountyAt` is when the wanted runner went out, cleared only by an undo.
  - `Settings.endgames?: { bomba: 'on' | 'off'; hebat: 'on' | 'off'; pkp: 'on' | 'off'; banjir: 'off' }`. `DEFAULT_SETTINGS.endgames = { bomba: 'on', hebat: 'on', pkp: 'on', banjir: 'off' }`. A stored game without it is read as all off.
  - `Game.endgame?: EndgameState | null`
  - `EventType` gains `'endgame'` (data: `{ kind: EndgameKind; wanted?: string; who?: string }`) and `'wanted'` (the bounty passed on; target: the new wanted runner, data: `{ who }`).
- Produces (`endgame.ts`):
  - `ENDGAME_LEFT_MS: Record<Exclude<EndgameKind, 'banjir'>, number>` = `{ bomba: 10 * MINUTE_MS, hebat: 10 * MINUTE_MS, pkp: 5 * MINUTE_MS }`
  - `BOMBA_LEFT_MIN = [8, 6, 5, 4, 3, 2, 1] as const` (the last one is the last call)
  - `endgamesOf(s: Settings): NonNullable<Settings['endgames']>`: the stored switches, or all off when absent.
  - `rollEndgame(s: Settings, rng: () => number): EndgameKind | null`: Core gives `'bomba'` if its switch is on, else null. Full picks uniformly from the switched-on kinds except `banjir`, or null if none.
  - `revealDue(game: Game, now: number): boolean`: true when `game.endgame` exists, `revealedAt` is null, the game is chasing, not paused, no final whistle pending, not ended, and `endsAt - now <= ENDGAME_LEFT_MS[kind]`. Same shape as `fiveLeftDue`.
  - `revealed(game: Pick<Game, 'endgame'>, kind?: EndgameKind): boolean`: `revealedAt` is set, and the kind matches when one is given.
  - `hebatLive(game): boolean`: `revealed(game, 'hebat') && !!game.endgame!.wanted`
  - `pkpClosed(game): boolean`: `revealed(game, 'pkp')`
  - `wantedOut(p: Player): boolean`: `isOut(p) || !!p.arrest`
  - `pickWanted(players: Player[], events: GameEvent[], chaseStart: number, except?: string): Player | null`: among runners not out, not removed and not under house arrest (and not `except`), the one whose free stretch started earliest. A stretch starts at `chaseStart`, or at their latest release: `countRestartAt(p, events)` from `checkins.ts` covers both Penjara and house arrest. An undone catch never moved `freed_at`, so it needs nothing extra. Ties go to the lowest `tag_id`.
  - `maskEndgame<G extends Pick<Game, 'endgame'>>(game: G): G`: the same game with `endgame: null` unless revealed.

- [ ] **Step 1: Write the failing tests** in `endgame.test.ts`:
  - `rollEndgame`: Core with Bomba on → `'bomba'`; Core with Bomba off → null; Full with only `pkp` on → `'pkp'`; Full all off → null; Full never returns `'banjir'` (1,000 rolls with a seeded rng); old settings without `endgames` → null.
  - `revealDue`: a Bomba game at 10:01 left → false, at 10:00 → true, paused at 9:00 → false, already revealed → false, final whistle pending → false; PKP at 5:01 → false, at 5:00 → true; a 15-minute chase with a 5-minute pause during hiding is due at nominal 10 left plus 5 min.
  - `pickWanted`: never caught beats freed at minute 3; freed at minute 3 beats freed at minute 6; a runner under house arrest, a jailed runner, a disqualified one and a removed one are skipped; a tie goes to `tag_id` 4 over 9; `except` skips that id; nobody eligible → null.
  - `maskEndgame` strips an unrevealed endgame and keeps a revealed one.
- [ ] **Step 2: Run and see them fail.** `cd app && npx vitest run shared/endgame.test.ts`: FAIL (module not found).
- [ ] **Step 3: Add the types and implement `endgame.ts`** with the signatures above.
- [ ] **Step 4: Parse the switches in `settingsFrom`.** Accept `endgames` with each of `bomba`, `hebat` and `pkp` set to `'on'` or `'off'`, and force `banjir: 'off'`. Anything else throws `ActionError(400, 'Unknown endgame setting')`. In Core, store `hebat` and `pkp` as `'off'`. Only the four keys are stored. Add `actions.test.ts` cases: the default is all three on; Core keeps only Bomba's value; `banjir: 'on'` is stored as `'off'`; a bad value is a 400.
- [ ] **Step 5: Run and see them pass.** `cd app && npx vitest run shared/endgame.test.ts api/_lib/actions.test.ts -t "endgame|settings"`: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(endgame): types, switches and pure rules"`

### Task 2: Migration and store methods

**Files:**
- Create: `supabase/migrations/0021_endgame.sql`
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`

**Interfaces:**
- Consumes: `EndgameState` (Task 1).
- Produces (both stores; the SQL functions are `service_role` only, like 0020's):
  - `games.endgame` is read and written through `updateGame` and listed in `GAME_COLUMNS`. Views never send it as is (Task 7).
  - `claimEndgameReveal(gameId: string, atIso: string, wanted: string | null): Promise<boolean>`: sets `revealedAt` (and `wanted`) only if `endgame` exists, `revealedAt` is null and the game hasn't ended. True for the first caller.
  - `claimBounty(gameId: string, atIso: string): Promise<boolean>`: sets `bountyAt` only if it's null and the game hasn't ended. True for the first caller.
  - `clearBounty(gameId: string): Promise<void>`
  - `setWanted(gameId: string, playerId: string | null): Promise<void>`
  - `addTwin(powerUpId: string): Promise<PowerUp | null>`: creates the twin of a card exactly as `applyCombo` does, but without consuming a combo. Null if the card is unknown or already has a twin. Factor the shared twin-building into one helper inside each store.

- [ ] **Step 1: Write the failing MemoryStore tests:**
  - two `claimEndgameReveal` calls give `true, false`; there's no reveal without an `endgame`, and none after the game ends;
  - `claimBounty` gives `true, false`, then `true` again after `clearBounty`;
  - `addTwin` gives a twin with `twin_of` set, and a second `addTwin` on the same card gives null.

  Mirror these in `supabaseStore.test.ts`'s RPC-shape tests, the way 0020's functions are tested.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run api/_lib/store.test.ts api/_lib/supabaseStore.test.ts`: FAIL.
- [ ] **Step 3: Write `0021_endgame.sql`** (column plus the four functions, `jsonb ||` patches as in 0020) and implement both stores.
- [ ] **Step 4: Run them and see them pass.** Same command: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(endgame): migration 0021 and store methods"`

### Task 3: Bomba's schedule and the secret ping times

**Files:**
- Modify: `app/shared/clock.ts`, `app/shared/views.ts`
- Test: `app/shared/clock.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `BOMBA_LEFT_MIN`, `ENDGAME_LEFT_MS`, `maskEndgame` (Task 1).
- Produces: `pingTimes(game, now?)` returns `{ seq; alertAt; revealAt; lastCall?: true }[]`. When `game.endgame?.kind === 'bomba'`:
  - keep the normal pings whose nominal alert falls before the nominal 10-minute mark;
  - then add one ping per `BOMBA_LEFT_MIN` entry at nominal `end - m * MINUTE_MS`, numbered on from the last kept seq;
  - `lastCall: true` goes on `m === 1`;
  - every time goes through `toWall`, as today.

  Without Bomba, the output is unchanged. `start` already inserts the ping rows from `pingTimes(started)`, so Bomba's rows exist from the start once Task 4 stores the roll before that insert.
- Produces (views): `viewFor` builds everything from `maskEndgame(i.game)` instead of `i.game`. Organiser views are masked too.

- [ ] **Step 1: Write the failing tests** in `clock.test.ts`:
  - 45-minute chase, `pingMin` 5, Bomba: reveals at 40, 35, 30, 25, 20, 15 and 10 minutes left (the 10-minute one is kept, since its alert at 10:45 comes before the mark), then 8, 6, 5, 4, 3, 2 and 1, with `lastCall` only on the last;
  - `pingMin` 3, Bomba: no normal ping whose alert is after 10:00 left survives;
  - a 2-minute pause at 20 minutes left moves every Bomba time 2 minutes later;
  - a `pkp` or `hebat` game gives exactly the no-endgame times.
- [ ] **Step 2: Write the failing view test (Review Focus 5)** in `views.test.ts`: at 12 minutes left, a runner's view of an unrevealed Bomba game and of the same game with `endgame: null` are deep-equal in `nextRevealAt`, `nextAlertAt`, `checkin` and `feed`.
- [ ] **Step 3: Run and see them fail.** `cd app && npx vitest run shared/clock.test.ts shared/views.test.ts`: FAIL.
- [ ] **Step 4: Implement** the Bomba branch in `pingTimes`, and the mask at the top of `fullView`.
- [ ] **Step 5: Run and see them pass.** Same command, plus `npx vitest run api/_lib/actions.test.ts -t "auto-jail"` to show auto-jail is unchanged: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(endgame): Bomba's ping schedule, hidden until the reveal"`

### Task 4: The roll, the reveal and the push

**Files:**
- Modify: `app/api/_lib/actions.ts` (`start`, `advance`)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `rollEndgame`, `revealDue`, `pickWanted` (Task 1); `claimEndgameReveal` (Task 2); `pingTimes` (Task 3).
- Produces:
  - `start` stores `endgame: { kind, revealedAt: null, wanted: null, bountyAt: null }` (or null) in the same `updateGame` as `deck_seed`, using `rollEndgame(settled.settings, ctx.rng)`. It builds the ping rows from a `started` object that already carries it.
  - `advance` runs a reveal step just before the `5 minutes left!` block:
    - if `revealDue`, pick the wanted runner (Hang Hebat only, via `pickWanted`), then `claimEndgameReveal`;
    - the winner posts an `'endgame'` event (with `wanted` and `who` for Hang Hebat) and pushes to every player: `{ type: 'notice', code, title: 'kejar.', body }`;
    - the body is `Endgame: Bomba!`, `Endgame: Hang Hebat! #07 Aina is wanted.`, or `5 minutes left · PKP!`;
    - a failed push never fails the poll.
  - When `game.endgame?.kind === 'pkp'` (the stored kind, server side), the `5 minutes left!` block still claims `five_warned_at` and posts `'five-left'`, but sends no push of its own. Both fall due at the same moment, and the reveal's push carries it.
  - **The last call's ping event:** in the reveal loop, a ping that `pingTimes` marks `lastCall` counts cloaked runners as seen (Ponteng doesn't hide them), and its `'ping'` event carries `lastCall: true`.
  - Hang Hebat with nobody eligible: the reveal is claimed with `wanted: null` and nothing else happens (`hebatLive` stays false).

- [ ] **Step 1: Write the failing action tests:**
  - `start` stores a roll: Full with only `hebat` on gives `'hebat'`;
  - a Bomba game's ping rows include Bomba's seqs;
  - Review Focus 1: no poll from 11:00 to 7:50 left, then one poll. It posts exactly one `'endgame'` event, before any ping alert, and the 8-minute alert, now stale, sends no push;
  - Review Focus 2: paused from 10:30 to 9:00 left (wall time); there's no reveal while paused, and the reveal comes 1:30 later than the unpaused one;
  - a PKP game at 5:00 left sends one push with the body `5 minutes left · PKP!`, and posts both a `'five-left'` and an `'endgame'` event;
  - two concurrent `state` polls at the moment give one event;
  - a Hang Hebat reveal names the never-caught runner over one freed at minute 4;
  - the last call's `'ping'` event has `lastCall: true` and counts a cloaked runner as seen.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run api/_lib/actions.test.ts -t "endgame"`: FAIL.
- [ ] **Step 3: Implement** the roll in `start` and the reveal step in `advance`.
- [ ] **Step 4: Run them and see them pass.** Same command: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(endgame): roll at start, reveal once on any poll"`

### Task 5: Hang Hebat's win rule

**Files:**
- Modify: `app/api/_lib/actions.ts` (`allOutCheck`, `settleWhistle`, `callOffWhistle`, `finish`, `undoKejar`, `undoAutoJail`, `removePlayer`), `app/shared/results.ts`
- Test: `app/api/_lib/actions.test.ts`, `app/shared/results.test.ts`

**Interfaces:**
- Consumes: `hebatLive`, `wantedOut`, `pickWanted` (Task 1); `claimBounty`, `clearBounty`, `setWanted` (Task 2).
- Produces:
  - `WhistleCause` gains `'bounty'`.
  - **`allOutCheck`:** while `hebatLive(game)`, it ignores the all-out test. If `bountyAt` is set or `wantedOut(wanted)`, it claims the bounty (if not yet), claims the final whistle, posts `'final-whistle'` with `{ cause: 'bounty' }`, and returns true. Otherwise it returns false.
  - **`callOffWhistle`:** while `hebatLive(game)` with `bountyAt` set, it leaves the whistle alone and returns true. This one change covers the reel, Settle and rescue paths that call it.
  - **`settleWhistle`:** while `hebatLive(game)`, if `bountyAt` is set, it finishes once the hold is over (never while paused). If not, it calls off as today.
  - **`computeResults`:** when `hebatLive(game)`, `winner` is `'chasers'` if `bountyAt` is set, else `'runners'`. The other awards are unchanged. `finish` already uses it.
  - **Undo:** `undoKejar` and `undoAutoJail` call `clearBounty` when the runner they free is `endgame.wanted`, before their existing whistle call-off.
  - **Removal:** `removePlayer` on the wanted runner, with no `bountyAt`, picks the next one with `pickWanted(..., except: removed.id)`, calls `setWanted`, posts `'wanted'`, and pushes `Hang Hebat: #12 Ravi is now wanted.` to everyone. With nobody left, it calls `setWanted(null)` and the normal rules apply again.

- [ ] **Step 1: Write the failing tests (Review Focus 3 and 4):**
  - With Hang Hebat live and three runners, a catch on a non-wanted runner gives no whistle. A catch on the wanted runner gives a `'bounty'` whistle, and 60 s later the game ends `winner: 'chasers'` with two runners still free.
  - The same ending comes from four other routes, one test each: auto-jail on two missed Bomba-style pings, Mak Kau Hijau jailing them, a Luar Garisan disqualification, and a Super Ring house arrest from a catch.
  - During the hold, a rescue frees the wanted runner and the reel frees another: the whistle stays, and the result is still a Kejar win.
  - `undoKejar` on the wanted runner's catch during the hold: no whistle, `bountyAt` is null, and the game goes on.
  - Time runs out with the wanted runner free and everyone else jailed: `winner: 'runners'`.
  - A Durian blocks the catch: no bounty.
  - Removing the wanted runner passes the bounty to the next longest-free runner, with a `'wanted'` event.
  - In `results.test.ts`, the winner rule both ways.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run api/_lib/actions.test.ts shared/results.test.ts -t "hang hebat|hebat"`: FAIL.
- [ ] **Step 3: Implement** the hooks above.
- [ ] **Step 4: Run the full server suite.** `cd app && npx vitest run api shared`: PASS. Today's whistle tests must pass unchanged.
- [ ] **Step 5: Commit.** `git commit -m "feat(endgame): Hang Hebat, the wanted runner decides the game"`

### Task 6: PKP closes Penjara and doubles stations

**Files:**
- Modify: `app/api/_lib/actions.ts` (`jailbreak`, `settleRescue`, `pullReel`, `settle`, `claim`)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `pkpClosed` (Task 1); `addTwin` (Task 2); `COMBO_EXCLUDED`.
- Produces:
  - **Refusals:** `jailbreak`, `pullReel` and `settle` return `{ ok: false, reason: 'penjara-closed' }` when `pkpClosed(fresh)`. Each check sits right after the paused check, before any verdict, and nothing is spent (Dato Seri isn't used, the reel isn't pulled).
  - **A live rescue:** `settleRescue` fails it at the next settle once PKP is revealed, posting the usual `'rescue-failed'` and freeing nobody.
  - **Undo still works:** a marshal's `undoKejar` and `undoAutoJail` aren't affected.
  - **Stations ×2:** in `claim`, when `pkpClosed(fresh)` and the drawn kind isn't in `COMBO_EXCLUDED`, the claim calls `addTwin(claimed.powerUp.id)` instead of `doubleIfCombo`, so a combo stays ready, and answers `{ ok: true, kind, double: true }`. An excluded kind goes through the normal `doubleIfCombo` path.

- [ ] **Step 1: Write the failing tests:**
  - with PKP revealed, a free runner's Penjara scan gets `penjara-closed` and no `'rescue-started'`;
  - a rescue started at 5:05 left fails at the 5:00 reveal;
  - a jailed runner's pull gets `penjara-closed` and the pull isn't spent;
  - Settle gets `penjara-closed` and Dato Seri stays unused;
  - an `undoKejar` still frees the runner;
  - a station claim gives a card plus its twin;
  - a combo-ready player gets exactly two goes and stays combo-ready;
  - a `COMBO_EXCLUDED` kind isn't doubled by PKP;
  - before the reveal, none of this applies.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run api/_lib/actions.test.ts -t "pkp"`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.** Same command: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(endgame): PKP closes Penjara and doubles station cards"`

### Task 7: What views carry

**Files:**
- Modify: `app/shared/views.ts`, `app/shared/howToPlay.ts`
- Test: `app/shared/views.test.ts`, `app/shared/howToPlay.test.ts`

**Interfaces:**
- Consumes: the masked game (Task 3); `hebatLive` (Task 1).
- Produces:
  - `View.endgame: { kind: EndgameKind; revealedAt: number; wanted: { id: string; label: string } | null; bountyCaught: boolean } | null`. It's null until the reveal, on every role, and null for a Hang Hebat reveal with no wanted runner. Jailed runners (Kejar's spectators) get it live like everyone else, because they're players. *(Plan call: spec §6.4's "after their delay" applies to the map; the takeover is a game event every player needs.)* `label` is `tagLabel` of the wanted runner. It's added to the `viewFor` removed-player blank list as `endgame: null`.
  - `MapDot.wanted?: true` on the wanted runner's dot in chaser, marshal and spectator views while `hebatLive`.
  - **The last call:** in `chaserDots`, when the latest revealed ping is the `lastCall` one from `pingTimes`, every free runner who isn't under house arrest gets `exact: true, revealedBy: 'lastcall'`, and Ponteng doesn't hide them. Gostan still moves the dot, as it does under Pak Guard. *(Plan call: the spec names only fuzz and Ponteng.)* `MapDot['revealedBy']` gains `'lastcall'`.
  - **Feed lines:**
    - `'endgame'` → `Endgame: Bomba.`, `Endgame: Hang Hebat. #07 Aina is wanted.` or `Endgame: PKP.`;
    - `'wanted'` → `#12 Ravi is now wanted.`;
    - a `'ping'` with `data.lastCall` → `Last call!`;
    - in a revealed PKP game the `'five-left'` line is dropped, since the `'endgame'` line says it.
  - **How to play:** one card at the end of both decks, `{ scene: 'endgame', headline: 'Endgame', line: 'Near the end, <b>something changes</b>. You\'ll find out when it happens.' }`, shown only when the game's `settings.endgames` has any switch on. Add `'endgame'` to `SceneId` with a placeholder scene (Task 8 draws it).

- [ ] **Step 1: Write the failing view tests:**
  - `endgame` is null at 10:01 left and set after the reveal, for a runner, a chaser, a marshal and the organiser;
  - the wanted dot is flagged in a chaser's view;
  - at the last call, a cloaked runner shows exact with `revealedBy: 'lastcall'`, and a runner under house arrest stays hidden;
  - the feed lines above;
  - in a PKP game there's no separate 5-left line;
  - in `howToPlay.test.ts`, the card shows only when any endgame is on.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run shared/views.test.ts shared/howToPlay.test.ts`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.** Same command: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(endgame): views carry the endgame from its reveal"`

### Task 8: The screens

**Files:**
- Create: `app/src/game/EndgameLogo.tsx`, `EndgameTakeover.tsx`, `EndgameChip.tsx`, `WantedPoster.tsx` and their `.test.tsx` files
- Modify: `app/src/screens/GameScreen.tsx`, `RunnerChase.tsx`, `ChaserChase.tsx`, `MarshalLive.tsx`, `Jail.tsx`, `Results.tsx`, `HostNew.tsx`, `app/src/game/Map.tsx`, `SettlePanel.tsx`, `HowToPlay.tsx`, `app/src/tokens.css`
- Test: the new component tests, plus `GameScreen.test.tsx`, `Jail.test.tsx`, `Results.test.tsx`, `HostNew.test.tsx`

**Interfaces:**
- Consumes: `View.endgame`, `MapDot.wanted`, `revealedBy: 'lastcall'`, reason `'penjara-closed'`, `Settings.endgames`.
- Produces:
  - **`EndgameLogo({ kind, size })`:** the four sticker SVGs, copied from the mockup's `LOGO` record. The mockup's key `jebat` becomes `hebat`.
  - **`ENDGAME_COPY`:** name, title, colour token, ink, rule and line per kind, taken from spec §7–§9.
  - **`EndgameTakeover({ view, onDone })`:** the mockup's `Reveal`, in full screen. For the wanted runner, the line is "You're wanted."; the button is **Got it**. It's shown once per game per phone, keyed in `localStorage` as `kejar:endgame-seen:<code>` (wrapped in try/catch, so it shows again if storage fails). It's mounted in `GameScreen` over every chase-phase screen (runner, chaser, Jail, house arrest, marshal).
  - **`EndgameChip({ view, onOpen })`:**
    - it goes on the status row of `RunnerChase`, `ChaserChase` and `MarshalLive`;
    - tapping it opens the rule card, or for Hang Hebat the `WantedPoster`;
    - the wanted runner's chip says "You".
  - **`WantedPoster({ view })`:** the mockup's poster, showing the armband number and name, "DIKEHENDAKI · HANG HEBAT" and the keris.
  - **`Map`:**
    - a dot with `wanted` gets a cream `--hebat` ring and a small poster pin;
    - `revealedBy: 'lastcall'` draws like an exact dot, with a red `--bomba` ring.
  - **Penjara closed:** `Jail` and `SettlePanel` show "Penjara is closed (PKP)" for `penjara-closed`, and the reel is greyed out while `view.endgame?.kind === 'pkp'`.
  - **`Results`:** a line in the endgame's colour, e.g. "Endgame: Hang Hebat. The bounty was caught." or "… got away."
  - **`HostNew`:** an `ENDGAME · SECRET FROM PLAYERS` block after the legendaries:
    - an On/Off `Seg` per endgame, with Banjir Kilat shown disabled as "Coming soon";
    - in Core, only Bomba's row;
    - it sends `endgames` in the settings.
  - **`HowToPlay`:** the `'endgame'` scene shows the four logos, small, behind a question mark.

- [ ] **Step 1: Write the failing component tests:**
  - the takeover shows the PKP title and rule, and doesn't show again after Got it on a re-render;
  - the wanted runner sees "You're wanted.";
  - the chip opens the poster for Hang Hebat;
  - the Jail screen with `penjara-closed` shows the closed copy and a disabled reel;
  - Results names the endgame;
  - HostNew in Core shows only Bomba, and sends `endgames: { bomba: 'off', ... }` when it's switched off.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run src`: FAIL on the new tests.
- [ ] **Step 3: Implement**, reusing `Sticker`, `Marker` and `Stamp` and the Mak Kau Hijau takeover's motion.
- [ ] **Step 4: Run them and see them pass, then typecheck.** `cd app && npx vitest run src && npm run typecheck`: PASS, no type errors.
- [ ] **Step 5: Check it in the app.** Start the dev server with `preview_start`. Get each kind with the MemoryStore's dev setup at 10:00 and 5:00 left, and screenshot the takeover, the chip, the poster and a closed Penjara at phone width.
- [ ] **Step 6: Commit.** `git commit -m "feat(endgame): takeover, chip, wanted poster, closed Penjara and setup switches"`

### Task 9: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-kejar-rules.md`, `docs/HANDOFF.md`, `docs/superpowers/specs/2026-11-13-kejar-endgame-design.md` (status line)

- [ ] **Step 1: Update the docs.**
  - **Rules doc:** add an "Endgame" section with the summary table from spec §6.3, plus one paragraph each for Bomba, Hang Hebat and PKP. Replace the "Endgame notes" rows in §9 and §11 with a pointer to the design.
  - **HANDOFF:** Plan E3 status, migration 0021 to run, and Banjir Kilat as the next design.
  - **Spec status:** "Built in Plan E3."
- [ ] **Step 2: Run the whole suite.** `cd app && npm test && npm run typecheck && npm run lint`: PASS.
- [ ] **Step 3: Commit.** `git commit -m "docs: the endgame in the rules and the handoff"`
