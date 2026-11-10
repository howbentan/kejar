# Fair Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Core fair to playtest: no auto-jail for alerts that came too late, no catches from photos of tags, quiet alerts, a marshal Undo kejar with a 60 s final whistle, a Durian that can't be camped, fresh check-in spots, moving a player to a new phone, and a 30-day personal-data wipe.

**Architecture:**
- **Server:** everything is enforced on the server in the existing single `api/game.ts` → `app/api/_lib/actions.ts` action layer.
- **Rules as pure functions:** the pure rules live in `app/shared` (`checkins.ts`, `catch.ts`, `results.ts`, `alerts.ts`, `clock.ts`).
- **New state:** one migration, `supabase/migrations/0016_fair_play.sql`, adds what the rules need:
  - `pings.alert_sent_at`;
  - `games.final_whistle_at` and `games.wiped_at`;
  - a `phone_moves` table;
  - SQL functions for the atomic steps and the wipe.
- **Durian locks:** derived from existing `shielded` events, so they need no new storage.

**Tech Stack:** TypeScript, React, Vitest/jsdom, Supabase/Postgres (plpgsql), Vercel.

**Spec:** `docs/superpowers/specs/2026-11-11-kejar-gameplay-audit-fixes-design.md`, Plan 1 (§1.1–§1.10). The audit it answers is `2026-11-10-kejar-gameplay-audit.md` (owner's copy, outside the repo).

## Global Constraints

- **Copy:** English with a light Malaysian twist, and no em-dashes in any player- or organiser-facing string.
- **Architecture:**
  - The server is the authority.
  - Free tiers only; keep the single `api/game.ts` function.
  - Both `MemoryStore` (`app/api/_lib/store.ts`) and `SupabaseStore` (`app/api/_lib/supabaseStore.ts`) implement every new `GameStore` method.
- **Migration `0016_fair_play.sql`:** idempotent (`if not exists`, `create or replace`) and wrapped in `begin; … commit;`. New functions are revoked from `public, anon, authenticated` and granted to `service_role`. Each task appends its own section; the owner runs the file before merge.
- **Secrecy:** nothing new names Dato Seri or Bomoh. Marshal and organiser screens may name players; the players' feed uses only the copy below.
- **Exact values:**
  - `LATE_PING_MIN_WARNING_MS = 25_000`
  - `PLAUSIBLE_BASE_M = 50`
  - `RUNNER_SPEED_MPS = 6`
  - `PLAUSIBLE_MAX_AGE_MS = 10 * 60_000`
  - `BORDERLINE_RATIO = 0.8`
  - `DURIAN_HEAD_START_MS = 15_000`
  - `FINAL_WHISTLE_MS = 60_000`
  - `CHECKIN_RESEND_MAX_AGE_MS = 20_000`
  - `PHONE_MOVE_TTL_MS = 30 * 60_000`
  - `WIPE_AFTER_MS = 30 * 24 * 60 * 60_000`
- **Exact copy:**
  - Implausible catch: `Can't confirm that one. Get closer and try again.`
  - Stung chaser, at the block: `Durian! You can't catch {name} again this game. Hand the tag back.`
  - Stung chaser, any later scan of that runner: `Durian! You can't catch {name} again this game.`
  - Another chaser inside the 15 s: `Durian! {name} gets a 15 s head start.`
  - Final whistle (feed, everyone): `Last Dikejar caught! Final whistle in 60 s.`
  - Undo (feed, everyone): `A marshal undid a kejar. {runner} is back in.`
  - The marshal action label is `Undo kejar`, and the New phone button is `New phone`.
- **Never use `sed -i`:** it flips CRLF line endings. Check `git diff --stat` before every commit.

## Review Focus

1. **Two phones poll at the same moment the alert is due.**
   - Expected: one push and one `alert_sent_at`.
   - Pinned in Task 1 with a double-claim test.
2. **The chase's time runs out during the 60 s final whistle.**
   - Expected: no results screen before the whistle. If the kejar is undone in that minute, the game then ends as a Dikejar win.
   - Pinned in Task 5 with phase and finish tests.
3. **The stung chaser scans the Durian runner again after an unrelated `Undo kejar` or a `New phone`.**
   - Expected: still locked.
   - Pinned in Task 4, because the lock is derived from events keyed by player id.
4. **Catch events from games played before this change** (with only `flagged` or `oldRunnerFix`).
   - Expected: the marshal alerts list still renders them.
   - Pinned in Task 3.
5. **A New phone link opened twice, or the old phone still polling.**
   - Expected: the second redeem gets 410, and the old token gets the normal "not in this game" error.
   - Pinned in Task 7.

---

### Task 1: Late pings don't count toward auto-jail (§1.1 late-ping rule, §1.9 L2)

**Files:**
- Create: `supabase/migrations/0016_fair_play.sql`.
  - Section 1 adds `alter table pings add column if not exists alert_sent_at timestamptz`.
  - Section 2 re-creates `resume_game` from `0005_safety.sql:34-59` so it shifts `alert_at` only where `alerted = false`, and `reveal_at` only where `revealed = false`.
- Modify:
  - `app/shared/types.ts`: add `Ping.alert_sent_at: string | null`.
  - `app/api/_lib/store.ts` and `app/api/_lib/supabaseStore.ts`: `claimPing(gameId, seq, 'alerted')` also writes `alert_sent_at = store now` in the same update. `'revealed'` is unchanged.
  - `app/shared/checkins.ts`: add the fair-warning rule.
  - `app/api/_lib/actions.ts` `advance` (around lines 500-555): auto-jail is judged on fairly warned pings only.
  - `app/shared/clock.ts`: only if L2 needs it, so that stored and computed alert times agree for pings that already alerted.
- Test: `app/shared/checkins.test.ts`, `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`.

**Interfaces:**
- Produces:
  - `export const LATE_PING_MIN_WARNING_MS = 25_000` in `checkins.ts`.
  - `export function fairlyWarned(alertSentAt: number | null, revealAt: number, mode: CheckinMode): boolean` returns true in `'schedule'` mode (the runner's warning is the schedule itself, not a push). Otherwise it returns `alertSentAt !== null && revealAt - alertSentAt >= LATE_PING_MIN_WARNING_MS`.
- Behaviour in `advance`:
  - A scheduled reveal whose ping isn't fairly warned does no auto-jail judging at all.
  - A fairly warned reveal judges each runner on the last two fairly warned scheduled pings at or before it (skipped pings are left out of the list, neither a miss nor a reset).
  - The `checkins` list in the `auto-jailed` event only includes fairly warned pings.
  - The stale-alert skip at line ~505 stays. A claimed alert that sends no push still records `alert_sent_at`, but a late one fails `fairlyWarned` anyway.
  - **Player screens:** wherever a player's or marshal's screen shows a past check-in as missed (the `'missed'` state around `views.ts:478`, and the jailed runner's crossed-out check-ins), a ping that wasn't fairly warned is never shown as missed.

- [ ] **Step 1: Write the failing tests**
  - `checkins.test.ts` `fairlyWarned`:
    - `(revealAt - 25_000, revealAt, 'push')` gives true;
    - `(revealAt - 24_999, …)` gives false;
    - `(null, …, 'push')` gives false;
    - `(null, …, 'schedule')` gives true.
  - `store.test.ts`: the first `claimPing(g, 3, 'alerted')` returns true and the row's `alert_sent_at` equals the store clock. A second call returns false and leaves `alert_sent_at` unchanged (Review Focus 1).
  - `actions.test.ts`, using the existing auto-jail helpers (5 min pings, 45 s alerts):
    - **(a)** a runner misses two pings whose alerts were polled on time, and is auto-jailed as today;
    - **(b)** a runner misses ping 3 (on time), ping 4's alert is first polled 21 s before its reveal (24 s warning, skipped), and they miss ping 5 (on time). They are auto-jailed at ping 5, because the skipped ping is ignored;
    - **(c)** no phone polls between ping 4's alert and its reveal. Ping 4 is skipped the same way, and nobody is auto-jailed at ping 4's reveal;
    - **(d)** in `checkinMode: 'schedule'` with no pushes, (a) still auto-jails;
    - **(e)** the `auto-jailed` event's `checkins` never lists a skipped ping.
  - `views.test.ts`: a runner who didn't check in during a skipped ping doesn't see that ping as `missed`.
  - `actions.test.ts` (L2): pause the game after ping 2's alert has gone out, then resume. Ping 2's stored `alert_at` is unchanged. Use MemoryStore's resume, and match the SQL change in its own test if MemoryStore mirrors `resume_game`.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd app && npx vitest run shared/checkins.test.ts api/_lib/store.test.ts api/_lib/actions.test.ts -t "fairly|late ping|alert_sent_at|resume"`. Expected: FAIL.
- [ ] **Step 3: Implement.** The migration sections, the type, both stores' `claimPing`, `fairlyWarned`, and the `advance` change.
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and `npm run typecheck`. Expected: PASS, with no existing auto-jail test edited except where a fixture must now record `alert_sent_at`.
- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0016_fair_play.sql app/shared app/api/_lib
git commit -m "feat: a ping only counts toward auto-jail if its alert gave 25 s of warning"
```

---

### Task 2: Keep chaser and marshal screens awake (§1.1 Wake Lock)

**Files:**
- Create: `app/src/game/useWakeLock.ts`.
- Modify: `app/src/screens/ChaserChase.tsx`, `app/src/screens/MarshalLive.tsx` (the organiser's live view renders it through `GameScreen.tsx`; confirm that, and add the hook wherever the organiser watches a live game if it's elsewhere).
- Test: `app/src/game/useWakeLock.test.ts`, plus one line each in `ChaserChase.test.tsx` and `MarshalLive.test.tsx`.

**Interfaces:**
- Produces: `export function useWakeLock(active: boolean): void`.
  - While `active` is true and the page is visible, it holds `navigator.wakeLock.request('screen')`.
  - It re-requests on `visibilitychange` back to visible.
  - It releases when `active` turns false or on unmount.
  - Where `navigator.wakeLock` is missing, or `request` rejects, it does nothing and never throws.
- Active means phase `hiding` or `chasing`. Runners never call it.

- [ ] **Step 1: Write the failing tests.** Mock `navigator.wakeLock.request` and check that it:
  - requests once when active;
  - releases on inactive;
  - re-requests after `visibilitychange` back to visible;
  - throws nothing when `wakeLock` is undefined, or when the request rejects;
  - is requested by ChaserChase in the chase;
  - is never requested by RunnerChase.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd app && npx vitest run src/game/useWakeLock.test.ts src/screens/ChaserChase.test.tsx src/screens/MarshalLive.test.tsx`.
- [ ] **Step 3: Implement the hook and call it from both screens.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite.
- [ ] **Step 5: Commit.**

```bash
git add app/src/game/useWakeLock.ts app/src/game/useWakeLock.test.ts app/src/screens
git commit -m "feat: chaser and marshal screens stay awake during the game"
```

---

### Task 3: Plausible catches and quieter alerts (§1.2, §1.3)

**Files:**
- Modify:
  - `app/shared/catch.ts`: `judgeCatch` gets the plausibility check and a new `flagged` meaning.
  - `app/api/_lib/actions.ts`, `catchAction` (around lines 940-1000): drop `oldRunnerFix`. The marshal alert and the `Kena tangkap!` push now follow `verdict.flagged`.
  - `app/shared/alerts.ts:110-116`: the alert text for new events.
  - `app/src/screens/ChaserChase.tsx`: refusal copy for `'implausible'`.
- Test: `app/shared/catch.test.ts`, `app/api/_lib/actions.test.ts`, `app/shared/alerts.test.ts`, `app/src/screens/ChaserChase.test.tsx`.

**Interfaces:**
- Produces, in `catch.ts`:
  - The constants `PLAUSIBLE_BASE_M`, `RUNNER_SPEED_MPS` and `PLAUSIBLE_MAX_AGE_MS`, with values from Global Constraints.
  - `export function plausibleLimitM(chaserPos: Position, runnerPos: Position, now: number): number`. It returns `PLAUSIBLE_BASE_M + slack(chaserPos) + slack(runnerPos) + RUNNER_SPEED_MPS * min(age(runnerPos), PLAUSIBLE_MAX_AGE_MS) / 1000`, where `slack` is the existing capped accuracy.
  - The `CatchJudgement` failure reasons gain `'implausible'`.
- `judgeCatch` order, after the existing chaser-location check:
  1. **No runner position at all:** `{ ok: true, flagged: false }`. This replaces today's "flagged" for a missing fix; the spec's "catch counts".
  2. **The existing rule:** a runner fix up to `RUNNER_TRUSTED_MS` old that is too far gives `'too-far'`. It is unchanged.
  3. **Beyond the limit:** `d > plausibleLimitM(...)` gives `{ ok: false, reason: 'implausible' }`. The `STALE_MS` early accept goes away, because the age cap now covers old fixes.
  4. **Borderline:** `flagged` is `d > BORDERLINE_RATIO * plausibleLimitM(...)`.
- `caught` event data: `{ flagged, who, chaser }` (no more `oldRunnerFix`).
- The alert for a new flagged event: `Check catch: {who} by {chaser} (far from their last spot)`.
- Old events that carry `oldRunnerFix` keep their current text, and events with only `flagged` keep `(position unknown)` (Review Focus 4).
- Chaser copy: `implausible` maps to `Can't confirm that one. Get closer and try again.`

- [ ] **Step 1: Write the failing tests.**
  - `catch.test.ts`:
    - with a 10 s-old runner fix and zero accuracy, a chaser 49 m away is accepted with `flagged: false`;
    - a runner fix 120 s old gives a limit of `50 + 720 = 770` m: 600 m is accepted with `flagged: false`, 700 m is accepted with `flagged: true` (over 616), and 800 m gives `'implausible'`;
    - a runner fix 20 min old uses the 10 min cap, so the limit is 3,650 m: 3,000 m is accepted and 4,000 m gives `'implausible'`;
    - no runner fix is accepted with `flagged: false`;
    - the `'too-far'` case for a 10 s-old fix at 80 m is unchanged.
  - `actions.test.ts`:
    - an ordinary catch (runner fix 3 min old, chaser 100 m away) records no marshal alert and sends no `Kena tangkap!` push;
    - a borderline catch does both;
    - an implausible catch records no `caught` event, and the runner stays free.
  - `alerts.test.ts`: a new flagged event uses the new text; old `oldRunnerFix` and `flagged`-only events keep their texts.
  - `ChaserChase.test.tsx`: `catchMessage(qr, { ok: false, reason: 'implausible' })` gives the exact copy.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.**

```bash
git add app/shared app/api/_lib app/src/screens
git commit -m "feat: catches far from the runner's last spot are refused, and only borderline ones alert"
```

---

### Task 4: Durian can't be camped (§1.5)

**Files:**
- Modify:
  - `app/shared/catch.ts`: the `judgeCatch` input and reasons.
  - `app/api/_lib/actions.ts` `catchAction`: pass the shield history, and return the runner's name on the Durian refusals.
  - `app/src/screens/ChaserChase.tsx`: copy.
- Test: `app/shared/catch.test.ts`, `app/api/_lib/actions.test.ts`, `app/src/screens/ChaserChase.test.tsx`.

**Interfaces:**
- Consumes: Task 3's `judgeCatch`.
- Produces:
  - `export const DURIAN_HEAD_START_MS = 15_000` in `catch.ts`.
  - The `judgeCatch` input gains `shieldings: { chaserId: string; runnerId: string; at: number }[]`, built by `catchAction` from `shielded` events (`actor_id`, `target_id`, `at`).
  - New failure reasons `'durian-locked'` and `'durian-head-start'`.
- Checks, run right after the runner is identified and before any location checks:
  1. any shielding with this chaser and this runner gives `'durian-locked'`;
  2. any shielding on this runner within `DURIAN_HEAD_START_MS` before `now` gives `'durian-head-start'`.
- Refusals record nothing and spend nothing.
- `catchAction` returns `{ ok: false, reason, name }` for these two reasons, and the existing `'shielded'` result also carries `name`.
- Chaser copy, from Global Constraints:
  - `shielded` gives `Durian! You can't catch {name} again this game. Hand the tag back.`
  - `durian-locked` gives `Durian! You can't catch {name} again this game.`
  - `durian-head-start` gives `Durian! {name} gets a 15 s head start.`

- [ ] **Step 1: Write the failing tests.**
  - `catch.test.ts`:
    - the stung chaser gets `'durian-locked'` at +1 s and at +30 min;
    - another chaser gets `'durian-head-start'` at +14 s and is accepted at +16 s;
    - an unrelated runner is unaffected.
  - `actions.test.ts`:
    - a Durian blocks chaser A, and A's rescan 20 min later is refused with `name`;
    - chaser B catches at +16 s;
    - after B's catch is undone (Task 5 lands later, so instead simulate it by setting the runner free in the store), A is still refused (Review Focus 3).
  - `ChaserChase.test.tsx`: each of the three exact lines.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite.
- [ ] **Step 5: Commit.**

```bash
git add app/shared app/api/_lib app/src/screens
git commit -m "feat: Durian locks the stung chaser off that runner for the game and gives a 15 s head start"
```

---

### Task 5: Undo kejar and the 60 s final whistle (§1.4)

**Files:**
- Modify:
  - `supabase/migrations/0016_fair_play.sql`, section 3:
    - `alter table games add column if not exists final_whistle_at timestamptz`;
    - `release_caught(p_player uuid, p_by uuid, p_at timestamptz) returns boolean`, which frees only if `jailed and caught_by = p_by`, setting `jailed=false, caught_by=null, caught_at=null, freed_at=p_at` and leaving `freed_once` untouched;
    - `claim_final_whistle(p_game uuid, p_at timestamptz) returns boolean`, which sets the column only if it is null and not ended.
  - `app/shared/types.ts`:
    - `Game.final_whistle_at: string | null`;
    - the new `EventType`s `'kejar-undone'` and `'final-whistle'`.
  - `app/api/_lib/store.ts` and `supabaseStore.ts`: the new methods below, with `final_whistle_at` in the game select (`GAME_COLUMNS`).
  - `app/shared/clock.ts` `phaseAt`.
  - `app/shared/results.ts`: undone catches don't count.
  - `app/api/_lib/actions.ts`:
    - the `undoKejar` action, registered beside `undoAutoJail`;
    - an `allOutCheck` helper that replaces every immediate "everyone is out, so finish" call (there are 6 `finish(ctx…)` call sites today; the time-up `work.end` finish also waits for a pending whistle).
  - `app/shared/views.ts`: the feed lines for the two new events.
  - `app/src/screens/MarshalLive.tsx`: an `Undo kejar` button on a caught runner's row and on that catch's flagged-catch alert.
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/shared/clock.test.ts`, `app/shared/results.test.ts`, `app/shared/views.test.ts`, `app/src/screens/MarshalLive.test.tsx`.

**Interfaces:**
- Produces:
  - `export const FINAL_WHISTLE_MS = 60_000` in `clock.ts`.
  - The store methods:
    - `releaseCaught(id: string, by: string, atIso: string): Promise<boolean>`;
    - `claimFinalWhistle(gameId: string, atIso: string): Promise<boolean>`;
    - `clearFinalWhistle(gameId: string): Promise<void>`.
  - The `undoKejar` action, with body `{ code, eventId, marshalToken? | organiserToken? }` (auth through `requireMarshal`, like `undoAutoJail`). It returns `{ ok: true }` or `{ ok: false, reason: 'not-undoable' }`.
- Behaviour:
  - **What can be undone:** only the target runner's latest `caught` event, only while that runner is still jailed by that chaser (`caught_by === event.actor_id`, and no release since the event), and only while the phase is `chasing`.
  - **On success it writes:**
    - a `kejar-undone` event `{ eventId, who }`;
    - a `handled` event for the alert, as `undoAutoJail` does;
    - a `safety_records` row `type: 'kejar-undone'` with `{ game_code, by, target_name }`;
    - a cleared final whistle.
  - **`computeResults`** ignores `caught` events with a matching `kejar-undone`.
  - **`allOutCheck(ctx, game)`:** when runners exist and all are out, it calls `claimFinalWhistle(now)`. The first caller adds a `final-whistle` event.
  - **In `advance`:**
    - finish once `now >= final_whistle_at + FINAL_WHISTLE_MS` and everyone is still out;
    - clear the whistle if someone is free again;
    - while a whistle is pending, `work.end` does not finish.
  - **`phaseAt`:** while `final_whistle_at` is set and `ended_at` is null, the phase is never `'ended'`. It stays `'chasing'`, with `endsAt = final_whistle_at + FINAL_WHISTLE_MS` once the clock time has passed.
  - **The winner after an undo** comes from `computeResults` as usual. If the clock time passed during the hold, someone is free, so it's Dikejar.
- Feed:
  - `final-whistle` gives `Last Dikejar caught! Final whistle in 60 s.`
  - `kejar-undone` gives `A marshal undid a kejar. {runner} is back in.` (runner name only, never the tag number).

- [ ] **Step 1: Write the failing tests.**
  - `store.test.ts`:
    - `releaseCaught` frees only for the matching `by`, never touches `freed_once`, and only the first of two calls returns true;
    - `claimFinalWhistle` returns true only the first time.
  - `actions.test.ts`:
    - **(a)** an undo frees the runner, they can be caught again, and their escape is still unused;
    - **(b)** after undoing a catch that is no longer the latest, the result is `not-undoable`;
    - **(c)** catching the last free runner posts `final-whistle`, the game isn't ended at +59 s, and it is ended as a Kejar win at +61 s;
    - **(d)** undoing during the hold means the game never ends at +61 s, and play continues;
    - **(e)** the clock time runs out at +20 s into the hold, and the undo comes at +40 s. The game ends as a Dikejar win once polled, and the view never shows `ended` before the undo (Review Focus 2);
    - **(f)** the last free runner auto-jailed also gets the hold, and `undoAutoJail` during it continues the game;
    - **(g)** a runner calling `undoKejar` gets 403;
    - **(h)** a `safety_records` row is written.
  - `results.test.ts`: an undone catch is not counted in awards.
  - `clock.test.ts`: `phaseAt` with a pending whistle past the clock time gives `'chasing'`.
  - `views.test.ts`: the two exact feed lines.
  - `MarshalLive.test.tsx`: a caught runner's row shows `Undo kejar`, and tapping it calls `undoKejar` with the catch's `eventId`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0016_fair_play.sql app/shared app/api/_lib app/src/screens
git commit -m "feat: Undo kejar for marshals, and a 60 s final whistle before the last catch ends the game"
```

---

### Task 6: Fresh check-in spots (§1.6)

**Files:**
- Modify: `app/src/game/useGameState.ts` (the re-send block at about lines 42-50).
- Test: `app/src/game/useGameState.test.ts` (create it if missing; follow the existing hook-test style in `src/game`).

**Interfaces:**
- Produces: `export const CHECKIN_RESEND_MAX_AGE_MS = 20_000` in `useGameState.ts`.
- When a check-in window is open and the window hasn't been sent for yet:
  - if `lastFix.current.timestamp` is within `CHECKIN_RESEND_MAX_AGE_MS` of `Date.now()`, re-send it as today;
  - otherwise call `navigator.geolocation.getCurrentPosition(cb, () => {}, { maximumAge: 0, enableHighAccuracy: true, timeout: 15_000 })` and send that fix when it arrives.
- `sentForAlert` is set only once a location is actually sent.

- [ ] **Step 1: Write the failing tests.** With mocked `geolocation` and `call`:
  - a 5 s-old last fix is re-sent;
  - a 3 min-old last fix is not re-sent, `getCurrentPosition` is called, and the fresh fix is sent;
  - a `getCurrentPosition` error sends nothing and doesn't throw.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite.
- [ ] **Step 5: Commit.**

```bash
git add app/src/game/useGameState.ts app/src/game/useGameState.test.ts
git commit -m "fix: a check-in only re-sends a location under 20 s old, otherwise it asks for a fresh one"
```

---

### Task 7: New phone (§1.7)

**Files:**
- Modify:
  - `supabase/migrations/0016_fair_play.sql`, section 4:
    - a `phone_moves` table (`id uuid pk default gen_random_uuid()`, `game_id uuid references games on delete cascade`, `player_id uuid references players on delete cascade`, `token_hash text unique not null`, `created_at`, `expires_at`, `redeemed_at`) with RLS enabled;
    - `redeem_phone_move(p_token_hash text, p_now timestamptz, p_game uuid, p_new_token_hash text)`, which atomically marks the move redeemed, sets that player's `token_hash = p_new_token_hash` and `push = null`, and returns the player id or a reason.
  - `app/shared/invites.ts`: `PHONE_MOVE_TTL_MS`.
  - `app/api/_lib/store.ts` and `supabaseStore.ts`: the new methods below.
  - `app/api/_lib/actions.ts`: the actions `createPhoneMove` and `redeemPhoneMove`.
  - `app/src/routes.ts`: `/p/<code>/<token>` gives `{ route: 'phone-move', code, token }`.
  - `app/src/App.tsx`: the route case.
  - Create `app/src/screens/PhoneMove.tsx`.
  - `app/src/screens/MarshalLive.tsx`: a `New phone` button on runner and chaser rows.
  - `app/src/game/session.ts`: save the new session for that game, using the same key the join flow uses.
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/src/routes.test.ts`, `app/src/screens/PhoneMove.test.tsx`, `app/src/screens/MarshalLive.test.tsx`.

**Interfaces:**
- Produces:
  - The store methods:
    - `createPhoneMove(row: { game_id; player_id; token_hash; created_at; expires_at; redeemed_at: null }): Promise<void>`;
    - `redeemPhoneMove(tokenHash: string, nowMs: number, gameId: string, newTokenHash: string): Promise<{ ok: true; playerId: string } | { ok: false; reason: 'invalid' | 'redeemed' | 'expired' }>`.
  - The actions:
    - `createPhoneMove({ code, playerId, marshalToken? | organiserToken? })` returns `{ inviteToken }`. It works in any phase except `ended`, only for runner and chaser rows that aren't removed, and writes a `safety_records` row `type: 'phone-move'`.
    - `redeemPhoneMove({ code, inviteToken })` returns `{ token, playerId }`. Its errors match `redeemMarshalInvite`'s messages and statuses (404, 410 used, 410 expired).
- UI flow:
  1. Tapping `New phone` creates the link, and the row then shows `Send link` plus the copy `Link ready. Send it to {name}'s new phone.`
  2. `Send link` shares `{origin}/p/{code}/{token}` inside that tap, the same way crew invites share. A share that needs a fresh tap must never come after an `await`.
  3. `PhoneMove.tsx` redeems, saves the session and sends the player to `/g/{code}`. On failure it shows the server's message.

- [ ] **Step 1: Write the failing tests.**
  - `actions.test.ts`:
    - a marshal creates a move for a jailed runner mid-chase;
    - redeeming returns a new token that loads that same player (same id, hand, `freed_once`);
    - the old token is refused with the normal error;
    - a second redeem gives 410, and after `PHONE_MOVE_TTL_MS` it gives 410 expired (Review Focus 5);
    - a runner calling `createPhoneMove` gets 403;
    - a move for a marshal's row is refused;
    - `push` is cleared;
    - a `safety_records` row is written.
  - `store.test.ts`: two concurrent redeems give only one ok.
  - `routes.test.ts`: `/p/abc234/XyZ-9_tok` gives `{ route: 'phone-move', code: 'ABC234', token: 'XyZ-9_tok' }`.
  - `PhoneMove.test.tsx`: success saves the session and navigates; a 410 shows the message.
  - `MarshalLive.test.tsx`: `New phone`, then `Send link` calls `navigator.share` synchronously inside the click with the `/p/` URL.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0016_fair_play.sql app/shared app/api/_lib app/src
git commit -m "feat: marshals and the organiser can move a player to a new phone"
```

---

### Task 8: Wipe personal data 30 days after a game (§1.8)

**Files:**
- Modify:
  - `supabase/migrations/0016_fair_play.sql`, section 5:
    - `alter table games add column if not exists wiped_at timestamptz`;
    - `wipe_game(p_game uuid) returns boolean`, which:
      - deletes the game's `locations`, `safety_records`, `phone_moves` and `marshal_invites`;
      - sets every player's `name` to a role placeholder numbered by join order (`Dikejar N`, `Kejar N`, `Marshal N`), `push = null`, and `token_hash` to a fresh random value;
      - removes the name and free-text keys from every event's `data`;
      - sets `wiped_at = now()`;
      - is a no-op returning false if already wiped.
  - `app/shared/types.ts`: `Game.wiped_at: string | null`.
  - `app/api/_lib/store.ts` and `supabaseStore.ts`: `wipeGame(id: string): Promise<boolean>` and `gamesToWipe(endedBeforeIso: string, limit: number): Promise<string[]>`.
  - `app/api/_lib/actions.ts`: a best-effort `wipeExpired(ctx)` (limit 3, errors swallowed) called at the end of `create` and `listArenas`. Export `WIPE_AFTER_MS`.
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`.

**Interfaces:**
- **Which event keys to strip:** before writing the SQL, grep every `addEvent(` in `actions.ts` and list each `data` key that can hold a player's name or free text (at least `who`, `chaser`, `name`, `by`, `target_name`, `text`). Put that list in one constant used by both MemoryStore's `wipeGame` and the SQL. A test enforces it.
- Results keep rendering, because winner, awards and counts come from ids, and names resolve to the placeholders.

- [ ] **Step 1: Write the failing tests.**
  - `store.test.ts`: in a MemoryStore game played to the end with catches, an SOS with text, a report and a Luar Garisan warning, after `wipeGame`:
    - `JSON.stringify` of every row tied to that game (players, events, locations, safety records, powerups, pings, game) contains none of the original player names or the SOS text;
    - players are named `Dikejar 1…`;
    - `wipeGame` again returns false.
  - `actions.test.ts`:
    - a game ended 31 days ago is wiped by the next `create`, and a game ended 29 days ago isn't;
    - a game never ended isn't wiped;
    - `computeResults` on a wiped game still returns the same winner and award counts;
    - a store whose `wipeGame` throws doesn't break `create`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0016_fair_play.sql app/shared app/api/_lib
git commit -m "feat: a game's personal data is wiped 30 days after it ends"
```

---

### Task 9: Remove-player guard, rules doc and HANDOFF (§1.9 L1, §1.10, rules doc changes)

**Files:**
- Modify:
  - `app/api/_lib/actions.ts` `removePlayer`: the all-out check goes through Task 5's `allOutCheck`. That brings it the `runners.length > 0` guard and the final whistle, so remove the inline check.
  - `docs/superpowers/specs/2026-10-30-kejar-rules.md`:
    - Durian rows: replace "no head start" with the §1.5 effect;
    - the auto-jail rule gains the 25 s late-ping line;
    - catches gain the plausibility limit, `Undo kejar` and the final whistle.
  - `docs/HANDOFF.md`, a Fair play entry with:
    - a bold **Before merging: run `supabase/migrations/0016_fair_play.sql` in Supabase first.** line, with why (the game select now reads `final_whistle_at` and `wiped_at`);
    - each rule above in one line;
    - the owner's to-do list: Vercel Hobby's non-commercial terms before paid events, park permits and briefing for public alarm, Overpass downtime, and the free-tier load of ~30 phones polling every 3 s.
- Test: `app/api/_lib/actions.test.ts`.

- [ ] **Step 1: Write the failing test.** Removing the last runner from a game with no runners left doesn't end it as a Kejar win. Removing the last free runner while others are jailed starts the final whistle rather than ending at once.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement, and update both docs.** No em-dashes in quoted copy.
- [ ] **Step 4: Run the full suite, typecheck and build.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add app/api/_lib docs/superpowers/specs/2026-10-30-kejar-rules.md docs/HANDOFF.md
git commit -m "fix: removing a player uses the final-whistle check; rules doc and HANDOFF for fair play"
```
