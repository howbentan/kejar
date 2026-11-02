# Plan D: Toyol, Ah Long, Abang Grab, the Chaser Snapshot, and Dato Seri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Full mode's content — the two "take away" power-ups (Toyol, Ah Long), Abang Grab's remote station claim, the "Dikejar can see Kejar at check-in" chaser-snapshot switch, and Dato Seri (stash mode first) — so Full mode is everything the rules doc says it should be, not Core plus one extra card.

**Architecture:** Toyol/Ah Long/Abang Grab are new `PowerUpKind` values that plug into the existing one-slot deck system (`app/shared/deck.ts`, `app/shared/powerups.ts`) rather than a parallel system. Toyol and Ah Long are the first power-ups whose effect touches *another* player's state (today everything only reads/writes the acting player's own `PowerUp` rows), so they need one new, carefully-atomic store operation, not a new subsystem. Abang Grab reuses the exact claim/draw machinery a station scan already uses, skipping only the distance check. The chaser-snapshot switch needs no new storage at all — the design doc's own hint holds up: a snapshot is just "chaser positions read as of the alert time," computed from the position history the app already keeps, not a captured-and-stored artifact. Dato Seri (stash mode) is a new `PowerUpKind` plus a small amount of new per-game state (where it's hidden, whether it's claimed) and reuses the existing station-scan and Penjara-scan actions rather than inventing new ones.

**Tech Stack:** TypeScript, Vitest, the existing `GameStore`/`MemoryStore`/`SupabaseStore` split, Supabase/Postgres for one new migration (Dato Seri's stash state).

**Spec:** `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md` §6.2 (Toyol/Ah Long), §6.3 (Abang Grab). `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md` §4b (Dato Seri, stash mode). `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md` §5 (the chaser snapshot). `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for numbers and wins any conflict. `docs/superpowers/plans/2026-11-01-kejar-plan-b-slot-deck-modes.md` describes the one-slot/shared-deck system this plan builds on.

**Scope note:** Dato Seri's yellow marker and foil (visual polish, Plan C2's original "left for C3/D" note) is this plan's final task, Task 9 — it needs Dato Seri to exist before there's anything to decorate, so it couldn't be built in Plan C3 (see that plan's own scope note). The quest-giver mode, Settle's "plus up to 2" wording, and anything about running Dato Seri with extra staff are out of scope — stash mode only, per rules doc §12's "Dato Seri (stash first)".

## Global Constraints

- Brand colours: Volt `#C6FF3D`, black and white only, except Dato Seri's legendary yellow (jail design §4a) — out of scope until Task 9.
- Free tiers only; keep the single `api/game.ts` function.
- Any new database column or table is a numbered migration the owner runs by hand in Supabase. This plan needs exactly one, for Dato Seri's stash state.
- **No power-up effect is ever decided by a marshal or referee.** Toyol/Ah Long's steal, Abang Grab's claim, and Dato Seri's stash claim/Settle are all decided entirely by the app (power-ups design §4's anti-goal; Dato Seri's own human-verified quest-giver mode is explicitly out of scope here).
- **A steal that finds nothing to take must not use up the stealer's power-up** (power-ups design §6.2).
- Dato Seri is immune to Toyol and Ah Long's steal pool (jail design §5) — the only copy in the game must never be deleted by an unrelated dice roll.
- Dato Seri stays secret from players: no name on the hint zone, the feed says `Something legendary was found.` (jail design §4c / rules doc §9b).

## Review Focus

- **Toyol/Ah Long stealing from a side with nothing to steal must refuse cleanly, without spending the stealer's card** — the single most explicit anti-goal in the spec for this pair.
- **Two simultaneous steals must never target the same card, and must never both report success while only one actually took something** — the spec explicitly calls out this race (power-ups design §6.2's "simultaneous uses").
- **Abang Grab must still respect every ordinary claim rule except distance** — once per player per station, the 60s station lock, jailed runners can't use it, hand/slot-full refuses cleanly.
- **A runner who misses this window's check-in keeps their *previous* snapshot showing**, per design doc §5.4's exact wording ("keeps the previous snapshot, or none") — "none" only applies before their first successful check-in of the game ever happens. Getting this backwards (clearing it on every miss) is the likely mistake.
- **Dato Seri's stash must refuse a claim from the wrong side (a chaser) without consuming the card**, the same way a wrong-side scan already refuses elsewhere in the app.

---

## Task 1: Toyol and Ah Long — the kinds and the steal

**Files:**
- Modify: `app/shared/types.ts` (`PowerUpKind` union)
- Modify: `app/shared/powerups.ts` (the steal judgement)
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts` (one new atomic store method)
- Modify: `app/api/_lib/actions.ts` (the `use` action's dispatch for these two kinds)
- Test: `app/shared/powerups.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `PowerUpKind` gains `'toyol' | 'along'` (internal names, matching the existing sticker art keys in `app/src/game/stickerArt.ts`). New store method `stealFrom(gameId: string, side: 'runner' | 'chaser'): Promise<{ stolenFrom: string; kind: PowerUpKind } | null>` — atomically picks one random player on `side` who holds an unused, unconsumed card, removes it (does not transfer it), and returns who/what, or `null` if nobody on that side holds anything stealable.
- Consumes: the existing `PowerUp` row shape (`claimed_at`, `used_at`, `consumed_at`) already used everywhere else to mean "currently held and unused."

- [ ] **Step 1: Write the failing test**

```ts
it('Toyol removes a random unused card from a random chaser, without giving it to the runner', async () => {
  // c1 holds an unused 'flare'; r1 uses a 'toyol'
  const result = await run('use', { code: g.code, token: r1Token, kind: 'toyol' })
  expect(result).toEqual({ ok: true, stolenFrom: 'c1', kind: 'flare' })
  const c1Hand = (await store.powerUps(g.id)).filter((p) => p.player_id === 'c1' && !p.used_at)
  expect(c1Hand).toHaveLength(0)
  const r1Hand = (await store.powerUps(g.id)).filter((p) => p.player_id === 'r1' && p.kind !== 'toyol')
  expect(r1Hand).toHaveLength(0) // the runner never receives the stolen card
})

it('Toyol with nothing to steal refuses without spending the card', async () => {
  // no chaser holds anything unused
  const result = await run('use', { code: g.code, token: r1Token, kind: 'toyol' })
  expect(result).toEqual({ ok: false, reason: 'nothing-to-steal' })
  const stillHeld = (await store.powerUps(g.id)).find((p) => p.player_id === 'r1' && p.kind === 'toyol')
  expect(stillHeld?.used_at).toBeNull()
})

it('two simultaneous Toyol uses never take the same card twice', async () => {
  // two runners both hold toyol, exactly one chaser card exists to steal; fire both 'use' calls concurrently
  const [a, b] = await Promise.all([run('use', { code: g.code, token: r1Token, kind: 'toyol' }), run('use', { code: g.code, token: r2Token, kind: 'toyol' })])
  const successes = [a, b].filter((r) => r.ok)
  expect(successes).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- powerups actions`
Expected: FAIL — `'toyol'`/`'along'` aren't valid kinds yet.

- [ ] **Step 3: Add `'toyol' | 'along'` to the `PowerUpKind` union in `app/shared/types.ts`**

- [ ] **Step 4: Add `stealFrom` to the `GameStore` interface and both implementations, atomic in each**

`MemoryStore`: pick uniformly at random among matching rows, mark it `consumed_at` (or delete it, matching whatever "gone for good" already means for a used-up card elsewhere — check `markUsed`/`consumeShield`'s exact convention and match it, don't invent a third). `SupabaseStore`: a single `update ... where kind in (candidate ids) and used_at is null and consumed_at is null ... limit 1 returning *`-style atomic update, matching `catchRunner`'s existing `.eq(..., false)` atomicity pattern.

- [ ] **Step 5: In the `use` action in `app/api/_lib/actions.ts`, branch on `kind === 'toyol' || kind === 'along'`: call `stealFrom` for the *other* side, consume the stealer's own card only if `stealFrom` returned non-null, and return `{ ok: true, stolenFrom, kind }` or `{ ok: false, reason: 'nothing-to-steal' }`**

Ah Long steals from free (not jailed) runners specifically — exclude jailed runners from the candidate set, same as any other "free runner" check elsewhere in this file.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- powerups actions`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/shared/types.ts app/shared/powerups.ts app/shared/powerups.test.ts app/api/_lib/store.ts app/api/_lib/supabaseStore.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: Toyol and Ah Long steal a random unused card from the other side"
```

---

## Task 2: Abang Grab — claim a station remotely

**Files:**
- Modify: `app/shared/types.ts` (`PowerUpKind` union)
- Modify: `app/shared/powerups.ts` (`judgeClaim`)
- Modify: `app/api/_lib/actions.ts` (the `use` action's dispatch for `'grab'`)
- Test: `app/shared/powerups.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `PowerUpKind` gains `'grab'`. `judgeClaim` gains an optional `skipDistance?: boolean` parameter — when true, the distance/`myPos` check is skipped, every other check (once per player per station, the 60s lock, jailed runners refused) still runs.

- [ ] **Step 1: Write the failing test**

```ts
it('Abang Grab claims a named station without checking distance', () => {
  const j = judgeClaim({ ...base, myPos: null, station: 3, skipDistance: true })
  expect(j.ok).toBe(true)
})

it('Abang Grab still refuses a locked or already-claimed station', () => {
  const j = judgeClaim({ ...base, myPos: null, station: 3, skipDistance: true, /* station already claimed by this player in the fixture */ })
  expect(j).toMatchObject({ ok: false, reason: 'already-claimed' })
})

it('using Abang Grab frees its own slot on success, so the hand is never blocked by it', async () => {
  const r = await run('use', { code: g.code, token: r1Token, kind: 'grab', station: 3 })
  expect(r.ok).toBe(true)
  const hand = (await store.powerUps(g.id)).filter((p) => p.player_id === 'r1' && !p.used_at && !p.consumed_at)
  expect(hand.find((p) => p.kind === 'grab')).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- powerups actions`
Expected: FAIL — `'grab'` isn't a valid kind; `skipDistance` doesn't exist.

- [ ] **Step 3: Add `'grab'` to `PowerUpKind`**

- [ ] **Step 4: Add `skipDistance?: boolean` to `judgeClaim`'s input, short-circuiting only the distance check when true**

- [ ] **Step 5: In the `use` action, branch on `kind === 'grab'`: require a `station` number in the body, call the same claim/draw path the ordinary `claim` action uses (`judgeClaim({ ..., skipDistance: true })` then `drawCard`/`claimStation`), and mark the Abang Grab card itself consumed only on success**

Reuse the exact function calls `claim` already makes — don't duplicate the draw-and-claim logic a second time in this branch.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- powerups actions`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/shared/types.ts app/shared/powerups.ts app/shared/powerups.test.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: Abang Grab claims a named station without needing to be there"
```

---

## Task 3: Wire the three new kinds into Full's deck

**Files:**
- Modify: `app/shared/deck.ts` (`SET.full`)
- Test: `app/shared/deck.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2's `'toyol' | 'along' | 'grab'` kinds.

- [ ] **Step 1: Write the failing test**

```ts
it('Full\'s runner deck includes Toyol and Abang Grab; the chaser deck includes Ah Long and Abang Grab', () => {
  expect(SET.full.runner).toContain('toyol')
  expect(SET.full.runner).toContain('grab')
  expect(SET.full.chaser).toContain('along')
  expect(SET.full.chaser).toContain('grab')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- deck`
Expected: FAIL — `SET.full` doesn't contain these kinds yet.

- [ ] **Step 3: Add the three kinds to `SET.full`'s runner/chaser arrays, one copy each (Claude's call — tune counts after playtests, matching how every other card's count was originally set as a best guess)**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- deck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/deck.ts app/shared/deck.test.ts
git commit -m "feat: Toyol, Ah Long and Abang Grab join Full mode's deck"
```

---

## Task 4: The chaser-snapshot switch — the setting

**Files:**
- Modify: `app/shared/types.ts` (`Settings`)
- Modify: `app/api/_lib/actions.ts` (`settingsFrom`)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `Settings` gains `chaserSnapshot: boolean` (default `false`).

- [ ] **Step 1: Write the failing test**

```ts
it('chaserSnapshot defaults to false and can be turned on at creation', async () => {
  const r1 = await run('create', { organiserToken, savedArenaId, overrides: {} })
  expect((await store.gameByCode(r1.code)).settings.chaserSnapshot).toBe(false)
  const r2 = await run('create', { organiserToken, savedArenaId, overrides: { chaserSnapshot: true } })
  expect((await store.gameByCode(r2.code)).settings.chaserSnapshot).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — `chaserSnapshot` is `undefined`.

- [ ] **Step 3: Add `chaserSnapshot: boolean` to `Settings` in `app/shared/types.ts`, and validate/default it in `settingsFrom`, following the same pattern as every other boolean setting there**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/types.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: the chaser-snapshot setting, off by default"
```

---

## Task 5: The chaser-snapshot view for runners

**Files:**
- Modify: `app/shared/views.ts` (runner `View` building)
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `Settings.chaserSnapshot` (Task 4), the existing per-runner "did they check in for scheduled window k" logic already built for the auto-jail streak (check-ins design §4.2 — a location sent inside that window), and the existing position-history lookup already used for chaser dots.
- Produces: runner `View` gains `chaserSnapshot: { positions: { name: string; lat: number; lng: number; stale: boolean }[] } | null` — reflects the **most recent scheduled window the runner actually checked into**, not necessarily the current one. `null` only before their first successful check-in of the game. A missed window doesn't clear it; the next successful check-in replaces it.

- [ ] **Step 1: Write the failing test**

```ts
it('with the switch on, a runner who just checked in sees chasers as of that window\'s alert time, fuzzed to 30m', () => {
  const v = view(aina, { settings: { ...DEFAULT_SETTINGS, chaserSnapshot: true }, now: alertAt + 10_000 /* checked in inside this window */ })
  expect(v.chaserSnapshot?.positions[0]).toMatchObject({ name: 'Ben', stale: false })
})

it('a chaser whose last position is over 60s old at the alert is marked stale', () => {
  // chaser's last position predates alertAt by more than 60s
  expect(v.chaserSnapshot?.positions[0].stale).toBe(true)
})

it('the switch off means no chaserSnapshot field at all, even after checking in', () => {
  const v = view(aina, { settings: { ...DEFAULT_SETTINGS, chaserSnapshot: false } })
  expect(v.chaserSnapshot).toBeNull()
})

it('missing this window keeps last window\'s snapshot showing, per design doc §5.4', () => {
  // the runner checked in for window k-1 (has a snapshot from alertAt(k-1)) but missed window k's check-in
  const v = view(aina, { settings: { ...DEFAULT_SETTINGS, chaserSnapshot: true }, now: alertAt(k) + 10_000 })
  expect(v.chaserSnapshot).not.toBeNull()
  expect(v.chaserSnapshot?.positions[0]).toMatchObject({ /* the chaser's position as of alertAt(k-1), not alertAt(k) */ })
})

it('before any check-in has ever succeeded, chaserSnapshot is null', () => {
  const v = view(aina, { settings: { ...DEFAULT_SETTINGS, chaserSnapshot: true } /* no position sent inside any window yet */ })
  expect(v.chaserSnapshot).toBeNull()
})

it('a Mat Rempit bonus ping never produces or updates a snapshot', () => {
  // the runner's most recent *checked-into* window is a bonus ping (seq >= BONUS_SEQ_BASE); it must be skipped
  // in favour of the last scheduled window they checked into (or null if there isn't one yet)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- views`
Expected: FAIL — `chaserSnapshot` is `undefined`.

- [ ] **Step 3: In the runner branch of `viewFor`, when `settings.chaserSnapshot` is true, find the most recent *scheduled* ping window (`seq < BONUS_SEQ_BASE`) this runner sent a position inside (the same per-window check-in test the auto-jail streak already computes — reuse that logic, don't recompute it a second way), and build `chaserSnapshot` from each chaser's position as of that window's `alertAt`**

If no such window exists yet this game, `chaserSnapshot` is `null`. Use the same "latest position at or before a timestamp" lookup the marshal/chaser-dot code already relies on — don't add a new one. Fuzz with the existing `fuzz()` helper at a 30 m radius (a new exported constant, e.g. `CHASER_SNAPSHOT_FUZZ_M = 30`, alongside `FUZZ_RADIUS_M` in `app/shared/views.ts`). `stale: true` when that position predates the window's `alertAt` by more than `FRESH_MS` (already 60 000 — reuse it, don't redefine).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- views`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts
git commit -m "feat: runners see a frozen chaser snapshot at check-in, when the switch is on"
```

---

## Task 6: The chaser-snapshot marker on a chaser's own screen

**Files:**
- Modify: `app/shared/views.ts` (chaser `View` building)
- Modify: `app/shared/alerts.ts` or `feedText` in `views.ts` (the feed line)
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Produces: chaser `View` gains `snapshotted: boolean` — true from the moment their position is captured in a scheduled ping's alert-time snapshot (Task 5) until their next check-in-equivalent moment. Feed gains a line for the moment it happens.

- [ ] **Step 1: Write the failing test**

```ts
it('a chaser sees snapshotted: true right after their alert-time position was captured', () => {
  const v = view(chaser, { settings: { ...DEFAULT_SETTINGS, chaserSnapshot: true }, now: alertAt + 1_000 })
  expect(v.snapshotted).toBe(true)
})

it('the feed tells everyone a snapshot was taken, in plain English', () => {
  const v = view(aina, { events: [event('snapshot-taken', alertAt)] })
  expect(v.feed[0].text).toMatch(/snapshot/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- views`
Expected: FAIL — `snapshotted` is `undefined`; no feed line exists.

- [ ] **Step 3: Set `snapshotted: true` on a chaser's view whenever `settings.chaserSnapshot` is on and `now` is past the current/most recent scheduled ping's `alertAt`, mirroring the same window logic Task 5 already uses**

- [ ] **Step 4: Add the feed/marshal-alert line, `Dikejar can see where you were.` (plain English, matching rules doc §6's "plain English for everything players read")**

This doesn't need a new stored event if `snapshotted` is already derivable purely from time and settings (Step 3) — only add an event if the feed specifically needs a one-time announcement moment rather than a continuously-recomputable state. Prefer deriving it from time, matching how little new state the rest of this plan needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- views`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts
git commit -m "feat: chasers know when they've been snapshotted"
```

---

## Task 7: Dato Seri — the stash and claiming it

**Files:**
- Modify: `app/shared/types.ts` (`PowerUpKind`, `Game`)
- Create: `supabase/migrations/0011_dato_seri_stash.sql`
- Modify: `app/api/_lib/actions.ts` (an organiser/marshal "drop the stash" action; the `claim`/scan action recognizing the stash QR)
- Modify: `app/shared/views.ts` (the hint zone, secret from players)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Produces: `PowerUpKind` gains `'dato'`. `Game` gains `datoStash: { lat: number; lng: number; claimedBy: string | null } | null`. New action `dropDatoSeri(ctx, { code, token, lat, lng })` (organiser/marshal only). The existing `claim`-style scan recognizes a dedicated QR payload (e.g. `KEJAR:DATO`) and claims Dato Seri for the first *runner* to scan it within 30 m, refusing a chaser without consuming anything.

- [ ] **Step 1: Write the failing test**

```ts
it('the first runner to scan the stash claims Dato Seri; it stops working after', async () => {
  await run('dropDatoSeri', { code: g.code, token: organiserToken, lat: 3, lng: 101 })
  const r1 = await run('claim', { code: g.code, token: runnerToken1, qr: 'KEJAR:DATO' })
  expect(r1).toEqual({ ok: true, kind: 'dato' })
  const r2 = await run('claim', { code: g.code, token: runnerToken2, qr: 'KEJAR:DATO' })
  expect(r2.ok).toBe(false)
})

it('a chaser scanning the stash is refused, not consumed', async () => {
  await run('dropDatoSeri', { code: g.code, token: organiserToken, lat: 3, lng: 101 })
  const r = await run('claim', { code: g.code, token: chaserToken, qr: 'KEJAR:DATO' })
  expect(r.ok).toBe(false)
  const r2 = await run('claim', { code: g.code, token: runnerToken, qr: 'KEJAR:DATO' })
  expect(r2.ok).toBe(true) // still claimable afterwards
})

it('claiming Dato Seri occupies the whole slot and is refused if the hand is full', async () => {
  // runner already holds an unused card
  const r = await run('claim', { code: g.code, token: runnerToken, qr: 'KEJAR:DATO' })
  expect(r).toMatchObject({ ok: false })
})

it('Dato Seri is secret: the feed never names it', async () => {
  await run('dropDatoSeri', { code: g.code, token: organiserToken, lat: 3, lng: 101 })
  await run('claim', { code: g.code, token: runnerToken, qr: 'KEJAR:DATO' })
  const v = view(someOtherRunner, {})
  expect(v.feed[0].text).toBe('Something legendary was found.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — `dropDatoSeri` and the `KEJAR:DATO` QR don't exist.

- [ ] **Step 3: Add `'dato'` to `PowerUpKind`, and `datoStash: { lat, lng, claimedBy } | null` to `Game`**

- [ ] **Step 4: Create `supabase/migrations/0011_dato_seri_stash.sql`**

```sql
-- Dato Seri's hidden stash: where the organiser dropped it, and whether it's been claimed.
-- See jail design doc §4b (stash mode, the default).
alter table games add column dato_stash jsonb;
```

- [ ] **Step 5: Add `dropDatoSeri: Action` (organiser or marshal, following `requireMarshal`'s existing pattern), storing the stash position on the game and refusing if a stash already exists this game (exactly one per game)**

- [ ] **Step 6: In the `claim`/scan action, recognize `qr === 'KEJAR:DATO'` as a special case: refuse if no stash is set or it's already claimed or the scanner isn't a free runner within 30 m of the stash position (reuse `CLAIM_RADIUS_M`), refuse without consuming anything for a chaser, otherwise mark it claimed and give the runner the `'dato'` card occupying their whole slot**

- [ ] **Step 7: In `app/shared/views.ts`, add the hint zone: every player (both sides) with `settings.mode === 'full'` and an unclaimed stash sees an unlabelled zone (100–200 m fuzzy, reusing `fuzz()`) around the stash position, with no name attached; once claimed, the zone disappears and the feed says exactly `Something legendary was found.`, never naming Dato Seri**

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/shared/types.ts supabase/migrations/0011_dato_seri_stash.sql app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/views.ts app/shared/views.test.ts
git commit -m "feat: Dato Seri's hidden stash, found and claimed by the first runner"
```

---

## Task 8: Settle — self-serve, at Penjara

**Files:**
- Modify: `app/api/_lib/actions.ts` (the `jailbreak`-adjacent Settle action)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: Task 7's `'dato'` kind; Task 1's steal-pool exclusion point (Dato Seri must never appear as a candidate in `stealFrom`'s query — add that filter now, in the same place `stealFrom` was built).
- Produces: `settle: Action` — the Dato Seri holder, while jailed, picks one other currently-jailed runner; frees whichever of the two is still eligible under the lifetime `freed_once` rule (possibly both, possibly neither — refusing cleanly if neither is eligible), consumes the `'dato'` card, sets `freed_at` on whoever it actually frees.

- [ ] **Step 1: Write the failing test**

```ts
it('Settle frees the holder and their chosen friend, if both are eligible', async () => {
  // r1 holds dato, is jailed; r2 is jailed and never freed before
  const r = await run('settle', { code: g.code, token: r1Token, targetId: 'r2' })
  expect(r).toEqual({ ok: true, freed: ['r1', 'r2'] })
})

it('Settle frees only whoever is still eligible when the other already used their one escape', async () => {
  // r1 (holder) already used freed_once; r2 has not
  const r = await run('settle', { code: g.code, token: r1Token, targetId: 'r2' })
  expect(r).toEqual({ ok: true, freed: ['r2'] })
})

it('Settle refuses if neither the holder nor the target is eligible', async () => {
  // both already freed_once
  const r = await run('settle', { code: g.code, token: r1Token, targetId: 'r2' })
  expect(r.ok).toBe(false)
})

it('Toyol and Ah Long can never take Dato Seri', async () => {
  // r1 holds an unused 'dato'; a chaser uses 'along' targeting runners
  const r = await run('use', { code: g.code, token: chaserToken, kind: 'along' })
  expect(r).toEqual({ ok: false, reason: 'nothing-to-steal' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — `settle` doesn't exist; `stealFrom` still considers `'dato'` stealable.

- [ ] **Step 3: In `stealFrom` (Task 1), exclude `kind === 'dato'` from its candidate query**

- [ ] **Step 4: Add `settle: Action`, following the eligibility logic exactly as the jail design doc §4 describes it (reread it before writing this step's body) — consume the `'dato'` card, set `freed_at` (Task 2 of the check-ins plan already established this field and its reset-on-release convention) on each runner actually freed**

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: Settle frees Dato Seri's holder and their chosen friend"
```

---

## Task 9: Dato Seri's yellow marker and foil

**Files:**
- Modify: `app/src/game/Map.tsx` (the hint-zone render, yellow not lime)
- Modify: `app/src/game/PowerCard.tsx` or wherever a held card renders (the legendary card face, per jail design §4a: yellow gradient, iridescent foil tracking device tilt)
- Test: `app/src/game/Map.test.tsx`, `app/src/game/PowerCard.test.tsx`

**Interfaces:**
- Consumes: Task 7's hint zone and `'dato'` kind.

- [ ] **Step 1: Write the failing test**

```tsx
it('the Dato Seri hint zone renders in legendary yellow, not lime', () => {
  render(<Map dots={[]} hintZone={{ lat: 3, lng: 101, radiusM: 150 }} />)
  // assert the zone's rendered colour/style token is the yellow one, not the brand lime used elsewhere
})

it('a held Dato Seri card shows the foil layer; no other card ever does', () => {
  render(<PowerCard kind="dato" />)
  expect(screen.getByTestId('foil')).toBeInTheDocument()
  render(<PowerCard kind="shield" />)
  expect(screen.queryByTestId('foil')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Map PowerCard`
Expected: FAIL — the hint zone and card both use ordinary brand styling today.

- [ ] **Step 3: Give the hint zone its own yellow styling (jail design §4a's gradient/dashed-circle description) when it's Dato Seri's, keeping every other map element unchanged**

- [ ] **Step 4: Add the foil layer to `PowerCard` only for `kind === 'dato'`, using `window.DeviceOrientationEvent` (or whatever tilt API the project already has a convention for — check `app/src/game` for one before adding a new dependency) for the moving highlight; a static gradient is an acceptable fallback with no device-tilt permission**

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/game/Map.tsx app/src/game/Map.test.tsx app/src/game/PowerCard.tsx app/src/game/PowerCard.test.tsx
git commit -m "feat: Dato Seri's legendary yellow marker and foil"
```
