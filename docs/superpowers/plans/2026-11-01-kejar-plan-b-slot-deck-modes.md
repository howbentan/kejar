# Plan B: one power-up slot, the shared deck, Core's four power-ups, and the Core/Full switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players hold **one** power-up at a time, and the slot stays busy while its effect runs. Station claims draw the **top card of their side's shared deck** instead of a random roll. Mat Rempit is one at a time team-wide, with a 3-minute cooldown. The organiser picks **Core** (Durian, Ponteng, Mat Rempit, Pak Guard) or **Full** when creating a game. Power-ups show their Malaysian names.

**Architecture:**
- **The deck is derived, not stored card by card.** A new pure module `app/shared/deck.ts` builds each side's deck from the mode and the number of sets, and shuffles it deterministically per round (seeded by game id, side and round).
- **Card n comes from a counter.** The server atomically increments a per-side draw counter on the game row and takes card number n from the derived deck. Two claims at the same moment always get different numbers.
- **One-slot and Mat Rempit rules are pure functions** in `app/shared/powerups.ts`, used by the `claim` and `usePowerup` actions.
- **The mode is a new game setting.**
- **One deliberate simplification of power-ups §5b:** when a round runs out, the next round reshuffles the **full** mix. Cards still held in players' slots aren't held back, as the spec says they should be. With one slot per player, at most a few cards are affected, and it avoids storing per-card state. The owner can revisit this after playtests.
- **Internal kind names don't change:** `decoy` (Gostan), `shield` (Durian), `cloak` (Ponteng), `flare` (Mat Rempit), `focus` (Pak Guard). Only the display names change, so no data migration is needed for existing rows.

**Tech Stack:** Vite 8, React 19, TypeScript, Vitest, Testing Library; `GameStore` (`MemoryStore` / `SupabaseStore`); Supabase migrations run by the owner.

**Spec:**
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: §5a one slot, §5b shared deck, §6.1 renamed set, §7 wording;
- `docs/superpowers/specs/2026-10-30-kejar-rules.md`: §1 modes, §3 what each mode includes and Core's deck counts, §6 plain English. This doc wins conflicts.
- Copy for refusals: `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §7.

**Out of scope (later plans):**
- Toyol, Ah Long and Abang Grab (Plan D adds them to the Full deck);
- the lucky-dip animation, the slot screen and doodle stickers (Plan C);
- the organiser's five-step setup (Plan E).

Until Plan D, **Full's deck is the Full counts minus the three cards that don't exist yet** (see Task 1).

## Global Constraints

- **Brand:** Volt `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3`; Geist and Geist Mono.
- **Infrastructure:** free tiers only, one `api/game.ts` function.
- **Migration:** `supabase/migrations/0010_deck.sql`, run by the owner in Supabase **before merging to `main`**.
- **Plain English on screen** (rules §6). Power-up names stay Malaysian: **Gostan, Durian, Ponteng, Mat Rempit, Pak Guard.**
- **Durian has no head start** (power-ups §6.1). The chaser's screen copy changes accordingly.
- **Deck counts, per 10 runners or 5 chasers, rounded up, minimum one set** (rules §3, power-ups §5b):
  - Core runners: Durian ×3, Ponteng ×3. Core chasers: Mat Rempit ×2, Pak Guard ×2.
  - Full runners (until Plan D): Gostan ×2, Durian ×2, Ponteng ×2. Full chasers (until Plan D): Mat Rempit ×2, Pak Guard ×2.
- **Mat Rempit cooldown:** 3 minutes after each surprise ping is revealed, team-wide.
- **The mode defaults to `core`.** Games created before this change have no `settings.mode`; read a missing mode as `'core'`.
- Preserve each file's line endings. `npm test` and `npm run typecheck` green before every commit. Never commit `New Text Document.txt`, `app/.env.local` or `graphify-out/`.

## Review Focus

1. **Two claims at different stations in the same instant** must draw different cards. The draw counter is incremented atomically. (Task 2 store test, Task 3 actions test.)
2. **Running out of deck:** after the last card, the next draw starts a freshly shuffled round of the same mix, and the count shows the full deck again. (Task 1.)
3. **Games started before the deploy** have null set counts and no mode. Claims must still work: default to Core, and compute sets from the current roles. (Task 3.)
4. **Slot timing edges:** Ponteng used 5 s before a reveal frees the slot at that reveal. A Durian that blocks a catch frees the slot at once. A Mat Rempit's slot frees when its own surprise ping is revealed, even if a scheduled ping came first. (Task 3.)
5. **A refused Mat Rempit** (pending or cooling down) is not spent, and the player is told when it's ready. (Task 4.)

---

### Task 1: The deck, as pure functions

**Files:**
- Create: `app/shared/deck.ts`
- Create: `app/shared/deck.test.ts`

**Interfaces:**
- Produces:
  - `type Side = 'runner' | 'chaser'`; `type Mode = 'core' | 'full'`;
  - `SET: Record<Mode, Record<Side, PowerUpKind[]>>` with the counts in Global Constraints;
  - `setsFor(side: Side, players: number): number`: `max(1, ceil(players / (side === 'runner' ? 10 : 5)))`;
  - `deckFor(mode: Mode, side: Side, sets: number): PowerUpKind[]`: the set repeated `sets` times;
  - `cardAt(seed: string, deck: PowerUpKind[], index: number): PowerUpKind`. Round `r = floor(index / deck.length)` is a Fisher–Yates shuffle of `deck` driven by a small seeded PRNG (e.g. mulberry32) seeded with `hash(\`${seed}:${r}\`)` from `./geo.js`. It returns that round's card at `index % deck.length`.
  - `cardsLeft(deckLength: number, draws: number): number`: `deckLength - (draws % deckLength)`. It shows the full deck again right after a round ends.

- [ ] **Step 1: Write the failing tests**
  - `setsFor('runner', 14) === 2`, `setsFor('runner', 0) === 1`, `setsFor('chaser', 3) === 1`, `setsFor('chaser', 6) === 2`.
  - `deckFor('core', 'runner', 2)` has six `shield` and six `cloak`. `deckFor('full', 'runner', 1)` has two each of `decoy`, `shield`, `cloak`. Core chasers have two `flare` and two `focus` per set.
  - **One round is exactly the deck:** for a deck of 6, the multiset of `cardAt(seed, deck, 0..5)` equals the deck.
  - **The next round is a reshuffle:** `cardAt(seed, deck, 6..11)` is again exactly the deck.
  - **Deterministic:** the same seed and index give the same card. Different seeds give a different order for at least one index across 20 seeds.
  - `cardsLeft(6, 0) === 6`, `cardsLeft(6, 5) === 1`, `cardsLeft(6, 6) === 6`.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/deck.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `app/shared/deck.ts`.
- [ ] **Step 4:** Run: `cd app && npx vitest run shared/deck.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: shared deck per side as pure functions`.

### Task 2: The mode setting, deck counters and sets

**Files:**
- Create: `supabase/migrations/0010_deck.sql`
- Modify:
  - `app/shared/types.ts`: `Settings.mode: 'core' | 'full'`, with `DEFAULT_SETTINGS.mode = 'core'`; `Game` gains optional `runner_sets?: number | null`, `chaser_sets?: number | null`, `runner_draws?: number`, `chaser_draws?: number`;
  - `app/api/_lib/actions.ts`: `settingsFrom` validates `mode`; `start` stores the set counts;
  - `app/api/_lib/store.ts` and `app/api/_lib/supabaseStore.ts`: `drawCard`; `GAME_COLUMNS` adds the four columns.
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `GameStore.drawCard(gameId: string, side: 'runner' | 'chaser'): Promise<number>` atomically increments that side's counter and returns the **previous** value (0 for the first draw).
- **Migration 0010:**
  - `alter table games add column runner_draws int not null default 0, add column chaser_draws int not null default 0, add column runner_sets int, add column chaser_sets int;`
  - `create function draw_card(p_game uuid, p_side text) returns int`: one `update games set runner_draws = runner_draws + (p_side = 'runner')::int, chaser_draws = chaser_draws + (p_side = 'chaser')::int where id = p_game returning (case when p_side = 'runner' then runner_draws else chaser_draws end) - 1`. Use a header comment in the style of `0005_safety.sql`.
- **`start`** sets `runner_sets = setsFor('runner', runners)` and `chaser_sets = setsFor('chaser', chasers)` from the confirmed roles.

- [ ] **Step 1: Write the failing tests**
  - **`store.test`:** two `drawCard` calls for the runner side return 0, then 1. The chaser side starts at 0 independently. `Promise.all` of 5 draws returns `{0,1,2,3,4}` (no repeats).
  - **`supabaseStore.test`:** `drawCard` calls the `draw_card` RPC with `{ p_game, p_side }`, following the existing `resume_game` RPC test.
  - **`actions.test`:**
    - `create` with `settings: { mode: 'full' }` stores `mode: 'full'`, and with no mode stores `'core'`;
    - `mode: 'party'` → 400 `Unknown game mode`;
    - after `start` with 2 runners and 1 chaser, the game row has `runner_sets: 1, chaser_sets: 1`.
- [ ] **Step 2:** Run: `cd app && npx vitest run api/_lib/store.test.ts api/_lib/supabaseStore.test.ts api/_lib/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, including migration 0010.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: Core/Full mode setting and atomic deck draw counters`.

### Task 3: Claims draw from the deck, and one slot

**Files:**
- Modify: `app/shared/powerups.ts`: replace `HAND_MAX` with `slotBusy`; `judgeClaim` takes `pings`; delete `pickPowerUp` and `RUNNER_KINDS` / `CHASER_KINDS` if unused
- Modify: `app/api/_lib/actions.ts`: the `claim` action
- Test: `app/shared/powerups.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `deckFor`, `setsFor`, `cardAt`, `Mode` (Task 1); `drawCard` and the game's sets (Task 2).
- Produces:
  - `slotBusy(powerUps: PowerUp[], playerId: string, pings: Ping[], now: number): { kind: PowerUpKind; running: boolean } | null`. A card is busy when:
    - it's **unused** (`running: false`);
    - **`shield`** is used, `consumed_at === null` and `now - used_at < SHIELD_MS`;
    - **`decoy` / `cloak` / `focus`** is used and no ping with `seq > 0` and `revealed` has `reveal_at > used_at`;
    - **`flare`** is used and no ping with `seq >= BONUS_SEQ_BASE`, `revealed`, and `alert_at >= used_at` exists.
  - `judgeClaim`'s input gains `pings: Ping[]`. `'hand-full'` is returned whenever `slotBusy` isn't null, with `busyKind: PowerUpKind` and `busyRunning: boolean` on the judgement.
  - **The claim action:**
    1. `side` comes from the claimer's role.
    2. `sets` is the game's stored `<side>_sets`, or `setsFor(side, current players of that role)` when null (games started before this deploy).
    3. `mode` is `game.settings.mode ?? 'core'`.
    4. `index = await store.drawCard(game.id, side)`, then `kind = cardAt(\`${game.id}:${side}\`, deckFor(mode, side, sets), index)`.
    5. Only then call `claimStation`.

- [ ] **Step 1: Write the failing tests**
  - **`powerups.test` — `slotBusy`:**
    - an unused card is busy and not running;
    - Ponteng used at T, with a revealed ping at T+5 s → free; with no reveal yet → busy and running;
    - Durian used and consumed → free; used 11 min ago → free; used 2 min ago → busy and running;
    - Mat Rempit used at T, with a scheduled ping revealed at T+10 s but its bonus ping (alert T) not yet revealed → busy; after the bonus ping is revealed → free.
  - **`powerups.test` — `judgeClaim`:** with an unused card → `{ ok: false, reason: 'hand-full', busyKind, busyRunning: false }`.
  - **`actions.test`:**
    1. **Core only:** in a Core game, a runner's six claims (each at a fresh station, waiting out locks; or by seeding `store` power-ups to reset) only ever give `shield` or `cloak`, and a chaser's only `flare` or `focus`.
    2. **Following the deck:** the first claim in a game equals `cardAt(\`${gameId}:runner\`, deckFor('core', 'runner', 1), 0)`.
    3. **One slot:** a second claim while holding an unused card → `hand-full`, and the deck counter isn't advanced.
    4. **Different stations at the same instant:** `Promise.all` of two runners claiming two different stations gives indices 0 and 1 (check `runner_draws === 2`).
    5. **Old games:** a game whose `runner_sets` is null still claims successfully.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/powerups.test.ts api/_lib/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. **Check the slot before drawing, so a refused claim never spends a card.** A claim that fails at `claimStation` after drawing (a lost race) burns that card; record it as a ruling.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass. Update older tests that relied on a hand of 3 or on `pickPowerUp`'s random roll to the new rules, keeping their intent.
- [ ] **Step 5:** Commit: `feat: claims draw the top card of the side's deck, one slot per player`.

### Task 4: Mat Rempit, one at a time with a 3-minute team cooldown

**Files:**
- Modify: `app/shared/powerups.ts`: `FLARE_COOLDOWN_MS = 3 * 60_000` and `flareBlocked(pings: Ping[], now: number): { reason: 'flare-pending' } | { reason: 'flare-cooldown'; readyInMs: number } | null`
- Modify: `app/api/_lib/actions.ts`: `usePowerup` checks `flareBlocked` for `flare` after the existing `too-late` check and **before** `markUsed`
- Test: `app/shared/powerups.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: the `usePowerup` refusals `{ ok: false, reason: 'flare-pending' }` and `{ ok: false, reason: 'flare-cooldown', readyInMs }`. The power-up stays unused.

- [ ] **Step 1: Write the failing tests**
  - **`powerups.test` — `flareBlocked`:**
    - a bonus ping not yet revealed → `flare-pending`;
    - the last bonus ping revealed 60 s ago → `flare-cooldown` with `readyInMs === 120_000`;
    - revealed 3 min ago → null; no bonus pings → null.
  - **`actions.test`:**
    - **Ben's Mat Rempit works; Lee's straight after** (a second chaser added to the game) → `flare-pending`, and Lee's card is still unused.
    - **After Ben's surprise ping reveals:** Lee at +60 s → `flare-cooldown`; at +3 min → ok.
- [ ] **Step 2:** Run the two files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: Mat Rempit is one at a time with a 3-minute team cooldown`.

### Task 5: Names, copy, deck count and the busy slot on screen

**Files:**
- Modify:
  - `app/src/game/PowerUpHand.tsx`: names, effects, refusal copy, deck count, busy state;
  - `app/src/screens/ChaserChase.tsx`: the `shielded` copy;
  - `app/shared/views.ts`: feed lines; `View.deckLeft`; `View.activePowerUp`.
- Test: `app/src/game/PowerUpHand.test.tsx`, `app/src/screens/ChaserChase.test.tsx`, `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `cardsLeft`, `deckFor`, `setsFor` (Task 1); `slotBusy` (Task 3); the reasons from Tasks 3 and 4.
- Produces:
  - `View.deckLeft: number | null`: for a runner or chaser, `cardsLeft(deckFor(mode, side, sets).length, <side>_draws ?? 0)`, with the same null-sets fallback as Task 3; `null` for marshals.
  - `View.activePowerUp: PowerUpKind | null`: `slotBusy(...)?.kind` when `running`.

**Exact copy:**
- **Names and effects (`INFO`):**
  - `decoy`: **Gostan** · `Your next ping shows you somewhere else` · used: `Gostan set for your next ping`
  - `shield`: **Durian** · `Blocks the next catch, up to 10 min` · used: `Durian on for up to 10 min`
  - `cloak`: **Ponteng** · `You skip the next ping` · used: `Ponteng: you'll skip the next ping`
  - `flare`: **Mat Rempit** · `Extra ping in 30 s` · used: `Mat Rempit! Dikejar check in now`
  - `focus`: **Pak Guard** · `Dikejar within 75 m show exactly` · used: `Pak Guard on for the next ping`
- **Refusals:**
  - `hand-full`: unused → `Your slot is full. Use your {name} first, then come back.`; running → `Your {name} is still working. Come back when it's done.`
  - `locked`: `This station is cooling down. Ready in m:ss.` (use the existing `lockedForMs`)
  - `too-far`: `Get within 30 m of the station.`
  - `already-claimed`: `You've used this station this game. Try another one.`
  - `flare-pending`: `Another Mat Rempit is already on its way.`
  - `flare-cooldown`: `Mat Rempit is ready again in m:ss.`
  - `too-late`: `Too late for Mat Rempit.`
- **The chaser's `shielded` message:** `Durian! That catch doesn't count. Hand the tag back.`
- **Feed** (`used` and `shielded`):
  - `flare` → `A Kejar used Mat Rempit — extra ping in 30 s`
  - `focus` → `A Kejar used Pak Guard`
  - `shielded` → `` `${tag} blocked a catch with Durian` ``
- **Deck count line** in `PowerUpHand`: `DECK · {n} LEFT` (Geist Mono, eyebrow style), shown during the chase.
- **Busy slot:** when `activePowerUp` is set and the hand is empty, show `{name} is working` in the slot.

- [ ] **Step 1: Write the failing tests**
  - `views.test`: `deckLeft` after two runner draws in a one-set Core game is 4; null for a marshal; the three feed lines word for word; `activePowerUp` for a used Durian.
  - `PowerUpHand.test`: each name and refusal string above; `DECK · 4 LEFT`; `Durian is working`.
  - `ChaserChase.test`: the `shielded` string.
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass. Update older tests asserting the old names and copy.
- [ ] **Step 5:** Commit: `feat: Malaysian power-up names, deck count and busy slot on screen`.

### Task 6: The Core/Full switch for the organiser, and the mode badge

**Files:**
- Modify: `app/src/screens/HostNew.tsx` (settings), `app/src/screens/HostLobby.tsx`, `app/src/screens/Lobby.tsx`
- Test: `app/src/screens/HostNew.test.tsx`, `app/src/screens/HostLobby.test.tsx`, `app/src/screens/Lobby.test.tsx`

**Interfaces:**
- Consumes: `Settings.mode` (Task 2).
- **The settings control:** `Pills` labelled `Game` with `Core` (default) and `Full`. The line under it changes:
  - Core: `The chase, check-ins and Penjara, plus 4 simple power-ups. Best for first-timers.`
  - Full: `Everything in Core, plus Gostan and more power-ups as they arrive. For regulars.`
  - `create` sends `settings.mode`.
- **The badge** in both lobbies, next to the code: `CORE` or `FULL` (Geist Mono, lime outline). A missing mode shows `CORE`.

- [ ] **Step 1: Write the failing tests**
  - `HostNew`: picking Full sends `settings: { …, mode: 'full' }`. The default sends `'core'`.
  - Both lobbies show the right badge for each mode, and `CORE` when the mode is missing.
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: organiser picks Core or Full; lobbies show the mode`.

### Task 7: Hand-off

- [ ] In `docs/HANDOFF.md`, record what shipped and that **the owner must run `supabase/migrations/0010_deck.sql` in Supabase before this reaches `main`**: claims call the `draw_card` function, and every claim fails without it. Commit (`docs: Plan B hand-off`).
