# Kejar Plan 2: Core Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play one complete Kejar game in a park from phones' browsers. An organiser creates the game; players join, accept the terms and get roles; runners link their tags; then hide phase → chase with pings and check-ins → tag-scan catches → jail and jailbreak → results.

**Architecture:**
- **Server owns the game.** All game tables deny the anon role. Every read and write goes through one Vercel function, `api/game.ts`, which uses the Supabase secret key and dispatches on `action`. This keeps runner positions away from chasers' browsers.
- **Clients poll for state.** A role-filtered `state` action every 3 s while the page is open; Supabase realtime is not used.
- **Lazy clock.** Phase changes and pings are computed from timestamps on every `state` call by an idempotent `advance()`, so no cron is needed. Any open chaser or marshal page keeps the game ticking.
- **Pure rules.** Game rules are pure functions in `app/shared/` with unit tests. Handlers run against a `GameStore` interface, which has an in-memory version for tests and a Supabase version in production.

**Tech Stack:** existing Vite + React + TS app, Vitest; `maplibre-gl` (map) with OpenFreeMap vector tiles (free, no key); `qr-scanner` (camera QR reading); `qrcode` (printing tags); `web-push` (existing).

**Spec:** `docs/superpowers/specs/2026-10-19-kejar-design.md`. Spike outcome: `docs/superpowers/spike-results.md` (push check-ins, with a schedule fallback setting).

## Global Constraints

- Free tiers only (Vercel Hobby, Supabase free, OpenFreeMap). **Vercel Hobby allows 12 functions per deployment.** This plan adds exactly one (`api/game.ts`), for 3 in total.
- Colours: Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3` only. Lime is never text on white. Geist / Geist Mono (spec §9).
- Roles on the map, by colour and shape: chasers solid lime, runners solid white, marshals white ring, you a larger dot with a halo (spec §9).
- Runners' phones stay in pockets. Only chasers and marshals keep the page open; runners send their location whenever the page is open, guaranteed at check-ins (spec §4.5).
- Check-in alert copy: `Ping in 30s — check in!` (spec §4.5).
- Defaults (spec §4.3): game 45 min (15–90), hide 5 min (1–15), ping every 5 min (2, 3 or 5), spectator delay 2 min (0–5), check-in mode `push` (or `schedule`).
- Fuzzy circle radius 15 m. "Chaser nearby" within 100 m. Catch distance check 50 m; a runner position older than 2 min means "allowed but flagged". Jailbreak within 30 m of the jail. Each runner can be freed once (spec §4.6–4.7).
- A missed check-in shows the runner's last known position marked "missed check-in" (spec §4.5).
- Shared code in `app/shared/` uses **explicit `.js` extensions** on relative imports, because the Vercel Node ESM runtime needs them. Vite resolves `.js` to `.ts`.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`) are only read in `api/`. Player and host secrets are random 32-byte tokens, stored only as SHA-256 hashes.

## Review Focus

1. **A runner's phone never checks in** (pocketed, dead battery, alert ignored). Chasers must still see a marked last-known position, never a crash or a vanished runner. → Task 3 test `missed check-in shows last known position, flagged`.
2. **Two chasers scan the same ripped tag**, or one chaser scans it twice. Exactly one catch and one feed event. → Task 6 test `second scan of a caught runner is rejected as already caught`.
3. **A player reloads mid-game or opens the link on a second tab.** They're restored to the same player from the stored token, not joined twice. → Task 5 test `rejoin with stored token returns the same player`.
4. **Clock edges:** a `state` call exactly at hide-end or game-end, or several pages calling `advance()` at once. Each ping is alerted and revealed exactly once, and the game ends exactly once. → Task 3 tests `advance is idempotent under repeated calls` and `boundary instants`.
5. **No location yet** (a runner who hasn't checked in at the first reveal; a chaser whose GPS hasn't fixed when scanning). Clear outcomes, no `NaN` distances. → Task 6 test `catch with unknown chaser position is allowed but flagged`, and Task 3 test `runner with no position at reveal is listed as never checked in`.

## File Structure

```
supabase/migrations/0003_game.sql        # games, players, locations, pings, events (anon denied)
app/shared/                              # pure, tested, imported by both client and api
  types.ts        # Game, Player, Settings, Phase, Role, Position, GameEvent, Ping, views
  geo.ts          # distanceM, pointInPolygon, circlePolygon, fuzz
  clock.ts        # phaseAt, pingTimes, dueWork
  teams.ts        # shuffleRoles, validateTeams
  views.ts        # viewFor
  catch.ts        # judgeCatch, judgeJailbreak
  results.ts      # computeResults
  arenas.ts       # ARENAS (one hardcoded test park) + arenaAroundPoint
  ids.ts          # newGameCode, tagIdFromQr, tagQr, JAIL_QR
app/api/
  game.ts                 # router: POST /api/game { action, ... }
  _lib/store.ts           # GameStore interface + MemoryStore (tests)
  _lib/supabaseStore.ts   # SupabaseStore
  _lib/secrets.ts         # newToken, hashToken
  _lib/actions.ts         # one function per action (pure over GameStore + clock + push)
  _lib/actions.test.ts
app/src/
  game/api.ts             # typed client for /api/game
  game/session.ts         # localStorage: player token, host key per game code
  game/useGameState.ts    # 3 s polling hook + location sender
  game/Map.tsx            # MapLibre map in Kejar dark style
  game/mapStyle.ts        # minimal dark OpenFreeMap style
  game/Scanner.tsx        # camera QR scanner
  screens/Home.tsx  HostNew.tsx  HostLobby.tsx  Join.tsx  Lobby.tsx
  screens/Hide.tsx  ChaserChase.tsx  RunnerChase.tsx  Jail.tsx  MarshalLive.tsx  Results.tsx
  screens/PrintTags.tsx
  routes.ts (modify)  App.tsx (modify)  public/sw.js (modify: game pings)
```

---

### Task 1: Shared types and geometry

**Files:** Create `app/shared/types.ts`, `app/shared/geo.ts`. Test: `app/shared/geo.test.ts`.

**Interfaces — Produces:**

```ts
// types.ts
export type Role = 'runner' | 'chaser' | 'marshal'
export type Phase = 'lobby' | 'hiding' | 'chasing' | 'ended'
export type CheckinMode = 'push' | 'schedule'
export interface LatLng { lat: number; lng: number }
export interface Position extends LatLng { accuracy_m: number; at: string }   // at = server ISO time
export interface Settings { lengthMin: number; hideMin: number; pingMin: 2 | 3 | 5; spectatorDelayMin: number; checkinMode: CheckinMode }
export const DEFAULT_SETTINGS: Settings = { lengthMin: 45, hideMin: 5, pingMin: 5, spectatorDelayMin: 2, checkinMode: 'push' }
export interface Arena { id: string; name: string; boundary: LatLng[]; jail: LatLng; start: LatLng }
export interface Game { id: string; code: string; arena: Arena; settings: Settings; started_at: string | null; ended_at: string | null; winner: 'runners' | 'chasers' | null }
export interface Player { id: string; game_id: string; name: string; role: Role | null; tag_id: number | null; accepted_at: string; caught_at: string | null; caught_by: string | null; jailed: boolean; freed_once: boolean; push: PushSubscriptionJSON | null }
export interface Ping { game_id: string; seq: number; alert_at: string; reveal_at: string; alerted: boolean; revealed: boolean }
export type EventType = 'joined' | 'roles' | 'started' | 'chase' | 'ping' | 'caught' | 'jailbreak' | 'ended'
export interface GameEvent { id: string; game_id: string; at: string; type: EventType; actor_id: string | null; target_id: string | null; data: Record<string, unknown> }
export interface Results { winner: 'runners' | 'chasers'; survivors: string[]; longestSurvivor: { id: string; ms: number } | null; mostCatches: { id: string; count: number } | null; jailbreakHero: { id: string; freed: number } | null }
```

```ts
// geo.ts
export function distanceM(a: LatLng, b: LatLng): number            // haversine, earth radius 6_371_000
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean  // ray casting
export function circlePolygon(center: LatLng, radiusM: number, sides = 24): LatLng[]
export function fuzz(p: LatLng, radiusM: number, seed: string): LatLng   // deterministic offset ≤ radiusM
```

- [ ] **Step 1: Write the failing tests.**

```ts
const KL = { lat: 3.1390, lng: 101.6869 }
expect(distanceM(KL, KL)).toBe(0)
expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -1)
const sq = [{lat:0,lng:0},{lat:0,lng:1},{lat:1,lng:1},{lat:1,lng:0}]
expect(pointInPolygon({lat:.5,lng:.5}, sq)).toBe(true); expect(pointInPolygon({lat:2,lng:.5}, sq)).toBe(false)
const c = circlePolygon(KL, 200); expect(c).toHaveLength(24); c.forEach(p => expect(distanceM(KL, p)).toBeCloseTo(200, 0))
const f = fuzz(KL, 15, 'p1:3'); expect(distanceM(KL, f)).toBeLessThanOrEqual(15); expect(fuzz(KL, 15, 'p1:3')).toEqual(f); expect(fuzz(KL, 15, 'p1:4')).not.toEqual(f)
```

- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** `fuzz` hashes the seed with FNV-1a into an angle and a distance in [0, radius].
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: shared game types and geometry`

### Task 2: Teams, codes and arenas

**Files:** Create `app/shared/teams.ts`, `app/shared/ids.ts`, `app/shared/arenas.ts`. Test: `app/shared/teams.test.ts`, `app/shared/ids.test.ts`.

**Interfaces — Produces:**

```ts
// teams.ts
export function shuffleRoles(playerIds: string[], marshalIds: string[], rng: () => number): Record<string, Role>  // marshals keep 'marshal'; others: chasers = max(1, round(n/4)), rest runners
export function validateTeams(roles: Record<string, Role>): string[]   // [] when ok; messages below
// ids.ts
export function newGameCode(rng: () => number): string    // 6 chars, alphabet 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function tagQr(tagId: number): string               // 'KEJAR:TAG:07'
export function tagIdFromQr(text: string): number | null   // parses 'KEJAR:TAG:<1-99>' else null
export const JAIL_QR = 'KEJAR:JAIL'
// arenas.ts
export const ARENAS: Record<string, Arena>                  // one entry 'titiwangsa' (Taman Tasik Titiwangsa, KL) — owner edits coordinates
export function arenaAroundPoint(center: LatLng, radiusM = 200): Arena   // id 'around-me', boundary circlePolygon, jail = start = center
```

`validateTeams` messages, exactly:
- `Need at least 1 chaser`
- `Need at least 2 runners`
- `More chasers than runners`

- [ ] **Step 1: Write the failing tests.**

```ts
const ids = Array.from({length: 12}, (_, i) => `p${i}`)
const roles = shuffleRoles(ids, ['p0'], seeded(1))
expect(roles.p0).toBe('marshal'); expect(Object.values(roles).filter(r => r==='chaser')).toHaveLength(3); expect(Object.values(roles).filter(r => r==='runner')).toHaveLength(8)
expect(validateTeams({a:'runner',b:'runner'})).toEqual(['Need at least 1 chaser'])
expect(validateTeams({a:'chaser',b:'chaser',c:'runner'})).toEqual(['Need at least 2 runners','More chasers than runners'])
expect(validateTeams({a:'chaser',b:'runner',c:'runner'})).toEqual([])
expect(newGameCode(seeded(2))).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
expect(tagQr(7)).toBe('KEJAR:TAG:07'); expect(tagIdFromQr('KEJAR:TAG:07')).toBe(7); expect(tagIdFromQr('hello')).toBeNull(); expect(tagIdFromQr('KEJAR:TAG:00')).toBeNull()
const a = arenaAroundPoint({lat:3.1,lng:101.6}); expect(a.boundary).toHaveLength(24); expect(a.jail).toEqual({lat:3.1,lng:101.6})
```

(`seeded(n)` is a small mulberry32 helper in `app/shared/testing.ts`.)

- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.** For the Titiwangsa arena, use an approximate polygon around the lake park; mark it in a comment as approximate and owner-editable.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: roles, game codes, tag QR format and test arena`

### Task 3: Game clock and role views

**Files:** Create `app/shared/clock.ts`, `app/shared/views.ts`. Test: `app/shared/clock.test.ts`, `app/shared/views.test.ts`.

**Interfaces — Produces:**

```ts
// clock.ts
export function phaseAt(game: Game, now: number): { phase: Phase; endsAt: number | null }   // lobby if !started_at; ended if ended_at or now >= start+hide+length
export function pingTimes(game: Game): { seq: number; alertAt: number; revealAt: number }[]  // reveals every pingMin during chase, starting chaseStart+pingMin; alert = reveal − 30 s; none at/after game end
export interface DueWork { alert: number[]; reveal: number[]; end: boolean }
export function dueWork(game: Game, pings: Ping[], now: number): DueWork   // seqs whose time has passed and flag is false; end when phase ended && !ended_at

// views.ts
export interface MapDot { id: string; kind: 'me' | 'runner' | 'chaser' | 'marshal' | 'teammate'; lat: number; lng: number; label?: string; fuzzy?: boolean; missed?: boolean; at: string }
export interface View {
  phase: Phase; endsAt: number | null; now: number; me: Player; arena: Arena; settings: Settings
  dots: MapDot[]; nextRevealAt: number | null; nextAlertAt: number | null
  chaserNearby: boolean                 // runners only; false otherwise
  feed: { at: string; text: string }[]   // newest first, max 20
  counts: { runnersFree: number; runnersJailed: number; chasers: number }
  results: Results | null               // Results from types.ts; null until ended
}
export function viewFor(input: { game: Game; me: Player; players: Player[]; positions: Record<string, Position[]>; pings: Ping[]; events: GameEvent[]; now: number; results: Results | null }): View   // results passed through (the state action computes them once ended)
```

View rules:
- **Chaser:**
  - All chasers live (latest position).
  - For each free runner, one dot at their latest position at or before the last revealed ping time: `fuzzy: true`, fuzzed with seed `${runnerId}:${seq}`, label = tag number.
  - Runners with no position at or before that reveal and none since the previous reveal: `missed: true`, shown at their last known position. Runners with no position ever are not drawn and are counted in feed text `#07 never checked in`.
- **Runner:**
  - Me, plus teammates at their latest positions (no fuzz).
  - No chaser dots.
  - `chaserNearby` = any chaser's latest position within 100 m of my latest position, both less than 60 s old.
- **Marshal:** everyone's latest positions.
- **Jailed runner:** the marshal view as it was at `now − spectatorDelayMin`.
- **Lobby and ended:** only `me` (if known).

- [ ] **Step 1: Write the failing tests.** Use a fixture game started at T0 with hide 5, length 45, ping 5.

```ts
// clock.test.ts
expect(phaseAt(lobbyGame, T0).phase).toBe('lobby')
expect(phaseAt(game, T0 + 4*MIN).phase).toBe('hiding')
expect(phaseAt(game, T0 + 5*MIN).phase).toBe('chasing')            // boundary instants
expect(phaseAt(game, T0 + 50*MIN).phase).toBe('ended')
expect(pingTimes(game).map(p => p.revealAt)).toEqual([10,15,20,25,30,35,40,45].map(m => T0 + m*MIN))   // none at 50 (end)
expect(pingTimes(game)[0].alertAt).toBe(T0 + 10*MIN - 30_000)
expect(dueWork(game, [], T0 + 10*MIN)).toEqual({ alert: [1], reveal: [1], end: false })
expect(dueWork(game, pingsWith({1:{alerted:true,revealed:true}}), T0 + 10*MIN)).toEqual({ alert: [], reveal: [], end: false })  // advance is idempotent under repeated calls
expect(dueWork(game, allDone, T0 + 50*MIN).end).toBe(true)
// views.test.ts
it('chaser sees runners fuzzed at the last reveal, not live', ...)        // runner moved after reveal → dot at pre-reveal point (within 15 m), fuzzy true
it('missed check-in shows last known position, flagged', ...)            // last position before previous reveal → missed true
it('runner with no position at reveal is listed as never checked in', ...) // no dot, feed contains '#07 never checked in'
it('runner sees teammates but never chasers', ...)
it('chaserNearby only when a fresh chaser fix is within 100 m', ...)      // 90 m fresh → true; 90 m but 2 min old → false; 120 m → false
it('jailed runner sees everyone delayed by the spectator delay', ...)
```

- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** `clock.ts` and `views.ts`. Feed text comes from events: `caught` → `#07 caught by Ben`; `jailbreak` → `Wei broke 3 runners out of jail`; `ping` → `Ping — 6 runners seen`; `chase` → `Chasers released`.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: game clock and role-filtered views`

### Task 4: Catch, jailbreak and results rules

**Files:** Create `app/shared/catch.ts`, `app/shared/results.ts`. Test: `app/shared/catch.test.ts`, `app/shared/results.test.ts`.

**Interfaces — Produces:**

```ts
export type CatchJudgement = { ok: true; flagged: boolean; runnerId: string } | { ok: false; reason: 'not-chasing' | 'not-a-chaser' | 'unknown-tag' | 'already-caught' | 'too-far' }
export function judgeCatch(i: { phase: Phase; chaser: Player; tagId: number | null; players: Player[]; chaserPos: Position | null; runnerPos: Position | null; now: number }): CatchJudgement
export type BreakJudgement = { ok: true; freedIds: string[] } | { ok: false; reason: 'not-chasing' | 'not-a-free-runner' | 'too-far-from-jail' | 'nobody-to-free' }
export function judgeJailbreak(i: { phase: Phase; runner: Player; players: Player[]; runnerPos: Position | null; jail: LatLng }): BreakJudgement   // frees jailed && !freed_once
export function computeResults(   // returns Results from types.ts (Task 1)
game: Game, players: Player[], events: GameEvent[]): Results
```

Catch rules:
- `too-far` when both positions are known and less than 2 min old, and the distance is over 50 m.
- `flagged` when either position is unknown or more than 2 min old.
- The jailbreak position must be known and within 30 m of the jail.

- [ ] **Step 1: Write the failing tests.**
  - `catch within 50 m succeeds unflagged`
  - `catch over 50 m with fresh fixes is rejected as too-far`
  - `catch with unknown chaser position is allowed but flagged`
  - `second scan of a caught runner is rejected as already caught`
  - `unknown tag id is rejected`
  - `only chasers can catch, only while chasing`
  - `jailbreak frees jailed runners not freed before`
  - `jailbreak 40 m from jail is rejected`
  - `runners win when any runner is free at the end; chasers win when all are caught`
  - `awards pick longest survivor, most catches, jailbreak hero`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: catch, jailbreak and results rules`

### Task 5: Game database, store and API actions

**Files:**
- Create: `supabase/migrations/0003_game.sql`, `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`, `app/api/_lib/secrets.ts`, `app/api/_lib/actions.ts`, `app/api/game.ts`
- Test: `app/api/_lib/actions.test.ts`

**Interfaces — Produces:**

```ts
// store.ts
export interface GameStore {
  createGame(g: Omit<Game,'id'> & { host_key_hash: string }): Promise<Game>
  gameByCode(code: string): Promise<(Game & { host_key_hash: string }) | null>
  updateGame(id: string, patch: Partial<Game>): Promise<void>
  addPlayer(p: Omit<Player,'id'> & { token_hash: string }): Promise<Player>
  playerByToken(gameId: string, tokenHash: string): Promise<Player | null>
  players(gameId: string): Promise<Player[]>
  updatePlayers(patches: { id: string; patch: Partial<Player> }[]): Promise<void>
  addPosition(gameId: string, playerId: string, p: Omit<Position,'at'>): Promise<void>   // at = server now
  positions(gameId: string, sinceIso: string): Promise<Record<string, Position[]>>      // ascending by at
  pings(gameId: string): Promise<Ping[]>
  claimPing(gameId: string, seq: number, field: 'alerted' | 'revealed'): Promise<boolean> // true only for the first caller (conditional update)
  claimEnd(gameId: string, winner: 'runners'|'chasers'): Promise<boolean>                 // true only for the first caller
  addEvent(e: Omit<GameEvent,'id'|'at'>): Promise<void>
  events(gameId: string): Promise<GameEvent[]>
}
export class MemoryStore implements GameStore { constructor(clock: () => number) }
// actions.ts — every action takes (store, now: number, push: PushFn, body) and returns a JSON-able result or throws ActionError(status, message)
export type PushFn = (sub: PushSubscriptionJSON, payload: string) => Promise<void>
export const actions: Record<'create'|'join'|'setRoles'|'start'|'linkTag'|'state'|'location'|'catch'|'jailbreak'|'subscribe', Action>
```

Request and response shapes. Every non-create, non-join call carries `code`, plus `token` (player) or `hostKey` (organiser).

| Action | Body | Returns | Notes |
|---|---|---|---|
| `create` | `{ arenaId, center?, settings? }` | `{ code, hostKey }` | `arenaId: 'around-me'` uses `arenaAroundPoint(center)` |
| `join` | `{ code, name, accepted: true, token? }` | `{ token, playerId }` | `accepted` must be `true`. A known `token` returns the same player. Name 1–24 chars |
| `setRoles` | `{ code, hostKey, roles?: Record<id,Role>, shuffle?: true, marshalIds? }` | `{ roles, problems: string[] }` | lobby only |
| `start` | `{ code, hostKey }` | `{ startedAt }` | lobby only; 409 if `validateTeams` fails or any runner lacks `tag_id` |
| `linkTag` | `{ code, token, tagId }` | `{ tagId }` | runners only, lobby only; 409 `Tag 07 is already taken` |
| `state` | `{ code, token? , hostKey? }` | `View` | runs `advance()` first. A host without a player gets the marshal view |
| `location` | `{ code, token, lat, lng, accuracy_m }` | `{ ok: true }` | ignored once ended |
| `catch` | `{ code, token, tagQr }` | `CatchJudgement` | on ok: sets runner caught/jailed, event `caught` (`data.flagged`) |
| `jailbreak` | `{ code, token, qr }` | `BreakJudgement` | `qr` must equal `JAIL_QR` |
| `subscribe` | `{ code, token, subscription }` | `{ ok: true }` | stores push subscription |

`advance(store, game, now, push)`:
- For each `dueWork` alert seq: if `claimPing(...,'alerted')` succeeds **and** the mode is `push`, push to free runners with a subscription. Payload: `{ type: 'checkin', code, seq }`.
- For each reveal: `claimPing(...,'revealed')`, then event `ping`.
- On `end`: `claimEnd` with the winner from `computeResults`, then event `ended`.
- On the first `state` in chase: event `chase` once (claimed via a ping seq 0 row).

The migration creates the tables from the store shape:
- `games` (`arena jsonb`, `settings jsonb`, `host_key_hash`)
- `players` (`token_hash`, `push jsonb`)
- `locations` (index on `(game_id, at)`)
- `pings` (primary key `(game_id, seq)`, created at `start` from `pingTimes`, plus seq 0)
- `events`

It enables RLS with **no policies** (anon gets nothing). `claimPing` and `claimEnd` use `update ... where flag = false returning` (or `ended_at is null`).

- [ ] **Step 1: Write the failing tests** in `actions.test.ts`, against `MemoryStore` with a controllable clock and a recording `PushFn`:
  - `create then join returns a token and player`
  - `join without accepting the terms is rejected (400)`
  - `rejoin with stored token returns the same player`
  - `start refuses lopsided teams with the validateTeams messages (409)`
  - `start refuses when a runner has no tag (409 'Runner Aina has no tag')`
  - `linkTag refuses a tag already linked (409 'Tag 07 is already taken')`
  - `state at the first alert time pushes once to runners with subscriptions in push mode` (two `state` calls → one push per runner)
  - `schedule mode never pushes`
  - `catch flow: chaser scans runner tag → runner jailed, event caught, second scan already-caught`
  - `jailbreak flow frees jailed runners once`
  - `game ends exactly once and chasers win when everyone is caught`
  - `non-host cannot setRoles or start (403)`
  - `state never returns runner positions to a chaser except fuzzed at reveal`
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** `MemoryStore`, `actions`, `secrets`, then `SupabaseStore` (same interface; not unit-tested; covered by Task 10's smoke test) and the `api/game.ts` router:
  - `POST` only; `400` on an unknown action.
  - `ActionError` maps to its status; other errors give `500 {error}`.
  - Write the migration.
- [ ] **Step 4:** Run `npm --prefix app test` and `npm --prefix app run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit.** `feat: game store, actions and api router`

### Task 6: Client plumbing: API, session, polling, map, scanner

**Files:**
- Create: `app/src/game/api.ts`, `app/src/game/session.ts`, `app/src/game/useGameState.ts`, `app/src/game/Map.tsx`, `app/src/game/mapStyle.ts`, `app/src/game/Scanner.tsx`
- Modify: `app/package.json` (add `maplibre-gl`, `qr-scanner`, `qrcode`, `@types/qrcode`), `app/public/sw.js`
- Test: `app/src/game/session.test.ts`, `app/src/game/useGameState.test.tsx`, `app/src/spike/sw.test.ts` (extend)

**Interfaces — Produces:**

```ts
// api.ts
export async function call<T>(action: string, body: object): Promise<T>   // POST /api/game; throws ApiError(status, message)
// session.ts
export function saveSession(storage: Storage, code: string, s: { token?: string; hostKey?: string }): void
export function loadSession(storage: Storage, code: string): { token?: string; hostKey?: string }
// useGameState.ts
export function useGameState(code: string, opts: { sendLocation: 'always' | 'when-open' | 'never' }): { view: View | null; error: string | null; refresh(): void }
```

- `useGameState` polls `state` every 3 s while `document.visibilityState === 'visible'`.
- Location: chasers and marshals use `watchPosition` and send at most every 5 s; runners send once on mount and on each poll while visible, at most every 15 s.

Other files:
- **`Map.tsx`** renders `arena.boundary` (thin white line), the jail (white outlined pill), and `dots` per Global Constraints. Fuzzy dots are a 15 m circle; missed ones are dashed. It recentres once on `me`.
- **`mapStyle.ts`** builds a MapLibre style on the source `https://tiles.openfreemap.org/planet`: background `#0F1411`, water `#132230`, parks `#111A14`, roads `#1C221E`, no labels except park names in Geist at 50% white.
- **`Scanner.tsx`** wraps `qr-scanner` on a `<video>`, calls `onResult(text)` once, and shows a fallback number input for runners linking a tag.
- **`sw.js` push:** if `data.type === 'checkin'`, show `Ping in 30s — check in!` with `tag: 'kejar-ping'` and open `/g/<code>` on tap. Keep the spike behaviour for payloads with `pingId`.

- [ ] **Step 1: Write the failing tests.**
  - session: save/load round-trip per code; separate codes don't collide.
  - `useGameState`: with fake timers and a mocked `call`, polls every 3 s while visible and stops when hidden.
  - sw: `checkin` payload shows the copy above and the tap opens `/g/ABC234`.
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above. No unit test is needed for `Map`, `Scanner` or `mapStyle` (thin wrappers over browser libraries); Task 10's smoke test covers them.
- [ ] **Step 4:** Run `npm --prefix app test` and `npm --prefix app run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: game client plumbing, map and scanner`

### Task 7: Organiser screens: create, lobby, roles, start

**Files:**
- Create: `app/src/screens/Home.tsx`, `HostNew.tsx`, `HostLobby.tsx`, `PrintTags.tsx`
- Modify: `app/src/routes.ts` (+ routes), `app/src/App.tsx`
- Test: `app/src/routes.test.ts` (extend), `app/src/screens/HostLobby.test.tsx`

**Routes (Produces):**
- `/` → `home`
- `/host/new` → `host-new`
- `/host/:code` → `host-lobby`
- `/g/:code` → `game`
- `/join/:code` → `join`
- `/print/tags` → `print-tags`

`routeFor` now returns `{ route: Route; code?: string }`; update the existing tests accordingly.

Screens:
- **Home:** `kejar.` wordmark, a code input with **Join**, and a small **Organise a game** link.
- **HostNew:**
  - Arena choice: `Taman Tasik Titiwangsa (test)` or **Around me** (uses `getCurrentPosition`).
  - Settings with spec defaults and ranges; check-in mode toggle **Push alerts / Fixed schedule**.
  - **Create** → saves `hostKey` → goes to `/host/<code>`.
- **HostLobby:**
  - The join QR code and link (`/join/<code>`).
  - Player list with role pickers and a **Shuffle roles** button.
  - Problems from `setRoles` / `start` shown verbatim.
  - **Start game**.
  - Once started, shows `MarshalLive` (Task 9).
- **PrintTags:** an A4 grid of 30 runner tags (`#01`–`#30`, a 40 mm QR of `tagQr(n)` each, the `kejar.` wordmark) plus one large `JAIL` QR. Print-friendly: black on white, no lime text.

- [ ] **Step 1: Write the failing tests.**
  - The routes above.
  - HostLobby with mocked `call`: shows `Need at least 1 chaser` when `start` returns 409 with that message; **Shuffle roles** calls `setRoles` with `shuffle: true`.
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: organiser create, lobby and printable tags`

### Task 8: Player screens: join, lobby, hide, chase, catch

**Files:**
- Create: `app/src/screens/Join.tsx`, `Lobby.tsx`, `Hide.tsx`, `ChaserChase.tsx`, `RunnerChase.tsx`, plus a `GameScreen` switch in `App.tsx`
- Test: `app/src/screens/Join.test.tsx`, `app/src/screens/RunnerChase.test.tsx`

**Screen behaviour** (copy and layout follow the v5 mockup, `.superpowers/brainstorm/97-1792411883/content/kejar-ui-v5.html`):

- **Join:**
  - Name input and two required checkboxes: the code of conduct (`No grabbing, no tackling. One hand, arm only. “Stop” means stop.`) and the waiver (`I accept the waiver and share my location during this game only.`).
  - **Join game** stays disabled until both are ticked.
  - Then: push setup (reuse `pushSupport` / `subscribe` from the spike, sending `subscribe`) when the mode is `push`.
  - Then `/g/<code>`.
- **Lobby** (phase `lobby`): shows the role. A runner without a tag gets **Scan your tag** (Scanner + number fallback → `linkTag`); with a tag, it shows `#07`.
- **Hide** (phase `hiding`): big monospace countdown to `endsAt`.
  - Runner: map plus "Put your phone on silent".
  - Chaser: `Stay put. Eyes closed.` with no map.
- **ChaserChase:**
  - Map with the view's dots.
  - Timers for last and next reveal.
  - **Scan ripped tag** → Scanner → `catch`. Show `Caught #07 ✓`, `Caught #07 — flagged for marshal`, or the rejection text: `Too far — get within 50 m`, `Already caught`, `That's not a Kejar tag`.
- **RunnerChase:**
  - Next check-in countdown (`nextRevealAt`). Within 30 s of it, a full-width lime card `PING IN 0:24 — CHECK IN` (copy from the spec). Opening the page sends the location (handled by the hook).
  - Lime dot plus `Chaser within 100 m` when `chaserNearby`.
  - Teammates map and feed.
- **Routing inside `GameScreen`:** `ended` → Results (Task 9); `me.jailed` → Jail (Task 9); marshal role → MarshalLive (Task 9).

- [ ] **Step 1: Write the failing tests.**
  - `Join keeps the button disabled until both checkboxes are ticked`.
  - `RunnerChase shows the check-in card only in the last 30 s before a reveal`.
  - `RunnerChase shows the chaser warning when chaserNearby`.
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: player join, lobby, hide and chase screens`

### Task 9: Jail, marshal live view and results

**Files:**
- Create: `app/src/screens/Jail.tsx`, `MarshalLive.tsx`, `Results.tsx`
- Test: `app/src/screens/Results.test.tsx`, `app/src/screens/Jail.test.tsx`

Screens:
- **Jail:**
  - `Caught by Ben`, `Walk to jail.`
  - A delayed spectator map (the view already applies the delay) with the label `Spectator view · 2 min delayed`.
  - The feed.
  - A free runner's own screen (RunnerChase) also gets a **Break them out** button → Scanner → `jailbreak`, with the result text `Freed 3 runners ✓` / `Get within 30 m of the jail` / `Nobody to free`.
- **MarshalLive:** a map of everyone, counts, the feed. SOS, reports, pause and alerts arrive in Plan 3.
- **Results:** `Runners escaped.` or `Chasers win.`, awards from `view.results`, and **Play again** → `/host/new` (host only).

- [ ] **Step 1: Write the failing tests.**
  - `Results shows the winner line and three awards`.
  - `Results hides awards that are null`.
  - `Jail shows the spectator delay label from settings`.
- [ ] **Step 2:** Run `npm --prefix app test`. Expected: FAIL.
- [ ] **Step 3: Implement** the screens; add **Break them out** to RunnerChase.
- [ ] **Step 4:** Run `npm --prefix app test`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: jail, marshal live view and results`

### Task 10: Deploy and two-phone smoke test (owner with Claude)

**Files:** Modify `docs/superpowers/spike-results.md` → append a "Plan 2 smoke test" section.

- [ ] **Step 1: Apply the migration.** The owner pastes `supabase/migrations/0003_game.sql` into the Supabase SQL editor and runs it. Expected: `Success`, and 5 new tables in Table Editor.
- [ ] **Step 2: Deploy.** Push `main`; Vercel auto-deploys. Expected: `POST /api/game {action:'state', code:'NOPE'}` returns `404 {"error":"Game not found"}`.
- [ ] **Step 3: Smoke test** with the owner's Android plus a laptop browser as the second player:
  - create (**Around me**) → join on both → shuffle → link a tag (number fallback on the laptop) → start with hide set to 1 min and ping set to 2 min;
  - the check-in alert arrives on the Android;
  - the chaser map shows a fuzzy runner after the reveal;
  - scan a printed tag → caught → jail → results.

  Expected: every step works. Record any failures.
- [ ] **Step 4: Commit.** `docs: plan 2 smoke test results`
