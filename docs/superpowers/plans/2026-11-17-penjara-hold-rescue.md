# Penjara Hold Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Penjara rescue into a 20-second held key (pause on let-go, reset after 5 s off, one rescuer), give everyone freed from Penjara a 10-second head start, and show it as the lock-and-key animation with sounds.

**Architecture:** `games.rescue` (JSONB) grows hold state (`heldMs`, `holdSince`, `lastBeat`, `releasedAt`). Pure functions in `shared/penjara.ts` turn that record plus `now` into progress and a verdict; `settleRescue` keeps settling lazily on requests. The thumb goes down/up through a new `rescueHold` action; the heartbeat rides on the rescuer's existing 1.5 s location pings with `holding: true`. Resume shifts every rescue time forward by the pause, the way it already shifts `startedAt`. The head start is a new `players.head_start_until`, set only by the three Penjara frees and checked in `judgeCatch`.

**Tech Stack:** React 19 + motion, Vite, Vitest/jsdom, Vercel API (`app/api/_lib/actions.ts`), `MemoryStore` + `SupabaseStore`, Supabase SQL migrations, Web Audio (`app/src/game/sounds.ts`).

**Spec:** `docs/superpowers/specs/2026-11-17-penjara-hold-rescue-design.md`. Mockup to port: `app/mockups/penjara-key/` (`lock.tsx` `FrontLock` + `turnFor`, `sfx.ts`, the CSS in `index.html`, `Gate` in `main.tsx`).

## Global Constraints

- `RESCUE_HOLD_MS = 20_000` (held time), `RESCUE_RESET_MS = 5_000` (no thumb), `RESCUE_BEAT_LAPSE_MS = 2_000` (no heartbeat counts as let go, at the last beat), `HEAD_START_MS = 10_000`, `RESCUE_RADIUS_M` stays 30 m, `RESCUE_PING_MS` stays 1.5 s.
- Four clicks: one per 5 s of held time (`22.5°` each).
- Only the server's clock counts held time. The 5 s window runs from the last beat or the release, whichever applies. Paused time never counts (resume shifts the times).
- One rescuer: a second runner's scan answers `rescue-taken` with the rescuer's name; the rescuer's own re-scan resumes.
- `rescue-failed` events carry `data.reason`: `caught` | `left` | `removed` | `locked` | `reset`.
- Head start blocks every catch that starts from a Kejar's tag scan (plain catch, Super Ring trigger, Hang Hebat bounty); not auto-jail, Mak Kau Hijau or Banjir.
- Exact copy: `HOLD`, `HOLDING`, `RESCUE ON`, `LET GO`, `Press and hold for 20 s. Let go and it waits 5 s, then resets.`, `Keep holding. Stay within 30 m of Penjara.`, `Resets in {n}. Hold again to keep it.`, `{Name} is breaking you out`, `{Name} let go`, `Resets in {n}. {Name} has to hold again.`, `{Name} is already breaking them out.`, `Just freed: {n} s head start.`, `LEPAS!`, `Rescue reset.`, `Nobody gets out this time. Another Dikejar can try.`
- Sounds go through `sounds.ts` and honour `isMuted()`; Android buzz via `navigator.vibrate?.`.
- Both stores change together; new migration **0026**; `head_start_until` in `PLAYER_COLUMNS`. Preserve each file's line endings (several are CRLF; read bytes, never rewrite whole files in text mode).
- Tests: `npx vitest run <file>` from `app/`; gate before commit: `npm test && npm run typecheck && npm run lint`.

## Review Focus

1. **The phone goes quiet mid-hold** (a call, a locked screen): held time stops at the last beat, and the rescue resets 5 s after that beat, not 7. Test in Task 3.
2. **A game pause during a hold or during the 5 s window**: after resume, held time and the remaining window are exactly what they were. Test in Task 2 (resume) and Task 3.
3. **The rescuer is caught while paused-off (let go)**: the rescue fails with `reason: 'caught'`, nobody is freed. Test in Task 3.
4. **A Kejar scans a freed runner at 9.9 s vs 10.1 s of head start**, with a pause in between: refused, then caught. Test in Task 3.
5. **A runner freed by Settle or the reel** gets the same head start as a rescue. Test in Task 3.

---

### Task 1: Rescue rules and the head start (pure)

**Files:**
- Modify: `app/shared/penjara.ts`, `app/shared/types.ts`, `app/shared/catch.ts`
- Test: `app/shared/penjara.test.ts`, `app/shared/catch.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `export interface RescueRecord { by: string; startedAt: string; heldMs: number; holdSince: string | null; lastBeat: string | null; releasedAt: string | null }` and `Game.rescue: RescueRecord | null` (the old `joiners` goes).
  - `Player.head_start_until?: string | null`.
- Produces (penjara.ts):
  - constants from Global Constraints (`RESCUE_HOLD_MS` becomes 20 000).
  - `export function legacyRescue(r: { by: string; startedAt: string } & Partial<RescueRecord>): RescueRecord` → old shape read as `heldMs 0, holdSince null, lastBeat null, releasedAt = startedAt`.
  - `export function rescueProgress(r: RescueRecord, now: number): { heldMs: number; holding: boolean; offSince: number | null }` — while holding, held time counts up to `min(now, lastBeat + RESCUE_BEAT_LAPSE_MS)`; past the lapse the thumb counts as lifted at `lastBeat` (held stops at `lastBeat`, `offSince = lastBeat`). Not holding: `offSince = releasedAt`.
  - `export type RescueVerdict = { kind: 'holding' | 'paused' | 'success' } | { kind: 'failed'; reason: 'left' | 'removed' } | { kind: 'reset' }`
  - `export function rescueVerdict(i: { rescue: RescueRecord; rescuer: Player | undefined; fixes: Position[]; jail: LatLng; now: number; pauses?; pausedAt? }): RescueVerdict` — rescuer missing → `failed/removed`; rescuer out (`isOut`) → `failed/removed`; any usable fix since `startedAt` outside 30 m + accuracy (pause fixes ignored, as today) → `failed/left`; held ≥ 20 s → `success`; `offSince` set and `now − offSince ≥ 5 s` → `reset`; holding → `holding`; else `paused`.
  - `export const keyTurn = (heldMs: number) => ({ notch, angle })` — port `turnFor` from the mockup (`notch` 0–4, `angle = notch·22.5 + strain ≤ 4`).
- Produces (catch.ts): `judgeCatch` refuses `{ ok: false, reason: 'head-start', leftMs }` when the runner's `head_start_until` is after `now`; checked right after `already-caught` / `already-out`.

- [ ] **Step 1: Write failing tests** (`penjara.test.ts`, replacing the 10 s rescue tests):
  - held 19 999 ms holding → `holding`; a beat at 20 000 held → `success`.
  - hold 7 s, release, 3 s later → `paused` with `heldMs 7000`; 5 s after release → `reset`.
  - holding with `lastBeat` 2.5 s ago → `rescueProgress` held stops at `lastBeat`, `offSince = lastBeat`; at `lastBeat + 5000` → `reset`. (Review Focus 1)
  - a fix 45 m out with accuracy 8 → `failed/left`; accuracy 25 → ignored; rescuer jailed → `failed/removed`.
  - `legacyRescue({ by, startedAt })` → `releasedAt === startedAt`, `heldMs 0`.
  - `keyTurn(0)` notch 0 angle 0; `keyTurn(5000)` notch 1 angle 22.5; `keyTurn(20000)` notch 4 angle 90.
  - `catch.test.ts`: runner with `head_start_until` 4 s ahead → `{ ok: false, reason: 'head-start', leftMs: 4000 }`; 1 ms past → catch ok.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run shared/penjara.test.ts shared/catch.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; `npm run typecheck` (fix compile errors from the shape change by narrowing, not by behaviour changes; Tasks 2–6 own the behaviour).
- [ ] **Step 5: Commit** — `feat: held-key rescue rules and the 10 s head start (pure)`

### Task 2: Storage (both stores, migration 0026)

**Files:**
- Create: `supabase/migrations/0026_hold_rescue.sql`
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts`

**Interfaces:**
- Consumes: `RescueRecord`, `legacyRescue`.
- Produces (Store interface + both stores):
  - `startRescue(gameId, by, atIso): Promise<boolean>` → writes the new shape: `{ by, startedAt: at, heldMs: 0, holdSince: null, lastBeat: null, releasedAt: at }`.
  - `patchRescue(gameId: string, startedAtIso: string, patch: Partial<Pick<RescueRecord, 'heldMs' | 'holdSince' | 'lastBeat' | 'releasedAt'>>): Promise<boolean>` → applies only while `rescue.startedAt` still equals `startedAtIso` (atomic in SQL); false otherwise.
  - `setHeadStart(playerIds: string[], untilIso: string): Promise<void>`.
  - `joinRescue` is removed.
  - Resume (the existing pause-resume path in both stores) shifts `rescue.holdSince`, `lastBeat`, `releasedAt` by the pause, like `startedAt` today, and shifts every player's `head_start_until` that is after the pause start. (Review Focus 2)
- Migration 0026 (house header style, "Safe to run again"): `alter table players add column if not exists head_start_until timestamptz;` · `create or replace function start_rescue(...)` writing the new JSON shape · `create or replace function patch_rescue(p_game uuid, p_started text, p_patch jsonb) returns boolean` (`update games set rescue = rescue || p_patch where id = p_game and rescue->>'startedAt' = p_started`, returns found) with the same revoke/grant as `end_rescue` · `resume_game` re-created from **0020** with the extra JSON shifts (`holdSince`, `lastBeat`, `releasedAt`, each only when not null) and the `head_start_until` shift.

- [ ] **Step 1: Write failing tests** (MemoryStore): `startRescue` writes `heldMs 0` and `releasedAt === startedAt`; `patchRescue` with the right `startedAt` applies, with a stale one returns false and changes nothing; `setHeadStart` sets both players; pause at T, resume at T+60 s → `holdSince`, `lastBeat`, `releasedAt` and a future `head_start_until` all move by 60 s, a past `head_start_until` doesn't.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both stores; add `head_start_until` to `PLAYER_COLUMNS`; write 0026.
- [ ] **Step 4: Run, expect PASS**; typecheck.
- [ ] **Step 5: Commit** — `feat: rescue hold state and head start in both stores (migration 0026)`

### Task 3: Server actions

**Files:**
- Modify: `app/api/_lib/actions.ts`, `app/shared/types.ts` (event data note)
- Test: `app/api/_lib/actions.test.ts` (rewrite the 10 s rescue describe blocks; keep their helpers)

**Interfaces:**
- Consumes: Task 1 rules, Task 2 store methods.
- Produces:
  - `jailbreak` (scan): first scan → `startRescue`, `{ ok: true, rescue: 'started' }`; rescuer re-scan → `{ ok: true, rescue: 'resumed' }`; anyone else → `{ ok: false, reason: 'rescue-taken', byName }`. Existing refusals unchanged.
  - New action `rescueHold { code, token, down: boolean }` → only the rescuer, not while paused (`{ ok: false, reason: 'paused' }`), `not-rescuer` otherwise. `down: true`: if not holding, `holdSince = lastBeat = now`, `releasedAt = null`; if already holding, `lastBeat = now`. `down: false`: `heldMs += lastHeldEnd − holdSince` (using `rescueProgress`), `holdSince = null`, `releasedAt = now`. Then `settleRescue`. Returns `{ ok: true, heldMs, holding }`.
  - `location`: when the sender is the rescuer and `body.holding === true` and the rescue is held, `patchRescue({ lastBeat: now })` before judging the fix.
  - `settleRescue` uses `rescueVerdict` (legacy records via `legacyRescue`): `success` → free as today **plus** `setHeadStart(freedIds, now + HEAD_START_MS)`; `failed` → `rescue-failed { reason }`; `reset` → `rescue-failed { reason: 'reset' }`; PKP / Penjara locked at the moment it would succeed → `rescue-failed { reason: 'locked' }`. Settling runs on every request as today.
  - Catching the rescuer (catch action) → `rescue-failed { reason: 'caught' }`.
  - Settle (`settle` action) and the reel's free slot also `setHeadStart` for whoever they free.
  - `judgeCatch`'s `head-start` refusal flows out of the catch action with `leftMs`; a Hang Hebat bounty claim and a Super Ring trigger are refused the same way (they start from the same catch).
- [ ] **Step 1: Write failing tests:**
  - scan → hold 20 s with beats every 1.5 s → everyone eligible freed, each with `head_start_until = freedAt + 10 s`; feed has `jailbreak`.
  - hold 7 s, release, wait 3 s, hold 13 s → freed; release and wait 5 s → `rescue-failed { reason: 'reset' }`, nobody freed.
  - holding, beats stop: 2 s later held stops; 5 s after the last beat → reset. (Review Focus 1)
  - pause during the window and during a hold; resume; outcomes as if no pause. (Review Focus 2)
  - rescuer released, then caught → `reason: 'caught'`, nobody freed. (Review Focus 3)
  - second runner scans → `rescue-taken` with the rescuer's name; rescuer re-scans → `resumed`.
  - a fix 45 m out during a release → `reason: 'left'`.
  - a Kejar scans a freed runner at +9.9 s → `head-start` with `leftMs ≈ 100`; at +10.1 s → caught; with a 60 s pause in between, still refused at +9.9 s game time. (Review Focus 4)
  - Settle and a reel free set the same head start. (Review Focus 5)
  - a legacy-shape rescue left by a running game resets 5 s after its `startedAt` unless held.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**, then the full suite.
- [ ] **Step 5: Commit** — `feat: hold the key to rescue: one rescuer, pause, 5 s reset, 10 s head start`

### Task 4: Views and the feed

**Files:**
- Modify: `app/shared/views.ts`
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Produces: `View.rescue: { by?: string; byName?: string; heldMs: number; holdSince: number | null; resetAt: number | null } | null` — `heldMs`/`holdSince` from `rescueProgress` at the view's `now` (frozen at `paused_at` while paused); `resetAt = offSince + RESCUE_RESET_MS` when not holding. Chasers get no `by`/`byName`. Legacy records read through `legacyRescue`.
  - `View.me.head_start_until` is the runner's own; a chaser's view never carries other players' head starts.
  - Feed lines for `rescue-failed` by reason: `caught` → "The rescue failed: {name} was caught.", `left` → "The rescue failed: {name} walked away.", `reset` → "The rescue reset.", `locked` → "The rescue failed: Penjara is locked.", `removed` → "The rescue failed." (Today's line stays for events without a reason.)
- [ ] **Step 1: Failing tests:** runner view while holding 7 s in → `heldMs ≈ 7000`, `holdSince` set, `resetAt null`; released → `resetAt = releasedAt + 5000`; chaser view has no `byName`; paused view freezes `heldMs`; each feed reason's line.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat: rescue progress and reasons in the views`

### Task 5: The lock doodle and the sounds (client building blocks)

**Files:**
- Create: `app/src/game/rescue/RescueLock.tsx`, `app/src/game/rescue/PenjaraGate.tsx`, `app/src/game/rescue/RescueLock.test.tsx`
- Modify: `app/src/game/sounds.ts`, `app/src/game/sounds.test.ts` (create if absent), `app/src/styles/tokens.css`

**Interfaces:**
- Consumes: `keyTurn` (Task 1).
- Produces:
  - `<RescueLock heldMs={number} mode={'idle' | 'holding' | 'paused' | 'open' | 'snapped'} size?={number} />` — port of the mockup's `FrontLock` with its Penjara backdrop, the four marks on the dashed arc, the burst on a new click, the growing shake (`--amp`, `--dx`, `--spd` from held/20 s), shackle pop on `open`, key snap on `snapped`. Reduced motion: no shake, no burst.
  - `<PenjaraGate state={'open' | 'locked' | 'closed'} size?={number} />` — port of the mockup's `Gate` for the freed screen (doors swing, sparkles) and the locked chain (Task 7).
  - `sounds.ts`: `playKeyClick(notch: 1 | 2 | 3)`, `playKeyUnlock()`, `playKeyLetGo()`, `playRescueReset()` — port of the mockup's `sfx.ts`, each a no-op when `isMuted()`, each buzzing via `navigator.vibrate?.` (28 ms per click; `[40, 50, 120]` on unlock).
- [ ] **Step 1: Failing tests:** `RescueLock` at `heldMs 10000` shows 2 filled marks; `open` has class `open`; `holding` sets `--amp` larger at 18 s than at 2 s; muted → `playKeyClick` creates no oscillator (mock `AudioContext`) and doesn't vibrate; unmuted → vibrates 28.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat: the Penjara lock doodle and key sounds`

### Task 6: The rescue screens

**Files:**
- Create: `app/src/game/rescue/RescueHold.tsx` (rescuer), `app/src/game/rescue/RescueWatch.tsx` (jailed), `app/src/game/rescue/RescueEnd.tsx` (freed / failed / reset), `app/src/game/rescue/useRescueSounds.ts`, tests beside them
- Modify: `app/src/screens/RunnerChase.tsx` (replace `HoldRing` and the joiner logic; the rescue screen covers the chase while it's this runner's rescue), `app/src/screens/Jail.tsx` (replace `RescueBanner` with `RescueWatch`), `app/src/game/RescueBanner.tsx` (delete if unused), `app/src/screens/ChaserChase.tsx` (`catchMessage` for `head-start`), `app/src/game/useGameState.ts` or the rescue ping hook (send `holding: true` with each rescue fix while the thumb is down)

**Interfaces:**
- Consumes: `View.rescue` (Task 4), `rescueHold` / `jailbreak` (Task 3), `RescueLock`, `PenjaraGate`, sounds (Task 5).
- Produces:
  - `RescueHold`: lock + seconds left (`20 − held`, ticking from `holdSince` between polls) + the line + a big `HOLD` button (`pointerdown` → `rescueHold { down: true }`, `pointerup`/`pointercancel`/`blur`/`visibilitychange:hidden` → `{ down: false }`; Space/Enter too). Paused copy and dim count while `resetAt` is set.
  - `RescueWatch`: same lock, `{Name} is breaking you out` / `{Name} let go`, no button, no sounds.
  - `RescueEnd`: freed (gate opens, `LEPAS!`, head-start line for rescuer vs freed runner), failed (snapped key, reason line), reset (`Rescue reset.`). Shown once per rescue outcome from the feed/events the view already carries.
  - `useRescueSounds(heldMs, mode)`: a click as each notch 1–3 is reached, unlock on success, let-go and reset sounds; rescuer's phone only.
  - Runner scan copy: `rescue-taken` → `{Name} is already breaking them out.`; `resumed` → back on the rescue screen.
  - Chaser: `head-start` → `Just freed: {ceil(leftMs/1000)} s head start.`
- [ ] **Step 1: Failing tests:** RunnerChase with `view.rescue.by === me` shows `HOLD`; pointerdown calls `rescueHold` with `down: true`, pointerup with `down: false`; `visibilitychange` to hidden sends `down: false`; with `resetAt` set shows `Resets in 3. Hold again to keep it.`; Jail screen shows `Hafiz is breaking you out` and no button; a `rescue-taken` scan shows `Hafiz is already breaking them out.`; ChaserChase `head-start` with `leftMs 5200` shows `Just freed: 6 s head start.`
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS**, full suite, typecheck, lint.
- [ ] **Step 5: Commit** — `feat: the rescue screens: hold the key, watch it turn, LEPAS!`

### Task 7 (polish): Penjara locked as the chained gate

**Files:** Modify `app/src/screens/Jail.tsx` (the `penjara-lock` pill), its test.

**Produces:** while Penjara is locked after Mak Kau Hijau, the jailed screen shows `<PenjaraGate state="locked" />` with the green `m:ss` countdown and the existing line, in place of the pill. Rules unchanged.

- [ ] **Step 1: Failing test:** locked view renders the gate (an `svg.gate.locked`) and the countdown text. **Step 2: FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat: Penjara locked shows the chained gate`

---

## Release notes for the organiser

- Run `supabase/migrations/0026_hold_rescue.sql` before deploying Task 2's code.
