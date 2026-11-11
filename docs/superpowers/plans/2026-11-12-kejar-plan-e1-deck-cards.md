# Plan E1: three new deck cards (Cheese Ais, Nasi Lemak KFC, Tuch and Ga) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cheese Ais (runners), Nasi Lemak KFC (both decks) and Tuch and Ga (chasers) to Full mode's decks, enforced entirely by the server.

**Architecture:** Each card is a new `PowerUpKind` that flows through the existing claim → slot → `usePowerup` → `views.ts` path. Cheese Ais writes `players.frozen_until` through one atomic store call. Nasi Lemak KFC leaves a used `combo` row as a "combo ready" mark, and the next deck card arrives with a twin row (`powerups.twin_of`), so a doubled card is just two cards that share the slot. Tuch and Ga stores the chaser's position on the card (`powerups.spot`) and reveals like Pak Guard, but around that fixed point.

**Tech Stack:** TypeScript, React 19 + Motion, Vitest, Supabase Postgres (plpgsql), Vercel function `api/game.ts`.

**Spec:** `docs/superpowers/specs/2026-11-12-kejar-new-powerups-design.md` (§5 and §7 for this plan; §6 is plan E2).

## Global Constraints

- Free tiers only. Keep the single `api/game.ts` Vercel function. The server is the authority; phones only report.
- Migration `0019_new_deck_cards.sql`: idempotent, wrapped in `begin; … commit;`, with functions revoked from public/anon/authenticated and granted to service_role. The owner runs it by hand before merging.
- `MemoryStore` and `SupabaseStore` stay in step: every new store method gets a MemoryStore test, and the SQL mirrors it.
- Full mode only. Core's deck (`SET.core`) is unchanged.
- Copy: English with a light Malaysian twist, no em-dashes. Runner power-up uses never appear in the feed with names.
- Card art: doodle stickers in the existing style (power-ups §5c). Tuch and Ga's art must not copy Touch 'n Go's blue card or logo.
- Every effect is decided by the app: no honour rule, no marshal judgement.
- Run `npm test` from `app/`. Every task ends with the whole suite green.

## Review Focus

1. **Two runners freeze the same chaser at the same moment.** Exactly one freeze lands, and the other runner keeps their Cheese Ais (Task 1 store test, Task 3 action test).
2. **The game is paused during a freeze.** The freeze is extended by the pause length, the same as pings (Task 1 resume test).
3. **One half of a doubled card is stolen by Toyol or Ah Long.** The other half still works, and the slot frees once it's spent (Task 4 test).
4. **Tuch and Ga used when the chaser's last fix is more than 60 s old.** It's refused with `no-location` and the card is not spent (Task 5 test).
5. **A frozen chaser's toll gate or Pak Guard that was already switched on.** It still lands at the next ping (Task 5 test).

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/0019_new_deck_cards.sql` | Create: widen `powerups_kind_check`, add `powerups.twin_of`, `powerups.spot`, `players.frozen_until`, functions `freeze_chaser` and `apply_combo`, and `resume_game` shifting `frozen_until` |
| `app/shared/types.ts` | `PowerUpKind`, `PowerUp`, `Player`, `EventType` additions |
| `app/shared/powerNames.ts` | Three names |
| `app/shared/deck.ts` | Full deck counts |
| `app/shared/powerups.ts` | Constants, freeze/combo/twin helpers, `slotBusy`, `activeShield`, `judgeClaim`, `judgeBomohClaim` |
| `app/api/_lib/store.ts` | `GameStore.freezeChaser`, `GameStore.applyCombo`, MemoryStore versions, `resumeGame` shift |
| `app/api/_lib/supabaseStore.ts` | RPC wrappers, `frozen_until` in `PLAYER_COLUMNS` |
| `app/api/_lib/actions.ts` | `usePowerup` (cheese, combo, toll, frozen, effect-running, Durian twin), `claim` and `grabPick` apply the combo |
| `app/shared/views.ts` | `freezeTargets`, `frozenUntil`, `comboReady`, `tollGates`, `revealedBy: 'toll'`, feed lines |
| `app/src/game/powerInfo.ts`, `stickerArt.ts`, `PowerUpHand.tsx`, new `FreezePicker.tsx`, `Map.tsx` | UI |
| `app/src/screens/HostNew.tsx` | `FULL_STICKERS` |
| `docs/superpowers/specs/2026-10-30-kejar-rules.md`, `docs/HANDOFF.md` | Rules tables and status |

---

### Task 1: Data model, migration and store methods

**Files:**
- Create: `supabase/migrations/0019_new_deck_cards.sql`
- Modify: `app/shared/types.ts`, `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`

**Interfaces:**
- Produces:
  - `PowerUpKind` gains `'cheese' | 'combo' | 'toll'`.
  - `PowerUp` gains `twin_of: string | null` (the id of the card this one doubles) and `spot: LatLng | null` (Tuch and Ga's gate).
  - `Player` gains `frozen_until?: string | null`.
  - `EventType` gains `'frozen'` (actor: the runner, target: the chaser, data: `{ until }`).
  - `GameStore.freezeChaser(chaserId: string, untilIso: string): Promise<boolean>`: sets `frozen_until` only if it's null or not after the store clock. True for the one caller that wins.
  - `GameStore.applyCombo(playerId: string, powerUpId: string): Promise<PowerUp | null>`: atomically finds this player's ready combo (kind `combo`, `used_at` set, `consumed_at` null, `taken_at` null), sets its `consumed_at`, and inserts a twin of `powerUpId` (same game, player, kind and `sealed`, `station` null, `twin_of = powerUpId`). It returns the twin, or null if no combo was ready.
  - `resumeGame` also moves every `frozen_until` later than `paused_at` in that game by the pause length.

- [ ] **Step 1: Write the failing MemoryStore tests** in `store.test.ts`:

```ts
it('freezeChaser lands once, then refuses until the freeze ends', async () => {
  // set up a started game with a chaser `c` (follow the file's existing helpers)
  expect(await store.freezeChaser(c.id, iso(T0 + 3 * MIN))).toBe(true)
  expect(await store.freezeChaser(c.id, iso(T0 + 4 * MIN))).toBe(false)
  clock = T0 + 3 * MIN
  expect(await store.freezeChaser(c.id, iso(T0 + 6 * MIN))).toBe(true)
})
it('applyCombo consumes the ready combo and adds a twin, once', async () => {
  const combo = await store.addPowerUp({ game_id, player_id: p.id, kind: 'combo', station: 1 })
  await store.markUsed(combo.id)
  const card = await store.addPowerUp({ game_id, player_id: p.id, kind: 'decoy', station: 2 })
  const twin = await store.applyCombo(p.id, card.id)
  expect(twin).toMatchObject({ kind: 'decoy', twin_of: card.id, station: null, used_at: null })
  expect(await store.applyCombo(p.id, card.id)).toBeNull()
})
it('resumeGame moves a running freeze later by the pause', async () => {
  // freeze until T0+5min, pause at T0+2min, resume at T0+4min
  expect((await store.players(game_id)).find((x) => x.id === c.id)!.frozen_until).toBe(iso(T0 + 7 * MIN))
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `cd app && npx vitest run api/_lib/store.test.ts`
Expected: FAIL (`freezeChaser is not a function`).

- [ ] **Step 3: Add the types and the MemoryStore methods.** `addPowerUp` defaults `twin_of` and `spot` to null. In `resumeGame`, shift `frozen_until` like `final_whistle_at` (only values after `paused_at`).

- [ ] **Step 4: Write `0019_new_deck_cards.sql`.**
  - Drop and re-add `powerups_kind_check` with `('decoy','shield','cloak','flare','focus','toyol','along','grab','dato','cheese','combo','toll')`.
  - `add column if not exists`: `powerups.twin_of uuid references powerups(id)`, `powerups.spot jsonb`, `players.frozen_until timestamptz`.
  - `freeze_chaser(p_player uuid, p_until timestamptz, p_at timestamptz) returns boolean`: one `update … where id = p_player and (frozen_until is null or frozen_until <= p_at)`, true if a row changed.
  - `apply_combo(p_player uuid, p_powerup uuid, p_at timestamptz) returns setof powerups`: lock the combo row `for update skip locked`, consume it, insert the twin, return it.
  - `create or replace function resume_game`: copy the **latest** definition (in `0017_penjara.sql`) and add `update players set frozen_until = frozen_until + (p_at - greatest(started, ...))` for rows in the game with `frozen_until > started`. Keep every other line as it is.
- [ ] **Step 5: Add the SupabaseStore RPC wrappers** (follow `claimBomoh`'s style) and add `frozen_until` to `PLAYER_COLUMNS`. Extend `supabaseStore.test.ts` with one test per wrapper, checking the RPC name and arguments the way the file's existing RPC tests do.
- [ ] **Step 6: Run the suite**

Run: `cd app && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0019_new_deck_cards.sql app/shared/types.ts app/api/_lib/store.ts app/api/_lib/supabaseStore.ts app/api/_lib/*.test.ts
git commit -m "feat: data model for Cheese Ais, Nasi Lemak KFC and Tuch and Ga"
```

---

### Task 2: Shared rules (deck, slot, freeze, twins)

**Files:**
- Modify: `app/shared/deck.ts`, `app/shared/powerNames.ts`, `app/shared/powerups.ts`
- Test: `app/shared/powerups.test.ts`, `app/shared/deck.test.ts` (or wherever `SET` is tested now)

**Interfaces:**
- Consumes: Task 1 types.
- Produces (in `powerups.ts`):
  - `FREEZE_MS = 3 * 60_000`, `TOLL_RADIUS_M = 40`, `TOLL_FRESH_MS = 60_000`
  - `COMBO_EXCLUDED: readonly PowerUpKind[] = ['grab', 'combo', 'dato']`
  - `frozenForMs(p: Pick<Player, 'frozen_until'>, now: number): number` returns 0 when not frozen.
  - `comboReady(powerUps: PowerUp[], playerId: string): boolean`
  - `shieldArmedAt(u: PowerUp, all: PowerUp[]): number | null`: a plain shield's `used_at`. A twin shield is armed at its partner's `consumed_at`, or the partner's `used_at + SHIELD_MS` if the partner wasn't consumed. Null if not used.
  - `activeShield` uses `shieldArmedAt`: switched on, unconsumed, armed, and less than `SHIELD_MS` since armed.
  - `slotBusy`: a used `combo` or `cheese` never keeps the slot busy (like Toyol). A shield is running while unconsumed and less than `SHIELD_MS` since it was armed, **or** while it's a twin still waiting to arm. `toll` follows the default branch (until the next reveal after use).
  - `runningEffect(powerUps: PowerUp[], playerId: string, pings: Ping[], now: number): PowerUpKind | null`: like `slotBusy` but only counting used cards whose effect is still running.
  - `judgeClaim` gains the refusal `{ ok: false, reason: 'frozen', frozenForMs }`, checked after `cannot-claim`. `judgeBomohClaim` returns the same refusal.
- Deck: `SET.full.runner` adds `'cheese', 'combo'` (10 cards). `SET.full.chaser` adds `'toll', 'toll', 'combo'` (9 cards). `POWER_NAME` adds `cheese: 'Cheese Ais'`, `combo: 'Nasi Lemak KFC'`, `toll: 'Tuch and Ga'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('Full decks carry the new cards; Core is unchanged', () => {
  expect(SET.full.runner.filter((k) => k === 'cheese')).toHaveLength(1)
  expect(SET.full.runner.filter((k) => k === 'combo')).toHaveLength(1)
  expect(SET.full.chaser.filter((k) => k === 'toll')).toHaveLength(2)
  expect(SET.full.chaser.filter((k) => k === 'combo')).toHaveLength(1)
  expect(SET.core.runner).not.toContain('cheese')
})
it('a frozen chaser cannot claim, with the time left', () => {
  const v = judgeClaim({ ...base, me: { ...chaser, frozen_until: iso(NOW + 90_000) } })
  expect(v).toEqual({ ok: false, reason: 'frozen', frozenForMs: 90_000 })
})
it('a twin shield arms when its partner blocks, and runs its own 10 minutes', () => {
  const first = shield({ used_at: iso(NOW - 2 * MIN), consumed_at: iso(NOW - MIN) })
  const twin = shield({ id: 't', twin_of: first.id, used_at: iso(NOW - 2 * MIN) })
  expect(shieldArmedAt(twin, [first, twin])).toBe(NOW - MIN)
  expect(activeShield([first, twin], runnerId, NOW + 8 * MIN)?.id).toBe('t')
  expect(activeShield([first, twin], runnerId, NOW + 10 * MIN)).toBeNull()
})
it('a twin shield arms when its partner runs out unused', () => {
  const first = shield({ used_at: iso(NOW - 10 * MIN) })
  const twin = shield({ id: 't', twin_of: first.id, used_at: iso(NOW - 10 * MIN) })
  expect(shieldArmedAt(twin, [first, twin])).toBe(NOW)
})
it('a used combo or cheese frees the slot', () => {
  expect(slotBusy([used('combo')], me, [], NOW)).toBeNull()
  expect(slotBusy([used('cheese')], me, [], NOW)).toBeNull()
})
it('comboReady is true for a used, unconsumed, untaken combo only', () => { /* three cases */ })
```

- [ ] **Step 2: Run them and check they fail**

Run: `cd app && npx vitest run shared/powerups.test.ts shared/deck.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helpers and the deck changes listed above.** Existing tests that assert the exact Full deck contents or length change to the new counts.
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS. Some action tests draw from a seeded Full deck and may now get different cards. Fix them by giving the card directly (`give(...)`), not by changing the seed.
- [ ] **Step 5: Commit**

```bash
git add app/shared
git commit -m "feat: deck counts and slot rules for the three new cards"
```

---

### Task 3: Cheese Ais on the server and in the view

**Files:**
- Modify: `app/api/_lib/actions.ts` (`usePowerup`), `app/shared/views.ts`
- Test: `app/api/_lib/actions.test.ts` (new `describe('Cheese Ais')`, reuse the `chasing`/`give` helpers from `describe('Toyol and Ah Long')`; add a second chaser with a fourth `join`)

**Interfaces:**
- Consumes: `freezeChaser`, `frozenForMs`, `FREEZE_MS`.
- Produces:
  - `usePowerup` body `{ powerupId, targetId }` for `cheese`. Replies:
    - `{ ok: true, kind: 'cheese', name }` on success.
    - `{ ok: false, reason: 'no-target' }` when the target isn't a chaser in this game, is removed or Luar Garisan, is already frozen, or the freeze loses a race. The card is not spent. Use `markUsed` and then `freezeChaser`; if the freeze fails, give the card back (`used_at: null`), as Toyol does.
  - Any card used by a frozen chaser is refused: `{ ok: false, reason: 'frozen', frozenForMs }`, checked before anything is marked used.
  - Event `frozen`: actor runner, target chaser, `data: { until }`.
  - `View.freezeTargets: { id: string; name: string }[] | null`: non-null only for a runner holding an unused Cheese Ais. Chasers who are not removed, not Luar Garisan and not frozen, ordered by name.
  - `View.frozenUntil: number | null`: the viewer's own freeze end (chasers).
  - Feed lines: the frozen chaser sees `Brain freeze! A runner froze your power-up for 3 minutes.` (with `act: true`). Everyone else sees `Brain freeze on a Kejar.` The marshal feed shows `A Dikejar froze {chaser name}'s power-up` (marshals may see names).

- [ ] **Step 1: Write the failing action tests**
  - `freezes the picked chaser for 3 minutes`: `use` with `targetId: ben` → `{ ok: true, kind: 'cheese', name: 'Ben' }`. Ben's `frozen_until` equals `iso(now + 3 * MIN)`. Ben's `state` has `frozenUntil === now + 3 * MIN`, and `feed[0].text` is the frozen line.
  - `a frozen chaser can't use or claim`: Ben's Mat Rempit → `{ ok: false, reason: 'frozen', frozenForMs: 3 * MIN }`, and his station claim → `reason: 'frozen'`. Three minutes later both work.
  - `no stacking: freezing a frozen chaser is refused and the card is kept`: second runner, same target → `no-target`; their `cheese` row has `used_at === null`.
  - `two runners freezing the same chaser at once: one wins` (Review Focus 1): `Promise.all` of both uses → exactly one `ok: true`, and the loser's card is unused.
  - `freezeTargets leaves out frozen, Luar Garisan and removed chasers, and is null without a Cheese Ais`.
  - `an effect switched on before the freeze still lands` (Review Focus 5, Pak Guard half): Ben uses Pak Guard, is frozen, then the next reveal still marks a runner within 75 m `revealedBy: 'focus'`.
  - `a frozen chaser's card can still be stolen by Toyol`.
- [ ] **Step 2: Run them and check they fail.** `cd app && npx vitest run api/_lib/actions.test.ts -t "Cheese Ais"`: FAIL.
- [ ] **Step 3: Implement it in `usePowerup` and `views.ts`.** Put the frozen check right after the `me.jailed` check. Add the `frozen` cases to both feed functions.
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/views.ts
git commit -m "feat: Cheese Ais freezes one chaser's power-up for 3 minutes"
```

---

### Task 4: Nasi Lemak KFC (combo, twins, doubled Durian)

**Files:**
- Modify: `app/api/_lib/actions.ts` (`usePowerup`, `claim`, `grabPick`, `catchAction` unchanged except as noted), `app/shared/views.ts`
- Test: `app/api/_lib/actions.test.ts` (new `describe('Nasi Lemak KFC')`)

**Interfaces:**
- Consumes: `applyCombo`, `comboReady`, `COMBO_EXCLUDED`, `runningEffect`, `shieldArmedAt`.
- Produces:
  - Using `combo`: `markUsed`, event `used` with `data.kind: 'combo'` (no feed line), reply `{ ok: true, kind: 'combo' }`. The slot is free at once.
  - `claim` and `grabPick`: after a successful delivery of a kind not in `COMBO_EXCLUDED`, call `applyCombo(me.id, delivered.id)`. If it returns a twin, the reply adds `double: true`. Excluded kinds leave the combo ready.
  - `usePowerup` refuses `{ ok: false, reason: 'effect-running' }` when `runningEffect(...)` for this player is non-null (a twin can't be used until its partner's effect has finished). Check this after the frozen check.
  - Using a shield that has an unused twin also marks the twin used in the same request (`markUsed(twin.id)`), so the twin arms by itself through `shieldArmedAt`. `catchAction` needs no change, because `activeShield` now finds the armed twin.
  - `View.comboReady: boolean`.

- [ ] **Step 1: Write the failing action tests**
  - `using it frees the slot and the next station card arrives doubled`: claim → `{ ok: true, kind, double: true }`. The hand holds two rows of that kind, one with `twin_of` set. `comboReady` is false afterwards.
  - `Abang Grab delivers the doubled card` (combo ready, use Grab, pick) → the hand holds two of the picked kind.
  - `an excluded card keeps the combo for the card after`: the next draw is Abang Grab (give it via a seeded draw, or call `claim` with the deck forced by `store.drawCard` stubbing, matching how existing tests force cards) → no twin, `comboReady` still true.
  - `a doubled Gostan can't land both uses on one ping` (`effect-running` until the next reveal, then OK).
  - `a doubled Mat Rempit's second use still waits for the cooldown` (`flare-cooldown`).
  - `a doubled Durian blocks two catches, one after the other`: two scans by two chasers more than 15 s apart are both `shielded`. The third scan catches.
  - `a doubled Durian's second shield arms when the first runs out unused`: use, wait 10 min, then a scan is `shielded`.
  - `one stolen half: the other still works and the slot frees after it` (Review Focus 3).
- [ ] **Step 2: Run them and check they fail.** `-t "Nasi Lemak KFC"`: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/views.ts
git commit -m "feat: Nasi Lemak KFC doubles the next card"
```

---

### Task 5: Tuch and Ga (the toll gate)

**Files:**
- Modify: `app/api/_lib/actions.ts` (`usePowerup`), `app/shared/views.ts`
- Test: `app/api/_lib/actions.test.ts` (new `describe('Tuch and Ga')`), `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `TOLL_RADIUS_M`, `TOLL_FRESH_MS`, `PowerUp.spot`.
- Produces:
  - Using `toll`: take the chaser's latest position (`ctx.store.latestPositions(game.id, [iso(ctx.now)])`). If there's none, or it's older than `TOLL_FRESH_MS`, refuse with `{ ok: false, reason: 'no-location' }` before `markUsed`. Otherwise `markUsed`, then `updatePowerUp(u.id, { spot: { lat, lng } })`, then event `used` with `data.kind: 'toll'`.
  - `views.ts` chaser dots: `tollGates = landingAt(i, 'toll', revealAt, prevAt).map((u) => u.spot)`. A runner whose check-in is within `TOLL_RADIUS_M` of any gate is exact, with `revealedBy: 'toll'`. Priority: `bomoh` > `focus` > `toll`. Gostan and Ponteng beat it exactly as they beat Pak Guard (no new branch: the existing `isExact` and `decoyed` paths handle it once `toll` feeds `isExact`).
  - `MapDot.revealedBy: 'focus' | 'bomoh' | 'toll' | null`.
  - `View.tollGates: LatLng[]`: chasers only (empty for runners and marshals). These are gates that are used but haven't landed yet, meaning no reveal after `used_at`.
  - Feed: chasers see `A Kejar set a toll gate.` (label `Tuch and Ga`, means `Dikejar checking in near it show exactly at the next ping.`). Runners get no line. The marshal feed shows `A Kejar used Tuch and Ga`.

- [ ] **Step 1: Write the failing tests**
  - Action: `a runner who checks in within 40 m of the gate shows exactly at the next reveal`. Ben stands at `at(0)` and uses Tuch and Ga, then walks to `at(300)`. Aina checks in at `at(30)`, Hafiz at `at(80)`. After the reveal, Aina's dot is `exact` with `revealedBy: 'toll'`, and Hafiz's is fuzzy. The gate stayed where Ben used it.
  - Action: `refused with no-location when the chaser's last fix is over 60 s old, and the card is kept` (Review Focus 4).
  - Action: `Ponteng beats the gate` and `Gostan beats the gate` (the runner shows as never checked in, or at the decoy spot).
  - Action: `runners never see the gate`: Aina's `state` has `tollGates: []` and no feed line. Ben's has one gate until the reveal, then none.
  - Action: `a frozen chaser's toll gate still lands` (Review Focus 5).
  - Views unit test: `bomoh wins over focus wins over toll for revealedBy`.
- [ ] **Step 2: Run them and check they fail.** `-t "Tuch and Ga"`: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the suite.** `cd app && npm test`: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/views.ts app/shared/views.test.ts
git commit -m "feat: Tuch and Ga drops a hidden toll gate"
```

---

### Task 6: Screens, art and docs

**Files:**
- Modify: `app/src/game/powerInfo.ts`, `app/src/game/stickerArt.ts`, `app/src/game/PowerUpHand.tsx`, `app/src/game/Map.tsx`, `app/src/screens/HostNew.tsx`, `docs/superpowers/specs/2026-10-30-kejar-rules.md`, `docs/HANDOFF.md`
- Create: `app/src/game/FreezePicker.tsx`
- Test: `app/src/game/PowerUpHand.test.tsx`, `app/src/game/FreezePicker.test.tsx`, `app/src/game/Map.test.tsx`

**Interfaces:**
- Consumes: the `View` fields from Tasks 3 to 5, and the reply reasons `frozen`, `no-target`, `effect-running`, `no-location` and `double`.
- Produces:
  - `INFO` entries:
    - `cheese: { name: 'Cheese Ais', effect: "Freeze one Kejar's power-up for 3 min", used: 'Brain freeze!' }`
    - `combo: { name: 'Nasi Lemak KFC', effect: 'Your next power-up works twice', used: 'Nasi Lemak KFC! Your next power-up works twice.' }`
    - `toll: { name: 'Tuch and Ga', effect: 'Dikejar checking in within 40 m of you show exactly', used: 'Tuch and Ga! Toll gate up. Runners checking in near it get charged.' }`
  - `ART` stickers in the existing doodle style:
    - `cheese`: a plastic cup with a cheese-foam top and a straw.
    - `combo`: nasi lemak on a leaf with a fried drumstick.
    - `toll`: a plain card with a chip and a little boom gate. Use no blue and no logo.
  - `FreezePicker({ targets, onPick, onCancel })`: a list of chaser names, one button each.
  - `PowerUpHand`:
    - Using Cheese Ais opens `FreezePicker` with `view.freezeTargets`. With no targets it shows `No Kejar to freeze right now.` and doesn't call the API.
    - A doubled card shows one card with an `×2` badge (two unused rows of a kind where one has `twin_of` set).
    - `view.comboReady` shows the chip `COMBO READY`.
    - `view.frozenUntil` shows `FROZEN · m:ss` in the slot (reuse the `COOLDOWN · ` chip style and the `clock` helper).
    - Refusal copy: `frozen` gives `Brain freeze! Wait {m:ss}.`; `no-target` gives `That Kejar can't be frozen right now.`; `effect-running` gives `Wait for your last one to finish first.`; `no-location` gives `Can't find you yet. Try again in a moment.` A claim reply with `double: true` shows `Combo! {Name} x2.` A successful Cheese Ais shows `Cheese Ais! {name} is frozen for 3 minutes.` (from the reply's `name`).
  - `Map.tsx`: toll-revealed dots get their own style next to the `focus` and `bomoh` ones. `view.tollGates` draws as a small gate pin on the chaser map.
  - `HostNew.tsx`: `FULL_STICKERS` adds `'cheese', 'combo', 'toll'`.

- [ ] **Step 1: Write the failing component tests**
  - `using Cheese Ais opens the picker and sends the chosen chaser` (mock `api.ts` the way `PowerUpHand.test.tsx` already does; check the body carries `targetId`).
  - `no targets: the picker says so and sends nothing`.
  - `a doubled card shows ×2`, `COMBO READY shows when comboReady`, `FROZEN · 2:14 shows while frozen`.
  - `Map draws a toll gate pin from tollGates`.
- [ ] **Step 2: Run them and check they fail.** `cd app && npx vitest run src/game`: FAIL.
- [ ] **Step 3: Implement the UI.**
- [ ] **Step 4: Update the docs.** In the rules doc §3 table, add the three cards to Full's decks. Add a line to §4 for the freeze (3 min) and the toll gate (40 m, next ping). Add a status entry to `docs/HANDOFF.md`: branch name, `run supabase/migrations/0019_new_deck_cards.sql before merging`, and what's built.
- [ ] **Step 5: Run the suite and the type check.** `cd app && npm test && npx tsc -b`: PASS with no errors.
- [ ] **Step 6: Check it in the browser.** Start the dev preview (`.claude/launch.json`). Use a test Full game to screenshot the hand with Cheese Ais, the picker, `COMBO READY`, an `×2` card and `FROZEN`. The `/api` calls need the deployed site, so check these with the existing `testView.ts` fixtures on the screens that support them.
- [ ] **Step 7: Commit**

```bash
git add app/src docs
git commit -m "feat: hand, picker, chips, stickers and docs for the new deck cards"
```
