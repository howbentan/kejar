# Kejar Plan 3: Marshal and Safety Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give marshals the tools to keep a game safe:
- **Players:** SOS and Report buttons on every runner and chaser screen.
- **Marshals:** a live alert list (SOS, reports, left the play area, missed 2 check-ins, chaser left the start early, catches to check), pause and resume for everyone, and removing a player.

**Architecture:**
- **Alerts are events.** New event types are written by actions (`sos`, `report`) or by automatic checks in `location` and `advance`. A pure `alertsFrom()` in `app/shared/alerts.ts` turns them into `View.alerts`, for marshals only.
- **Pause** is stored on the game as `paused_at` plus a list of closed `pauses`.
  - `app/shared/clock.ts` maps every schedule time through `toWall()`, which pushes it later by the pauses before it. An open pause counts up to `now`, so countdowns freeze by themselves.
  - Resume runs one atomic database function that closes the pause and shifts the unrevealed ping rows.
- **Removal** sets `players.removed_at`.
  - `store.players()` leaves removed players out, so maps, counts, catches and results drop them with no other changes.
  - `playerByToken()` still returns them, so their page can show the "removed" screen.
- Still one `api/game.ts` function: new actions are `sos`, `report`, `handleAlert`, `pause`, `resume`, `removePlayer`.

**Tech Stack:** existing (Vite + React + TS, Vitest, MapLibre v5, Supabase, Vercel, web-push).

**Spec:** `docs/superpowers/specs/2026-10-19-kejar-design.md` §5 and §5.1 (§4.4 for the start-point rule, §4.5 for missed check-ins, §4.6 for flagged catches). Context: `docs/HANDOFF.md`.

## Global Constraints

- Colours: Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3` only. SOS and alert pins are lime (spec §9).
- **Marshal actions:** the organiser (`hostKey`) or a player whose role is `marshal`. Anyone else gets 403 `Marshals only`.
- **SOS:**
  - Any runner or chaser, including jailed, during `hiding` or `chasing` (including paused).
  - Repeats within 30 s (`SOS_REPEAT_MS = 30_000`) return `{ ok: true }` with no new alert or push.
- **Report:**
  - Reasons are `'unsafe' | 'dispute' | 'other'`, labelled "Unsafe play", "Catch dispute", "Something else".
  - The note is optional, trimmed, ≤140 characters.
  - The target must be another player in the game.
- **Automatic alerts:**
  - **Outside:** more than `OUTSIDE_MARGIN_M = 20` m beyond the boundary. Re-armed once the player is back inside the polygon.
  - **Left the start:** a chaser during hiding more than `START_RADIUS_M = 50` m plus `min(accuracy, 20)` from `arena.start`. Once per chaser.
  - **Missed 2 check-ins:** scheduled pings only; once per streak.
  - **Flagged catch:** a `caught` event with `data.flagged === true`.
- **Pause:**
  - While paused, `catch`, `jailbreak`, `claim` and `usePowerup` return `{ ok: false, reason: 'paused' }`. `location`, `sos` and `report` still work.
  - Shield expiry is not extended.
- Alert copy, exactly (`<who>` = `Aina #07` for a runner with a tag, otherwise the name):
  - `SOS from <who>`
  - `<reporter> reported <target>: <reason label>`, plus ` — <note>` when a note is given
  - `<who> left the play area`
  - `<who> missed 2 check-ins`
  - `<name> left the start early`
  - `Check catch: <tag> by <chaser> (position unknown)`
- Public feed copy, exactly: `Game paused by a marshal`, `Game resumed`, `<name> left the game`. SOS, reports and automatic alerts never appear in the public feed.
- Player copy, exactly: `Marshals alerted`, `Report sent`, `Game paused`, `A marshal removed you from this game`.
- Event `data` carries the names it needs (`name`, `targetName`, `who`), so alerts still read correctly after a player is removed.
- Free tiers only. Keep a single `api/game.ts` function. Never print or commit keys.

## Review Focus

1. **Two marshals tap Pause or Resume at the same moment.** Exactly one pause is recorded and the clocks shift once. → Task 3 test `a second pause or resume changes nothing`.
2. **Pause between a check-in alert and its reveal.** The reveal moves later by the pause length; it is neither lost nor fired during the pause. → Task 2 test `an alerted ping still reveals, later by the pause`.
3. **GPS jitter at the edge of the play area.** Hovering 5–15 m outside makes no alert; a clear exit makes one; coming back and leaving again makes a second. → Task 5 test `boundary jitter alerts once per real exit`.
4. **A removed player keeps the page open.** Polling shows the removed screen. Every other action is refused with 403. They can't be caught, and they no longer stop "all runners jailed" from ending the game. → Task 4 tests.
5. **A panicked double or triple tap on SOS.** One alert and one push per 30 s. → Task 4 test `repeat SOS within 30 s sends nothing new`.

## File Structure

```
supabase/migrations/0005_safety.sql        # new columns, safety_records, resume_game()
app/shared/types.ts            (modify)    # Game.paused_at/pauses, Player.removed_at/outside/left_start, EventTypes
app/shared/fixtures.ts         (modify)    # defaults for the new fields
app/shared/clock.ts            (modify)    # toWall(), pauses in bounds/pingTimes/dueWork
app/shared/geo.ts              (modify)    # distanceOutsideM()
app/shared/alerts.ts           (new)       # Alert type, alertsFrom(), missedTwoInARow(), who()
app/shared/views.ts            (modify)    # View.paused, alerts, reportable; feed texts
app/api/_lib/store.ts          (modify)    # interface + MemoryStore: pause/resume, flags, removal, safety records
app/api/_lib/supabaseStore.ts  (modify)    # same, Supabase
app/api/_lib/actions.ts        (modify)    # sos, report, handleAlert, pause, resume, removePlayer; auto alerts
app/public/sw.js               (modify)    # {type:'alert'} notifications
app/src/game/SafetyBar.tsx     (new)       # SOS + Report for runners and chasers
app/src/game/MarshalTools.tsx  (new)       # alert list, pause/resume, remove
app/src/game/Map.tsx           (modify)    # lime alert pins
app/src/game/auth.ts           (new)       # credentials for the current session (token or hostKey)
app/src/screens/Paused.tsx     (new)
app/src/screens/Removed.tsx    (new)
app/src/screens/GameScreen.tsx (modify)    # routes paused/removed, mounts SafetyBar
app/src/screens/MarshalLive.tsx(modify)    # mounts MarshalTools, frozen clock
app/src/screens/Lobby.tsx      (modify)    # marshals are offered notifications in any check-in mode
```

---

### Task 1: Schema, types and store

**Files:**
- Create: `supabase/migrations/0005_safety.sql`
- Modify: `app/shared/types.ts`, `app/shared/fixtures.ts`, `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts` (new), `app/api/_lib/supabaseStore.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `Game.paused_at: string | null`
  - `Game.pauses: { from: string; to: string }[]`
  - `Player.removed_at: string | null`
  - `Player.outside: boolean`
  - `Player.left_start: boolean`
  - `EventType` adds `'sos' | 'report' | 'outside' | 'missed' | 'left-start' | 'handled' | 'paused' | 'resumed' | 'removed'`
- Produces, on `GameStore`:
  - `pauseGame(gameId): Promise<boolean>` sets `paused_at` = store clock, but only if the game is started, not ended and not paused. True for the first caller.
  - `resumeGame(gameId): Promise<number | null>` atomically appends `{from: paused_at, to: now}` to `pauses`, clears `paused_at`, and adds the pause length to `alert_at` and `reveal_at` of every ping row with `revealed = false`. Returns the pause length in ms, or null if the game wasn't paused.
  - `setFlag(playerId, field: 'outside' | 'left_start', value: boolean): Promise<boolean>` writes only if the value differs. True if it changed.
  - `removePlayer(id): Promise<boolean>` sets `removed_at` only if it was null.
  - `players(gameId)` now **excludes** removed players. `playerByToken` still returns them.
  - `addSafetyRecord(r: SafetyRecord): Promise<void>`, where `SafetyRecord = { game_id; type: 'sos' | 'report' | 'removed'; player_id: string | null; target_id: string | null; lat: number | null; lng: number | null; data: Record<string, unknown> }` and `at` = store clock.
  - `addEvent` now returns the stored `GameEvent`. `handleAlert` (Task 4) needs ids.

- [ ] **Step 1: Write `0005_safety.sql`**

  It contains:
  - `alter table games add column paused_at timestamptz, add column pauses jsonb not null default '[]'`.
  - `alter table players add column removed_at timestamptz, add column outside boolean not null default false, add column left_start boolean not null default false`.
  - `create table safety_records`: `id uuid pk`, `game_id uuid references games on delete set null`, `type text check in ('sos','report','removed')`, `player_id uuid`, `target_id uuid`, `lat float8`, `lng float8`, `data jsonb not null default '{}'`, `at timestamptz not null`. RLS on, no policies. No cascade delete: it must outlive the 24 h game wipe.
  - `create function resume_game(p_game uuid, p_at timestamptz) returns int` (pause length in ms, or null). It takes `select … for update` on the game row and returns null when `paused_at is null`. Otherwise it appends to `pauses`, clears `paused_at`, and runs `update pings set alert_at = alert_at + d, reveal_at = reveal_at + d where game_id = p_game and not revealed`. Execute is revoked from public, anon and authenticated, and granted to service_role, as in `0004`.

- [ ] **Step 2: Write failing `MemoryStore` tests in `store.test.ts`**

  - `pauseGame is true once, then false while paused`
  - `resumeGame shifts only unrevealed pings and records the pause`: pause at T, resume at T+90 s. The unrevealed ping's `reveal_at` is +90 000 ms, the revealed one is unchanged, `pauses` has length 1, and the second resume returns `null`.
  - `setFlag reports only real changes`: false→true gives true, true→true gives false.
  - `removed players vanish from players() but not from playerByToken()`

- [ ] **Step 3: Run `npx vitest run api/_lib/store.test.ts`.** Expected: FAIL (methods missing).

- [ ] **Step 4: Implement the types, fixture defaults and both stores**

  - Defaults: `paused_at: null`, `pauses: []`, `removed_at: null`, `outside: false`, `left_start: false`.
  - `SupabaseStore` mirrors `MemoryStore`:
    - `pauseGame`, `setFlag` and `removePlayer` are conditional updates with `.select('id')` (the `catchRunner` pattern).
    - `resumeGame` calls `rpc('resume_game', { p_game, p_at: nowIso })`.
    - `players()` adds `.is('removed_at', null)`.
    - `PLAYER_COLUMNS` and `GAME_COLUMNS` gain the new columns.
  - `create` in `actions.ts` passes `paused_at: null, pauses: []`; `join` passes the three player defaults.

- [ ] **Step 5: Add a `supabaseStore.test.ts` test** that `resumeGame` calls the `resume_game` RPC with the store clock's ISO time, using the existing fake-db pattern extended with `rpc`.

- [ ] **Step 6: Run `npx vitest run && npx tsc -b`.** Expected: all pass, no type errors.

- [ ] **Step 7: Commit** `feat: schema and store for pause, removal, alert flags and safety records`

---

### Task 2: Pause-aware clock

**Files:**
- Modify: `app/shared/clock.ts`
- Test: `app/shared/clock.test.ts`

**Interfaces:**
- Consumes: `Game.paused_at`, `Game.pauses` (Task 1).
- Produces:
  - `toWall(game: Game, t: number, now: number): number` maps a schedule time (as if never paused) to wall time.
  - `bounds()`, `phaseAt`, `chaseStartOf` and `pingTimes` take an optional `now`. When it is omitted, an open pause is ignored, which only matters while paused.
  - `dueWork` returns empty work while `paused_at` is set.

- [ ] **Step 1: Write the failing tests**

  - `a pause during hiding moves hide end and game end later by its length`
  - `a pause during the chase leaves hide end alone and moves the end`
  - `an open pause freezes the countdown`: `phaseAt(g, now).endsAt - now` is the same at pause+0 s and pause+40 s.
  - `nothing is due while paused`: a ping whose wall time has passed during the pause is not in `dueWork`.
  - `an alerted ping still reveals, later by the pause`: alert at R−30 s, pause from R−10 s to R+50 s. Reveal is due at R+60 s, not before.

- [ ] **Step 2: Run `npx vitest run shared/clock.test.ts`.** Expected: FAIL.

- [ ] **Step 3: Implement `toWall`**

  Walk the pauses sorted by `from`, with the open pause as `{from: paused_at, to: now}`:

  ```ts
  let w = t
  for (const p of sortedPauses) if (Date.parse(p.from) <= w) w += Date.parse(p.to) - Date.parse(p.from)
  return w
  ```

  `bounds(game, now)` maps `start + hide` and `start + hide + length` through it. `pingTimes(game, now)` maps each `revealAt` (and `alertAt = revealAt − ALERT_LEAD_MS`).

- [ ] **Step 4: Thread `now` through the callers.** These are `views.ts` (`phaseAt`, `nextReveal`) and `actions.ts` (`advance`, `start`). `start` has no pauses yet, so nothing changes there.

- [ ] **Step 5: Run `npx vitest run && npx tsc -b`.** Expected: PASS.

- [ ] **Step 6: Commit** `feat: pauses push the game clock later`

---

### Task 3: Pause and resume actions

**Files:**
- Modify: `app/api/_lib/actions.ts`, `app/shared/views.ts`
- Test: `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `pauseGame`, `resumeGame` (Task 1); the pause-aware clock (Task 2).
- Produces:
  - `requireMarshal(ctx, game, body): Promise<Player | null>`: null for the organiser, else the marshal player. Throws 403 `Marshals only`.
  - Actions `pause` and `resume` take `{code, hostKey | token}` and return `{ ok: boolean }`. Each adds a `paused` or `resumed` event only when it changed something.
  - `View.paused: boolean`.

- [ ] **Step 1: Write the failing tests**

  - `organiser and marshal can pause; a runner gets 403 Marshals only`
  - `a second pause or resume changes nothing`: one `paused` event, one `resumed` event, `pauses.length === 1`.
  - `while paused, catch / jailbreak / claim / usePowerup answer paused`
  - `a 2-minute pause makes the game end 2 minutes later`
  - `feed shows Game paused by a marshal and Game resumed` (views test)
  - `pause in the lobby or after the end is refused 409`

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement**

  - The `paused` refusal goes right after `advance()` in the four scan or use actions: `if (fresh.paused_at) return { ok: false, reason: 'paused' }`.
  - `viewFor` sets `paused: !!game.paused_at`.
  - Add the feed texts.

- [ ] **Step 4: Run `npx vitest run && npx tsc -b`.** Expected: PASS.

- [ ] **Step 5: Commit** `feat: marshals pause and resume the game for everyone`

---

### Task 4: SOS, report, handled and remove

**Files:**
- Create: `app/shared/alerts.ts`
- Modify: `app/api/_lib/actions.ts`, `app/shared/views.ts`, `app/public/sw.js`
- Test: `app/shared/alerts.test.ts` (new), `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `requireMarshal` (Task 3); `addSafetyRecord`, `removePlayer` (Task 1).
- Produces, in `alerts.ts`:
  - `type AlertKind = 'sos' | 'report' | 'outside' | 'missed' | 'left-start' | 'flagged-catch'`
  - `interface Alert { id: string; at: string; kind: AlertKind; text: string; where: LatLng | null; handled: boolean }`
  - `who(p: Player): string` gives `Aina #07`, or just the name.
  - `alertsFrom(events: GameEvent[]): Alert[]`: open alerts newest first, then handled ones newest first.
  - Copy is in Global Constraints. `outside`, `missed` and `left-start` are wired in Task 5; `alertsFrom` handles all six kinds now.
- Produces, actions:
  - `sos {code, token, lat?, lng?, accuracy_m?}` → `{ ok: true }`. Event `sos` with `data {who, lat, lng}`, a safety record, and a push to marshals.
  - `report {code, token, targetId, reason, note?, lat?, lng?}` → `{ ok: true }`. 400 for a bad reason, a note over 140 characters, or targeting yourself or an unknown player. Event `report` with `data {name, targetName, reason, note, lat, lng}`, a safety record, and a push.
  - `handleAlert {code, hostKey | token, eventId}` → `{ ok: true }`. Adds a `handled` event with `data.eventId`.
  - `removePlayer {code, hostKey | token, playerId}` → `{ ok: boolean }`. Adds a `removed` event with `data.name` and a safety record. If the game is chasing and every remaining runner is jailed, it finishes the game.
- Produces, views:
  - `View.alerts: Alert[]`, non-empty only for marshals and the organiser.
  - `View.reportable: { id: string; name: string }[]`: every other player in the game.
- Produces, push:
  - Extract `pushTo(ctx, players, payload)` from `advance` (it clears expired subscriptions).
  - Marshal pushes use the payload `{ type: 'alert', code, text }`.
- Removed players:
  - `requirePlayer` throws 403 `You were removed from this game` for removed players in every action except `state`.
  - `state` builds the view normally; the client sees `me.removed_at`.
  - `locationMode` returns `'never'` for them (Task 6).

- [ ] **Step 1: Write the failing tests**

  - `alertsFrom` tests:
    - Each kind's exact copy.
    - The report note is appended with ` — `.
    - Handled alerts sink below open ones.
    - Non-alert events are ignored.
  - Action tests:
    - `SOS pushes every subscribed marshal and writes a safety record`
    - `repeat SOS within 30 s sends nothing new`: three calls give one `sos` event and one push; a call at +31 s gives a second of each.
    - `report validates reason, note length and target`
    - `marshals see alerts; runners and chasers see none`
    - `SOS and reports stay out of the public feed`
    - `handleAlert marks it handled`
    - `a removed runner is refused with 403 except state, which shows removed_at`
    - `a removed runner can't be caught`: catch → `{ ok: false }`, `unknown-tag`.
    - `removing the last free runner while the rest are jailed ends the game`

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `alerts.ts`, the actions, the view fields and the shared push helper.**

- [ ] **Step 4: Handle `{type:'alert', code, text}` in `sw.js`**

  Show a notification with `body: text`, `tag: 'kejar-alert'`, `renotify: true`, `requireInteraction: true` and `data.url = /g/<code>`. Click handling already navigates to `data.url`.

- [ ] **Step 5: Run `npx vitest run && npx tsc -b`.** Expected: PASS.

- [ ] **Step 6: Commit** `feat: SOS, reports, handled alerts and removing a player`

---

### Task 5: Automatic alerts

**Files:**
- Modify: `app/shared/geo.ts`, `app/shared/alerts.ts`, `app/api/_lib/actions.ts`
- Test: `app/shared/geo.test.ts`, `app/shared/alerts.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `setFlag` (Task 1); `alertsFrom` and `who` (Task 4).
- Produces:
  - `distanceOutsideM(p: LatLng, poly: LatLng[]): number` is 0 inside the polygon, else the metres to the nearest edge. Use a local equirectangular projection around `p`, plus point-to-segment distance.
  - `missedTwoInARow(windows: number[], lastAt: number | null): boolean`:
    - `windows = [chaseStart, reveal1, …, revealK]`, scheduled reveals only, ending at the reveal being processed.
    - With `L = lastAt ?? -Infinity` and `k = windows.length − 1`, it returns `k >= 2 && L <= windows[k−2] && (k === 2 || L > windows[k−3])`.
  - Events:
    - `outside` with `data {who}`, actor = the player
    - `missed` with `data {who}`
    - `left-start` with `data {name}`
    - `flagged-catch` needs no new event; `alertsFrom` reads `caught` events with `data.flagged` (add `who` and `chaser` names to that event's data).

- [ ] **Step 1: Write the failing tests**

  - `distanceOutsideM is 0 inside and ~30 m for a point 30 m past the edge` (±2 m)
  - `missedTwoInARow`: alerts at the second miss, not the third. A check-in resets the streak. No check-in at all alerts at ping 2.
  - `boundary jitter alerts once per real exit`. A runner sends, in order:
    - inside
    - 10 m outside (no alert)
    - 40 m outside (alert)
    - 60 m outside (no new alert)
    - inside
    - 40 m outside (second alert)
  - `a chaser walking off during hiding alerts once; the same during the chase does not`
  - `a runner who skips pings 1 and 2 raises one missed alert at ping 2`
  - `a flagged catch shows as Check catch`

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement the checks**

  - **In `location`**, after storing the position, for players who are not removed and not jailed, during hiding or chasing:
    - `outside`: `distanceOutsideM > OUTSIDE_MARGIN_M` → `setFlag(id, 'outside', true)` and, if it changed, add the event. Back inside the polygon (`distanceOutsideM === 0`) → `setFlag(id, 'outside', false)`.
    - `left-start` (chaser, hiding): `setFlag(id, 'left_start', true)` and, if it changed, add the event.
  - **In `advance`**'s reveal loop, for scheduled seqs only (`seq < BONUS_SEQ_BASE`): build `windows` from `chaseStartOf` plus the scheduled `pingTimes` up to this seq. Then, for each free runner, use their position from the `positions` the loop already fetched.

- [ ] **Step 4: Run `npx vitest run && npx tsc -b`.** Expected: PASS.

- [ ] **Step 5: Commit** `feat: automatic marshal alerts for boundary, start point, missed check-ins and flagged catches`

---

### Task 6: Player screens: SOS, report, paused, removed

**Files:**
- Create: `app/src/game/SafetyBar.tsx`, `app/src/game/auth.ts`, `app/src/screens/Paused.tsx`, `app/src/screens/Removed.tsx`
- Modify: `app/src/screens/GameScreen.tsx`, `app/src/screens/Lobby.tsx`, `app/src/index.css` (or wherever `.btn` lives)
- Test: `app/src/game/SafetyBar.test.tsx`, `app/src/screens/GameScreen.test.tsx` (new)

**Interfaces:**
- Consumes: the actions `sos` and `report`; `View.paused`, `View.reportable` and `me.removed_at`.
- Produces:
  - `credentials(code): { token?: string; hostKey?: string }` from `loadSession`. `PowerUpHand` and `MarshalTools` use it too.
  - `<SafetyBar code view />` is a fixed bottom bar:
    - **SOS** button (lime). Tap → confirm "Send SOS to marshals?" → `currentCoords()` (send without coordinates if that fails) → `sos` → `Marshals alerted`.
    - **Report** button. Opens a sheet with a player `<select>` from `view.reportable`, three reason chips, a note textarea (`maxLength 140`) and Send → `Report sent`.
  - Routing in `GameScreen`, in this order:
    - `me.removed_at` → `<Removed />`
    - ended → results
    - lobby → lobby
    - marshal → `MarshalLive`
    - `view.paused` → `<Paused view />`
    - otherwise as today
  - `SafetyBar` renders under every runner and chaser screen during hiding, chasing and paused, never for marshals or the organiser.
  - `locationMode` returns `'never'` for removed players.
  - The `paused` reason reads `Game is paused` wherever scan results are shown: `ChaserChase` (catch), `Jail` (jailbreak), and `PowerUpHand` (claim and use).

- [ ] **Step 1: Write the failing tests**

  - `SOS asks to confirm, then sends sos with the phone's coordinates and shows Marshals alerted`
  - `SOS still sends when location is unavailable`
  - `Report sends target, reason and note`
  - `Report Send is disabled until a player is picked`
  - `GameScreen shows Game paused to runners and the removed message to removed players` (mock `useGameState`)

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement the screens**

  - `Paused` shows a big `Game paused`, the frozen clock `clock(view.endsAt − view.now)`, and the line "Stay where you are. A marshal will restart the game."
  - `Removed` shows `A marshal removed you from this game` and a Home link.
  - In `Lobby`, offer notifications to marshals whatever the check-in mode: `if ((view.settings.checkinMode !== 'push' && view.me.role !== 'marshal') || view.me.push) return null`.

- [ ] **Step 4: Run `npx vitest run && npx tsc -b`.** Expected: PASS.

- [ ] **Step 5: Commit** `feat: SOS and report buttons, paused and removed screens`

---

### Task 7: Marshal tools

**Files:**
- Create: `app/src/game/MarshalTools.tsx`
- Modify: `app/src/screens/MarshalLive.tsx`, `app/src/game/Map.tsx`, `app/src/screens/RunnerChase.tsx` (`GameClock` freezes when paused)
- Test: `app/src/game/MarshalTools.test.tsx`, `app/src/game/Map.test.tsx`

**Interfaces:**
- Consumes: `View.alerts`, `View.paused`, `View.roster`; the actions `pause`, `resume`, `handleAlert`, `removePlayer`; `credentials` (Task 6).
- Produces:
  - `<MarshalTools code view refresh />` has three parts:
    - **Pause / Resume.** One button whose label follows `view.paused`. It is busy while the call runs, then calls `refresh()`.
    - **Alert list.** Each row shows kind, text and time ago. Open SOS rows are lime-outlined. A "Handled" button appears on open rows, and "Show on map" appears when `where` is set.
    - **Roster.** Each player not yet removed gets a "Remove" button that needs a confirm ("Remove <name> from the game?").
  - `GameMap` gains `pins?: { id: string; lat: number; lng: number }[]`, drawn as lime circles with a white stroke on a `pins` layer above the points. `MarshalLive` passes the open alerts that have `where`.
  - `GameClock` shows `clock(view.endsAt − view.now)` without ticking when `view.paused`. `MarshalLive` shows a "PAUSED" pill.
  - When the number of open SOS alerts goes up between polls, `navigator.vibrate?.([200, 100, 200])`.

- [ ] **Step 1: Write the failing tests**

  - `Pause calls pause with the organiser key and then refreshes`
  - `shows Resume when paused`
  - `Handled calls handleAlert with the event id`
  - `Remove needs confirming before it calls removePlayer`
  - `open alerts come before handled ones`
  - Map test: `alert pins are drawn on their own layer` (existing MapLibre mock pattern)

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.** Replace `MarshalLive`'s plain roster table with the `MarshalTools` roster.

- [ ] **Step 4: Run `npx vitest run && npx tsc -b && npm run build`.** Expected: PASS, and the build succeeds.

- [ ] **Step 5: Check it in the browser**

  Run `npm run dev` with the in-memory store, if available, or against Supabase after Task 8's SQL. Create a game, open the organiser view, check that the Pause button and an empty alert list render, and check the browser console for errors.

- [ ] **Step 6: Commit** `feat: marshal alert list, pause button and player removal`

---

### Task 8: Ship and live check (owner + Claude)

- [ ] **Step 1: The owner runs the SQL.** They paste `supabase/migrations/0005_safety.sql` into the Supabase SQL editor and run it. Claude shows the file's contents in chat to copy.
- [ ] **Step 2: Merge into `main` and push.** Wait for Vercel to serve a new `/assets/index-*.js`.
- [ ] **Step 3: Run a scripted live game** against `https://kejar-eosin.vercel.app/api/game`, following the `live-powerups.mjs` pattern. Use 1 marshal, 1 chaser, 2 runners, hide 1 min, ping 2 min.
  - The chaser walks 100 m off during hiding → a `left-start` alert.
  - A runner goes 60 m outside → an `outside` alert.
  - SOS twice → 1 alert.
  - A report → its alert. Then handle it.
  - Pause 30 s and resume → `endsAt` is 30 s later.
  - Remove a runner → 403 on their next `location` call, plus the removed view.
- [ ] **Step 4: Update `docs/HANDOFF.md`.** Plan 3 is done, `0005` has been applied, and the new marshal tools are listed. Commit and push.
