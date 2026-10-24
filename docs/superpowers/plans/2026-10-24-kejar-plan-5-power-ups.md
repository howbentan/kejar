# Kejar Plan 5: Power-up Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers drop up to 8 stations on the map when creating a game. Players claim a random role-specific power-up by scanning a station's printed code in person, then use Decoy, Shield, Cloak (runners) or Flare, Focus (chasers) during the chase.

**Architecture:**
- **Stations live in the arena.** A game's arena JSON gains `stations`; no new table is needed for them.
- **Claims and uses live in one new `powerups` table.**
- **Effects are pure functions in `app/shared/`**, applied when views are built (Decoy, Cloak, Focus), when a catch is judged (Shield), or by inserting a bonus ping row (Flare).
- Two new actions on the existing `/api/game` router (`claim`, `usePowerup`), so the deployment stays at 3 functions.

**Tech Stack:** existing (Vite + React + TS, Vitest, MapLibre v5, Supabase, Vercel).

**Spec:** `docs/superpowers/specs/2026-10-19-kejar-design.md` §4.8 and §4.8.1. Context: `docs/HANDOFF.md`.

## Global Constraints

- Colours: Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3` only. Stations are drawn in lime (spec §4.8.1).
- 0–8 stations per game, numbered from 1 in placement order, all inside the play-area circle.
- QR format: `KEJAR:STATION:<n>` with n = 1–8.
- **Claim rules:**
  - Chase phase only.
  - Phone location ≤30 s old and within 30 m of the station, plus up to 20 m of GPS error.
  - Once per player per station per game.
  - The station is locked for 60 s after any claim.
  - Jailed runners and marshals can't claim.
  - Max 3 unused power-ups in hand.
- Runner power-ups: Decoy, Shield, Cloak. Chaser power-ups: Flare, Focus. Each is picked at random for the claimer's role.
- **Effects:**
  - **Decoy:** the next revealed position shifts 120–180 m, staying inside the area when possible.
  - **Shield:** the next catch scan is rejected with "Shielded!". It lasts until used or 10 minutes.
  - **Cloak:** omitted from the next reveal.
  - **Flare:** check-in alert now, extra reveal 30 s later, without shifting the schedule.
  - **Focus:** at the next reveal, runners within 150 m of the chaser are shown exactly, with no fuzz.
- Feed copy, exactly:
  - `<name> picked up a power-up`
  - `Flare! Ping in 30 s`
  - `A chaser used Focus`
  - `#07 was shielded!`
  - Runner power-up uses are not announced.
- Free tiers only. Keep a single `api/game.ts` function.

## Review Focus

1. **A photo of a station code scanned from across the park.** Rejected as too far. → Task 2 test `claim from 200 m away is rejected as too-far`.
2. **The same player scans the same station twice, or two players scan within 60 s.** The second gets `already-claimed` or `locked`. → Task 2 tests.
3. **A power-up used twice, someone else's id, or used after being jailed.** Rejected. → Task 5 test `usePowerup rejects a used, foreign or jailed use`.
4. **A Flare with less than 30 s left.** Its reveal would land after the game ends, so it's rejected as `too-late` and the power-up is not spent. → Task 5 test.
5. **A Decoy near the edge.** The fake position stays inside the play area when any bearing allows it. → Task 2 test `decoy stays inside the boundary when possible`.

## File Structure

```
supabase/migrations/0004_powerups.sql      # powerups table (anon denied)
app/shared/types.ts            (modify)    # Arena.stations?, PowerUpKind, PowerUp, new EventTypes
app/shared/ids.ts              (modify)    # stationQr, stationFromQr
app/shared/arenas.ts           (modify)    # arenaAroundPoint(center, radius, stations)
app/shared/powerups.ts         (new)       # judgeClaim, pickPowerUp, decoySpot, activeShield, effectsAtReveal
app/shared/clock.ts            (modify)    # bonus pings (seq >= 1000) in dueWork + next reveal
app/shared/views.ts            (modify)    # reveal order by time; cloak/decoy/focus; stations + hand in View; feed
app/api/_lib/store.ts, supabaseStore.ts (modify)  # addPowerUp, powerUps, updatePowerUp
app/api/_lib/actions.ts        (modify)    # create(stations), claim, usePowerup, shield in catch
app/src/game/AreaPicker.tsx    (modify)    # tap to add/remove stations
app/src/screens/HostNew.tsx    (modify)    # send stations
app/src/screens/PrintTags.tsx  (modify)    # Station 1–8 codes
app/src/game/Map.tsx           (modify)    # station markers
app/src/game/PowerUpHand.tsx   (new)       # hand cards + "Scan station"
app/src/screens/RunnerChase.tsx, ChaserChase.tsx (modify)  # hand, scan station, shield message
```

---

### Task 1: Station types, codes and arena

**Files:** Modify `app/shared/types.ts`, `app/shared/ids.ts`, `app/shared/arenas.ts`. Test: `app/shared/ids.test.ts` (extend).

**Interfaces — Produces:**

```ts
// types.ts
export interface Arena { id; name; boundary; jail; start; stations?: LatLng[] }   // index i = station i+1
export type PowerUpKind = 'decoy' | 'shield' | 'cloak' | 'flare' | 'focus'
export interface PowerUp { id: string; game_id: string; player_id: string; kind: PowerUpKind; station: number; claimed_at: string; used_at: string | null; consumed_at: string | null }
export type EventType = ... | 'powerup' | 'used' | 'shielded'
// ids.ts
export const MAX_STATIONS = 8
export function stationQr(n: number): string            // 'KEJAR:STATION:3'
export function stationFromQr(text: string): number | null   // 1–8 else null
// arenas.ts
export function arenaAroundPoint(center: LatLng, radiusM = 200, stations: LatLng[] = []): Arena   // throws Error('Stations must be inside the play area') / ('At most 8 stations')
```

- [ ] **Step 1: Write the failing tests.**

```ts
expect(stationQr(3)).toBe('KEJAR:STATION:3'); expect(stationFromQr('KEJAR:STATION:3')).toBe(3)
expect(stationFromQr('KEJAR:STATION:9')).toBeNull(); expect(stationFromQr('KEJAR:TAG:03')).toBeNull()
expect(arenaAroundPoint(C, 200, [near]).stations).toEqual([near])          // near = 100 m from C
expect(() => arenaAroundPoint(C, 200, [far])).toThrow('Stations must be inside the play area')   // far = 300 m
expect(() => arenaAroundPoint(C, 200, Array(9).fill(near))).toThrow('At most 8 stations')
```

- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.** The "inside" check is `distanceM(center, s) <= radiusM`.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: station codes and stations in the arena`

### Task 2: Power-up rules

**Files:** Create `app/shared/powerups.ts`. Test: `app/shared/powerups.test.ts`.

**Interfaces — Produces:**

```ts
export const CLAIM_RADIUS_M = 30, CLAIM_FRESH_MS = 30_000, STATION_LOCK_MS = 60_000, HAND_MAX = 3, SHIELD_MS = 10 * 60_000
export type ClaimJudgement = { ok: true } | { ok: false; reason: 'not-chasing' | 'cannot-claim' | 'unknown-station' | 'too-far' | 'already-claimed' | 'locked' | 'hand-full'; lockedForMs?: number }
export function judgeClaim(i: { phase: Phase; me: Player; station: number | null; arena: Arena; myPos: Position | null; powerUps: PowerUp[]; now: number }): ClaimJudgement
export function pickPowerUp(role: 'runner' | 'chaser', rng: () => number): PowerUpKind
export function decoySpot(p: LatLng, boundary: LatLng[], seed: string): LatLng          // 120–180 m away; inside boundary if any of 12 bearings allows
export function activeShield(powerUps: PowerUp[], runnerId: string, now: number): PowerUp | null   // used, not consumed, used_at + 10 min > now
```

Rules for `judgeClaim`, in this order:
1. `not-chasing`.
2. `cannot-claim`: marshal, null role, or a jailed runner.
3. `unknown-station`: null, or beyond `arena.stations` length.
4. `too-far`: position missing, older than 30 s, or more than 30 m + min(accuracy, 20) away.
5. `already-claimed`: this player has a row for this station.
6. `locked`: anyone's claim on this station less than 60 s ago, with `lockedForMs` = time remaining.
7. `hand-full`: 3 or more unused (`used_at` null).

- [ ] **Step 1: Write the failing tests.**
  - `claim at the station succeeds`
  - `claim from 200 m away is rejected as too-far`
  - `a 40 s old position is rejected as too-far`
  - `second claim of the same station by the same player is already-claimed`
  - `another player within 60 s gets locked with the time left`, e.g. 20 s after a claim → `lockedForMs: 40_000`
  - `marshals and jailed runners cannot claim`
  - `a fourth unused power-up is hand-full`
  - `pickPowerUp only gives runner kinds to runners and chaser kinds to chasers` (1,000 draws with a seeded rng)
  - `decoy moves 120–180 m`
  - `decoy stays inside the boundary when possible` (point 20 m from the edge of a 200 m circle → result inside)
  - `activeShield expires after 10 minutes and ignores consumed shields`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `decoySpot` hashes the seed for a starting bearing and a distance, then tries 12 bearings 30° apart and takes the first that is inside the boundary; if none are, it uses the first.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: power-up claim rules and effects`

### Task 3: Bonus pings in the clock

**Files:** Modify `app/shared/clock.ts`. Test: `app/shared/clock.test.ts` (extend).

**Interfaces — Produces:**
- `export const BONUS_SEQ_BASE = 1000`.
- `dueWork(game, pings, now)` also returns alert and reveal seqs for **bonus rows** (`seq >= 1000`), using each row's own `alert_at` and `reveal_at`.
- `export function nextReveal(game: Game, pings: Ping[], now: number): { alertAt: number; revealAt: number } | null` returns the earliest upcoming of the scheduled pings and the unrevealed bonus rows.

- [ ] **Step 1: Write the failing tests.**
  - `a bonus ping is alerted at its alert time and revealed at its reveal time`
  - `bonus pings do not shift the schedule` (`pingTimes` unchanged)
  - `nextReveal picks a bonus ping that comes before the next scheduled one`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: bonus pings for Flare`

### Task 4: Effects in views

**Files:** Modify `app/shared/views.ts`. Test: `app/shared/views.test.ts` (extend).

**Interfaces:**
- `ViewInput` gains `powerUps: PowerUp[]`.
- `View` gains:
  - `stations: { n: number; lat: number; lng: number }[]`
  - `hand: PowerUp[]`: my unused power-ups, empty for marshals
  - `shieldActive: boolean`
- `MapDot` gains an optional `exact?: true` flag.
- Uses `nextReveal` (Task 3) for `nextRevealAt` and `nextAlertAt`.

Reveal rules, all keyed to "the first reveal at or after `used_at`":
- Revealed pings are ordered by `reveal_at`, not by `seq`. This changes chaser dots, `lastRevealAt`, and the previous-reveal time used for `missed`.
- **Cloak:** the runner is omitted from that reveal.
- **Decoy:** the runner's revealed point is `decoySpot(pos, boundary, runnerId:seq)` instead of `fuzz`.
- **Focus:** at that reveal, runners within 150 m of the focusing chaser's latest position at or before `reveal_at` are drawn at the true position, unfuzzed, with `exact: true`.

Feed text:
- `powerup` → `<name> picked up a power-up`
- `used` with `data.kind` flare → `Flare! Ping in 30 s`
- focus → `A chaser used Focus`
- other kinds → no entry
- `shielded` → `<tag> was shielded!`

- [ ] **Step 1: Write the failing tests.**
  - `cloaked runner is missing from the next reveal only`
  - `decoyed runner appears 120–180 m from their real spot at the next reveal`
  - `focus shows nearby runners exactly at the next reveal`
  - `a flare reveal between scheduled pings becomes the last reveal`
  - `hand lists my unused power-ups only`
  - `feed announces pickups and chaser power-ups but not runner ones`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: power-up effects in role views`

### Task 5: Store, migration and actions

**Files:**
- Create: `supabase/migrations/0004_powerups.sql`
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`, `app/api/_lib/actions.ts`
- Test: `app/api/_lib/actions.test.ts` (extend)

**Interfaces — Produces:**
- `GameStore` gains:
  - `addPowerUp(p: Omit<PowerUp, 'id' | 'claimed_at' | 'used_at' | 'consumed_at'>): Promise<PowerUp>` (`claimed_at` = store clock)
  - `powerUps(gameId): Promise<PowerUp[]>`
  - `updatePowerUp(id, patch): Promise<void>`
- `create` accepts `stations?: LatLng[]`, passed to `arenaAroundPoint`. A thrown error becomes a 400 with the same message.
- `claim` takes `{ code, token, qr, lat?, lng?, accuracy_m? }`.
  - Records the scan location first, as `catch` does.
  - Judges with `judgeClaim`.
  - On ok: `pickPowerUp(role, ctx.rng)`, then `addPowerUp`, then event `powerup` (actor = me).
  - Returns `{ ok: true, kind }` or the judgement.
- `usePowerup` takes `{ code, token, powerupId }` and returns `{ ok: true, kind }`, or `{ ok: false, reason: 'not-yours' | 'already-used' | 'not-chasing' | 'cannot-use' | 'too-late' }`.
  - `cannot-use`: the player is jailed.
  - `too-late`: a Flare with less than 30 s left; the power-up is not spent.
  - Sets `used_at` to now, then event `used` with `data: { kind }`.
  - **Flare** also adds a ping row: `seq = BONUS_SEQ_BASE + count of existing bonus rows`, `alert_at = now`, `reveal_at = now + 30 s`. `advance` then pushes the alert.
- `catch`: before judging, if the runner (found by tag) has `activeShield`, set `consumed_at` to now, add event `shielded` (target = runner), and return `{ ok: false, reason: 'shielded' }`. `CatchJudgement` gains the `'shielded'` reason.
- `state` passes `powerUps` into `viewFor`.
- Migration `0004`:
  - Table `powerups (id uuid pk default gen_random_uuid(), game_id fk cascade, player_id fk cascade, kind text check, station int, claimed_at timestamptz not null, used_at, consumed_at)`, with an index on `(game_id)`.
  - RLS on, with no policies.

- [ ] **Step 1: Write the failing tests** (MemoryStore):
  - `create keeps the stations placed on the map`
  - `create rejects a station outside the play area (400)`
  - `claim at a station gives the player a power-up for their role and logs a pickup`
  - `usePowerup rejects a used, foreign or jailed use`
  - `flare adds a bonus ping that pushes now and reveals in 30 s`
  - `flare with under 30 s left is too-late and not spent`
  - `an active shield blocks the next catch once, then the runner can be caught`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** the store methods (Memory and Supabase), the actions and the migration.
- [ ] **Step 4:** Run `npm --prefix app test` and `npm --prefix app run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit.** `feat: claim and use power-ups; shield blocks a catch`

### Task 6: Placing stations and printing their codes

**Files:**
- Modify: `app/src/game/AreaPicker.tsx`, `app/src/screens/HostNew.tsx`, `app/src/screens/PrintTags.tsx`
- Test: `app/src/screens/HostNew.test.tsx` (extend), `app/src/screens/PrintTags.test.tsx` (new)

**Interfaces:**
- `AreaPicker` props become `{ radiusM, stations: LatLng[], onChange(center), onStationsChange(stations: LatLng[]) }`.
  - Tapping the map inside the circle adds a station (max 8). Tapping within 25 px of an existing station removes it.
  - Stations are drawn as lime rings with their number.
  - Helper text: `Tap the map to add up to 8 stations · tap one to remove it`.
- `HostNew` keeps `stations` in state, shows `Stations: N`, and sends `stations` in `create`.
- `PrintTags` adds 8 `STATION n` cards with a QR of `stationQr(n)`.

- [ ] **Step 1: Write the failing tests.**
  - HostNew: with a mocked picker that reports two stations, `create` is called with `stations: [a, b]`.
  - PrintTags: shows `STATION 1` … `STATION 8`.
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: place stations when creating a game; print station codes`

### Task 7: Stations on the map and the power-up hand

**Files:**
- Create: `app/src/game/PowerUpHand.tsx`
- Modify: `app/src/game/Map.tsx`, `app/src/screens/RunnerChase.tsx`, `app/src/screens/ChaserChase.tsx`, `app/src/styles/tokens.css`
- Test: `app/src/game/PowerUpHand.test.tsx`, `app/src/screens/ChaserChase.test.tsx` (extend)

**Interfaces:**
- `GameMap` gains `stations?: { n; lat; lng }[]`, drawn as lime rings with a number label.
- `PowerUpHand({ code, view })`:
  - **Scan station** button → Scanner → `claim` with the current coordinates. Result messages:
    - `Got DECOY ✓` (the kind in caps)
    - `Get within 30 m of the station`
    - `You've already used this station`
    - `Station recharging — 0:40`
    - `Your hand is full (3)`
    - `That's not a station code`
  - A card per `view.hand` item, with name and one-line effect. Tapping it → `Use <Name>?` confirm → `usePowerup`. Result messages: `Flare! Runners check in now` / `Shield up for 10 min` / `Decoy set for the next ping` / `Cloak on for the next ping` / `Focus on for the next ping` / `Too late for a Flare`.
  - `Shield active` chip while `view.shieldActive`.
- `catchMessage` maps `shielded` → `Shielded! Hand the tag back — they get a 10 s head start`.
- RunnerChase and ChaserChase render `<PowerUpHand>` under the map, and pass `view.stations` to the map.

- [ ] **Step 1: Write the failing tests.**
  - `PowerUpHand shows a card per power-up in hand and uses it after confirming`
  - `claim messages map each reason`
  - `catchMessage explains a shielded catch`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix app test`, `npm --prefix app run typecheck` and `npm --prefix app run build`. Expected: PASS, exit 0, build succeeds.
- [ ] **Step 5: Commit.** `feat: stations on the map and the power-up hand`

### Task 8: Ship and live check (owner + Claude)

- [ ] **Step 1: Owner runs the migration.** Paste `supabase/migrations/0004_powerups.sql` into the Supabase SQL editor and run it. Expected: `Success`, and a `powerups` table.
- [ ] **Step 2: Deploy.** Merge to `main` and push; Vercel deploys.
- [ ] **Step 3: Live scripted game.** Create a game with 2 stations, then: hide 1 min → claim at station 1 → use the power-up → for a runner shield, attempt a catch and expect `shielded` → for a chaser flare, expect a ping 30 s later in the feed. Expected: each step returns as described.
- [ ] **Step 4: Update `docs/HANDOFF.md` status** and commit. `docs: plan 5 shipped`
