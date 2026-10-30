# Plan A: on-time check-ins, auto-jail, marshal undo, and Penjara — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A check-in only counts if sent in the 45 s before a scheduled ping. Two missed check-ins in a row send a runner to Penjara automatically, and a marshal can undo that for a phone fault. Players see "Penjara" instead of "jail".

**Architecture:**
- The check-in rules are pure functions in a new `app/shared/checkins.ts`, used by the server's reveal step (`advance` in `app/api/_lib/actions.ts`), by the views (the chasers' "missed" dots and the runner's countdown) and by the results.
- An auto-jail is a new event type, `auto-jailed`, written by a new atomic store method. A new `undoAutoJail` action reverses one.
- The last release time is a new `players.freed_at` column, so a freed runner's miss count starts fresh.

**Tech Stack:** Vite 8, React 19 and TypeScript; Vitest and Testing Library; one Vercel function (`app/api/game.ts`); a Supabase Postgres store behind the `GameStore` interface (`MemoryStore` in tests).

**Spec:**
- `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md` §4 and §6;
- `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §5a–§5b (copy for the auto-jailed screen and the undo);
- `docs/superpowers/specs/2026-10-30-kejar-rules.md` (the single source of truth; §4 numbers, §9 conflicts).

**Out of scope (later plans):**
- the "Dikejar see Kejar at check-in" switch (check-ins §5; Full mode, rules §12 step 4);
- the 10-second rescue (rules §9a);
- the motion versions of these screens (the `2× MISSED` plate, the marker crosses, hold-to-confirm), which come with the motion plan.

This plan ships plain, working screens with the final copy.

## Global Constraints

- Brand colours are Volt `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3` only. Fonts are Geist and Geist Mono.
- Free tiers only. Keep the single `api/game.ts` function; new server work is a new action on the existing router.
- Any database change is a numbered migration, `supabase/migrations/0008_checkins.sql`, which **the owner runs in Supabase by hand**. Never run SQL against Supabase from this plan.
- The scheduled ping alert lead is **45 s** (it was 30 s). Mat Rempit / Flare bonus pings keep a **30 s** lead and **never count towards auto-jail**.
- The Penjara QR's contents stay `KEJAR:JAIL` (`JAIL_QR`). Only the printed label and on-screen words change.
- All player-facing text is plain English (rules §6). Use the exact copy given in the tasks.
- Many files are CRLF. Preserve each file's existing line endings when editing.
- Run `npm test` and `npm run typecheck` in `app/` before every commit. Both must pass.
- Never commit `New Text Document.txt`, `app/.env.local` or `graphify-out/`.

## Review Focus

1. **The window edge.** A location exactly 45 s before the reveal counts; one at 45.001 s doesn't. A location *after* the reveal never counts for that ping. (Task 1 tests pin both edges.)
2. **Release just before a ping.** A runner freed 10 s before a reveal has no chance to check in for it, so that ping must not count. A ping counts only if its **alert time is at or after `freed_at`** (or the chase start). (Task 1 and Task 3 tests.)
3. **Two servers processing the same reveal at once.** `claimPing` already makes a reveal run once, but `autoJail` must also be atomic (only from free to jailed), so the event and the jailing never happen twice. (Task 2 store test.)
4. **Paused across a reveal.** No reveal runs while paused, so nobody is auto-jailed. After resume, the windows follow the shifted (wall-clock) reveal times. (Task 3 test.)
5. **Undoing the wrong thing.** Undo must refuse a runner who was caught by a chaser, is no longer jailed, or was auto-jailed before their latest release. It must never touch `freed_once`. (Task 5 tests.)

---

### Task 1: The check-in rules (pure functions)

**Files:**
- Create: `app/shared/checkins.ts`
- Create: `app/shared/checkins.test.ts`
- Modify: `app/shared/clock.ts` (alert lead)
- Modify: `app/shared/clock.test.ts` (alert times move to 45 s)

**Interfaces:**
- Produces:
  - `SCHEDULED_ALERT_LEAD_MS = 45_000`, `BONUS_ALERT_LEAD_MS = 30_000`;
  - `alertLeadFor(seq: number): number`: 45 s below `BONUS_SEQ_BASE`, 30 s at or above it;
  - `checkedIn(revealAt: number, lastAt: number | null, leadMs: number): boolean`: true when `lastAt` is in `[revealAt - leadMs, revealAt]`;
  - `autoJailDue(pings: { alertAt: number; revealAt: number; lastAt: number | null }[], since: number): boolean`. `pings` holds the scheduled pings revealed so far, oldest first, ending with the one being processed, each with the runner's latest position time at or before its reveal. It's true when the **last two** both have `alertAt >= since` and both fail `checkedIn` (with the 45 s lead).
- In `clock.ts`, `ALERT_LEAD_MS` is removed. `pingTimes` uses `SCHEDULED_ALERT_LEAD_MS`. Every other user switches to the new names (Tasks 3 and 6).

- [ ] **Step 1: Write the failing tests in `app/shared/checkins.test.ts`**

Use `T0` and `MIN` from `./fixtures.js`. Reveals at T0+10, +15 and +20 min:
- `checkedIn(R, R - 45_000, 45_000)` → true; `checkedIn(R, R - 45_001, 45_000)` → false; `checkedIn(R, null, 45_000)` → false; `checkedIn(R, R, 45_000)` → true.
- `alertLeadFor(1)` → 45_000; `alertLeadFor(1000)` → 30_000.
- `autoJailDue`:
  - missed both of the last two → true;
  - missed only the last one (checked in for the one before) → false (the free miss);
  - only one scheduled ping so far → false;
  - missed two, but the earlier one's `alertAt < since` → false (fresh start after release);
  - missed two, with `since` exactly equal to the earlier one's `alertAt` → true;
  - a runner who keeps the page open (a location 5 s before every reveal) → false.

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd app && npx vitest run shared/checkins.test.ts`
Expected: FAIL, because the module `./checkins.js` doesn't exist.

- [ ] **Step 3: Implement `app/shared/checkins.ts`, and switch `clock.ts` to `SCHEDULED_ALERT_LEAD_MS`**

`checkins.ts` imports `BONUS_SEQ_BASE` from `./clock.js`. `clock.ts` imports the lead constant from `./checkins.js`; if that creates a circular import, define both lead constants in `clock.ts` and re-export them from `checkins.ts`. In `clock.test.ts`, update any expectation built from a 30 s lead to 45 s.

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd app && npx vitest run shared/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/shared/checkins.ts app/shared/checkins.test.ts app/shared/clock.ts app/shared/clock.test.ts
git commit -m "feat: 45 s check-in window and auto-jail rule as shared functions"
```

### Task 2: Data for releases and auto-jail

**Files:**
- Create: `supabase/migrations/0008_checkins.sql`
- Modify: `app/shared/types.ts`: `Player.freed_at: string | null`; `EventType` adds `'auto-jailed' | 'auto-jail-undone'`
- Modify: `app/shared/fixtures.ts`, `app/src/screens/testView.ts` and every other `Player` literal: add `freed_at: null`
- Modify: `app/api/_lib/store.ts`: `GameStore.autoJail` and the `MemoryStore` implementation
- Modify: `app/api/_lib/supabaseStore.ts`: `PLAYER_COLUMNS` adds `freed_at`, plus `autoJail`
- Modify: `app/api/_lib/actions.ts`: `jailbreak` also sets `freed_at`; new players get `freed_at: null`
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces:
  - `GameStore.autoJail(id: string, atIso: string): Promise<boolean>` sets `jailed = true`, `caught_at = atIso`, `caught_by = null`, **only if the player isn't jailed**. It returns true for the first caller, like `catchRunner`.
  - `Player.freed_at` is the time of the player's last release (ISO), or `null`.

- [ ] **Step 1: Write the failing tests**
- `store.test.ts`: `autoJail` on a free runner returns true and sets the fields above. A second call returns false and leaves `caught_at` unchanged.
- `actions.test.ts`, in the existing jailbreak test: after a successful jailbreak, each freed player's `freed_at` equals the jailbreak time (`new Date(now).toISOString()`).
- `supabaseStore.test.ts`: follow the existing `catchRunner` test's pattern to show `autoJail` sends an update with `.eq('jailed', false)`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd app && npx vitest run api/_lib/store.test.ts api/_lib/actions.test.ts`
Expected: FAIL (`autoJail` is not a function; `freed_at` is undefined).

- [ ] **Step 3: Implement**
- **Migration `0008_checkins.sql`**, with a comment header in the style of `0005_safety.sql`:
  - `alter table players add column freed_at timestamptz;`
  - widen `safety_records.type` to also allow `'auto-jail-undone'`: drop the constraint `safety_records_type_check` and re-add it with `('sos', 'report', 'removed', 'auto-jail-undone')`.
- **`jailbreak`** patches `{ jailed: false, freed_once: true, freed_at: iso(ctx.now) }`.

- [ ] **Step 4: Run them and see them pass**

Run: `cd app && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_checkins.sql app/shared app/api/_lib app/src/screens/testView.ts
git commit -m "feat: freed_at and an atomic autoJail store method"
```

### Task 3: Auto-jail at each scheduled reveal

**Files:**
- Modify: `app/api/_lib/actions.ts`: the reveal loop in `advance` (currently writes the `missed` event); Flare's `addBonusPing` uses `BONUS_ALERT_LEAD_MS`; the `too-late` check uses `BONUS_ALERT_LEAD_MS`
- Modify: `app/shared/views.ts`: export `latestAtOrBefore`
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `autoJailDue`, `alertLeadFor` (Task 1); `GameStore.autoJail`, `Player.freed_at` (Task 2); `latestAtOrBefore(list, t)` from `shared/views.ts`.
- Produces:
  - an event `{ type: 'auto-jailed', actor_id: null, target_id: runnerId, data: { who: who(runner), seq } }`, written only when `autoJail` returns true;
  - the game ends (`finish`) when that leaves no free runner.
  - The old `missed` event is **no longer written** (`alertsFrom` keeps reading it for old games).

- [ ] **Step 1: Write the failing tests in `actions.test.ts`**

Use `safetyGame({ checkinMode: 'schedule' })` (chase from T0+5, reveals at +10, +15 and +20):
1. **Missing pings 1 and 2 auto-jails at ping 2.** Hafiz never sends a location. At `now = T0 + 15 * MIN`, `state` shows Hafiz `jailed`, `caught_by` null, and an `auto-jailed` event with `data.seq === 2`. The organiser's `state` alerts are `['Hafiz #03 missed 2 check-ins — sent to Penjara']` (the text comes from Task 4; this test may be finished there).
2. **One miss is free.** Aina checks in for ping 1 only → not jailed at ping 2.
3. **A location outside the window doesn't count.** Aina sends a location at T0+10 min − 60 s (before ping 1's window) and at T0+15 min − 50 s → auto-jailed at ping 2.
4. **Keeping the page open never misses.** Aina sends a location every 20 s from T0+5 to T0+21 → never jailed.
5. **Released runners start fresh.** Hafiz is auto-jailed at ping 2. Aina jailbreaks him at T0+15 min + 30 s (he is now freed). He sends nothing → not jailed at ping 3 (T0+20) and is jailed at ping 4 (T0+25).
6. **Flare pings don't count.** Ben uses a Flare at T0+11 min. Hafiz checks in for the scheduled pings only → never jailed.
7. **The last free runner auto-jailed ends the game.** In a game with one runner who never checks in, the game ends at ping 2 with `winner === 'chasers'`.
8. **Pauses.** The organiser pauses at T0+14 min and resumes at T0+20 min. Hafiz sends nothing → no auto-jail before the shifted ping 2 reveal (T0+21 min), and he's jailed at it.

- [ ] **Step 2: Run them and see them fail**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "auto"`
Expected: FAIL (no auto-jailing yet).

- [ ] **Step 3: Implement in `advance`'s reveal loop, for scheduled pings (`seq < BONUS_SEQ_BASE`)**
- Build the scheduled reveals revealed so far, up to this `seq`, from `pingTimes(game, now)` (each has `alertAt` and `revealAt`).
- Take the last two, and fetch positions with `store.latestPositions(game.id, [iso(prev.revealAt), iso(cur.revealAt)])`.
- For each free runner, pick `latestAtOrBefore(list, t)` at each reveal and call `autoJailDue` with `since = max(chaseStart, Date.parse(p.freed_at ?? ''))` (NaN-safe).
- On true: `autoJail(p.id, iso(cur.revealAt))`, then the event.
- After the loop, if every runner is jailed, `finish`.

- [ ] **Step 4: Run them and see them pass**

Run: `cd app && npm test && npm run typecheck`
Expected: all pass. Update the old test "a runner who skips pings 1 and 2 raises one missed alert at ping 2" to the new behaviour; it becomes test 1.

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/views.ts
git commit -m "feat: auto-jail runners who miss two scheduled check-ins in a row"
```

### Task 4: Alerts, feed, views and results for auto-jail

**Files:**
- Modify: `app/shared/alerts.ts`: new `AlertKind` `'auto-jail'`; `Alert` gains `targetId: string | null`
- Modify: `app/shared/views.ts`: feed lines; `View.jailReason`; `View.nextAlertAt`; the chasers' `missed` dot rule
- Modify: `app/shared/results.ts`: survival ends at an auto-jail that wasn't undone
- Test: `app/shared/alerts.test.ts`, `app/shared/views.test.ts`, `app/shared/results.test.ts`

**Interfaces:**
- Produces:
  - **The alert** from an `auto-jailed` event: `{ kind: 'auto-jail', text: \`${who} missed 2 check-ins — sent to Penjara\`, targetId: e.target_id }`. Other kinds have `targetId: null`. `KIND_LABEL` in `MarshalTools` (Task 6) shows it as `Check-ins`.
  - **Feed:** `auto-jailed` → `` `${tagLabel(target)} missed 2 check-ins — sent to Penjara` ``; `auto-jail-undone` → `` `${tagLabel(target)} is back in the game (marshal)` ``.
  - `View.jailReason: 'caught' | 'missed-checkins' | null`. It's `'missed-checkins'` when I'm jailed with `caught_by === null` and my latest jailing event is `auto-jailed`; `'caught'` when jailed by a chaser; otherwise null.
  - `View.nextAlertAt: number | null`, the `alertAt` of the same upcoming reveal as `nextRevealAt`.
  - **Chasers' dots:** `missed` becomes `!checkedIn(revealAt, Date.parse(at.at), alertLeadFor(last.seq))` instead of "before the previous reveal".
  - **Results:** `longestSurvivor` ends at the first `caught`, or the first `auto-jailed` with no later `auto-jail-undone` for the same target. `mostCatches` is unchanged.

- [ ] **Step 1: Write the failing tests**
- `alerts.test.ts`: the exact text and `targetId` for an `auto-jailed` event. It's sorted with the others and becomes handled by a `handled` event.
- `views.test.ts`:
  - both feed lines word for word;
  - `jailReason` for an auto-jailed runner, a caught runner and a free runner;
  - `nextAlertAt === nextRevealAt - 45_000` for a scheduled ping;
  - a chaser sees `missed: true` for a runner whose latest location is 46 s before the reveal and not for one at 30 s.
- `results.test.ts`:
  - an auto-jailed runner's survival ends at the auto-jail time;
  - an auto-jail followed by `auto-jail-undone` doesn't end survival (it runs to their later catch, or the end);
  - an auto-jail isn't counted in `mostCatches`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd app && npx vitest run shared/`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them and see them pass**

Run: `cd app && npm test && npm run typecheck`
Expected: all pass, including Task 3's test 1 alert text.

- [ ] **Step 5: Commit**

```bash
git add app/shared
git commit -m "feat: auto-jail alerts, feed lines, jail reason and results"
```

### Task 5: The marshal's undo

**Files:**
- Modify: `app/api/_lib/actions.ts`: new `undoAutoJail` action, registered in `actions`
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: the `auto-jailed` event and `Alert.id` (Task 4); `requireMarshal` (marshals and the organiser).
- Produces: `undoAutoJail({ code, token | organiserToken, eventId })` → `{ ok: true }` or `{ ok: false, reason: 'not-undoable' }`. On success:
  - the runner's patch is `{ jailed: false, caught_at: null, freed_at: iso(now) }`, with **`freed_once` untouched**;
  - events `{ type: 'auto-jail-undone', actor_id: marshal?.id ?? null, target_id: runnerId, data: {} }` and `{ type: 'handled', data: { eventId } }`;
  - a safety record `{ type: 'auto-jail-undone', player_id: marshal?.id ?? null, target_id: runnerId, data: { game_code, by: marshal?.name ?? 'Organiser', target_name } }`.

- [ ] **Step 1: Write the failing tests**
1. **Undo frees the runner.** After Hafiz's auto-jail, the organiser undoes it → Hafiz is free, `freed_once` is still false, the alert is handled, and the feed shows `Hafiz #03 is back in the game (marshal)`.
2. **The count restarts.** After the undo at T0+15 min + 10 s, Hafiz sends nothing → not jailed at ping 3 (his first miss since the undo), and jailed at ping 4.
3. **A chaser's catch can't be undone** → `{ ok: false, reason: 'not-undoable' }`.
4. **An already-released runner** (freed by a jailbreak after the auto-jail) → `not-undoable`.
5. **A player** (runner token) calling it → 403, like `handleAlert`.
6. **Undo twice** → the second returns `not-undoable`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd app && npx vitest run api/_lib/actions.test.ts -t "undo"`
Expected: FAIL (unknown action).

- [ ] **Step 3: Implement**

It's undoable only if the target runner is `jailed`, has `caught_by === null`, and the `auto-jailed` event for `eventId` has `at >= (freed_at ?? '')`.

- [ ] **Step 4: Run them and see them pass**

Run: `cd app && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: marshals can undo an auto-jail for a phone fault"
```

### Task 6: Screens: the check-in countdown, the auto-jailed runner, and the marshal buttons

**Files:**
- Modify: `app/src/screens/RunnerChase.tsx`: use `view.nextAlertAt` instead of `ALERT_LEAD_MS`
- Modify: `app/src/screens/Jail.tsx`: the auto-jailed variant
- Modify: `app/src/game/MarshalTools.tsx`: two buttons on open `auto-jail` alerts
- Test: `app/src/screens/RunnerChase.test.tsx`, `app/src/screens/Jail.test.tsx`, `app/src/game/MarshalTools.test.tsx`

**Interfaces:**
- Consumes: `View.nextAlertAt`, `View.jailReason`, `Alert.kind === 'auto-jail'`, `Alert.targetId` (Task 4); the `undoAutoJail` action (Task 5).

- [ ] **Step 1: Write the failing tests**
- **RunnerChase:** with `now` 40 s before `nextRevealAt` and `nextAlertAt = nextRevealAt - 45_000`, the `Check in` banner shows. At 50 s before, it shows `Next check-in in 0:05`.
- **Jail, `jailReason: 'missed-checkins'`:**
  - eyebrow `PENJARA · AUTO`;
  - heading `Missed two check-ins.`;
  - one of the four lines `Your phone went ponteng, bro.`, `Signal hilang, bossku?`, `Kena check in lah, boss.`, `Phone in your pocket too deep.` (stable for the session: pick by hashing the player id);
  - the text `Phone died or no buzz? Tell a marshal.`
- **Jail, `freed_once` true:** heading `That's the game for you.` and `You were already freed once, so you stay in Penjara until the end. Watch the chase from here.`
- **Jail, caught by a chaser:** keeps today's layout with the Penjara copy from Task 7.
- **MarshalTools:** an open `auto-jail` alert shows `Phone problem: undo` and `It stands`.
  - `Phone problem: undo` calls `undoAutoJail` with the alert id.
  - `It stands` calls `handleAlert`.
  - A handled one shows neither.

- [ ] **Step 2: Run them and see them fail**

Run: `cd app && npx vitest run src/`
Expected: FAIL.

- [ ] **Step 3: Implement**

These are plain buttons. Hold-to-confirm comes with the motion plan.

- [ ] **Step 4: Run them and see them pass**

Run: `cd app && npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/src
git commit -m "feat: auto-jailed Penjara screen, 45 s check-in banner, marshal undo buttons"
```

### Task 7: Penjara everywhere players and organisers read "jail"

**Files:**
- Modify:
  - `app/src/screens/Jail.tsx` (`BreakOut` and `BREAK_REJECTIONS`);
  - `app/src/game/PowerUpHand.tsx`;
  - `app/shared/views.ts` (the jailbreak feed line);
  - `app/src/screens/PrintTags.tsx`;
  - `app/src/game/SetupMap.tsx`;
  - `app/src/screens/HostNew.tsx` and `app/src/screens/ArenaSetup.tsx` (the pill label only; keep the internal `'jail'` values);
  - the `Screen` eyebrow on the jail screen.
- Test: update the matching tests (`Jail.test.tsx`, `views.test.ts`, `PrintTags.test.tsx`, `HostNew.test.tsx`, `ArenaSetup.test.tsx`).

**Interfaces:**
- Changes copy only. The `KEJAR:JAIL` QR, the `'jail'` mode values and the `arena.jail` field are unchanged.

**Exact copy:**
- `'Get within 30 m of the jail'` → `'Get within 30 m of Penjara'`
- `Break them out (N in jail)` → `Break them out (N in Penjara)`
- `"You can't use power-ups in jail"` → `"You can't use power-ups in Penjara"`
- feed: `` `${name} broke N runners out of jail` `` → `` `${name} broke N runners out of Penjara` ``
- jail screen: eyebrow `In jail` → `Penjara`; `Walk to jail.` → `Walk to Penjara.`; `…so you stay in jail this time.` → see Task 6's freed-once copy; `A free runner can still break you out — once.` stays
- print sheet label `JAIL` → `PENJARA`; image alt `Jail code` → `Penjara code`
- setup map list item `Jail` → `Penjara`; organiser pills `Jail` → `Penjara`

- [ ] **Step 1: Update the tests to the new copy (they now fail)**

Run: `cd app && npx vitest run`
Expected: FAIL on the old strings.

- [ ] **Step 2: Change the copy**

- [ ] **Step 3: Check nothing player-facing still says jail**

Run: `cd app && grep -rniE "['\">\`][^'\"<\`]*\bjail\b" src shared --include=*.tsx --include=*.ts | grep -v test | grep -viE "jailed|jailbreak|JAIL_QR|arena\.jail|'jail'|setJail|jail:|mode === 'jail'|m\.addSource|id: 'jail'|source: 'jail'"`
Expected: no player-facing lines left.

- [ ] **Step 4: Run everything**

Run: `cd app && npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat: say Penjara instead of jail on every screen and print sheet"
```

### Task 8: Owner hand-off

- [ ] **Step 1:** Add a short "Plan A" status block to `docs/HANDOFF.md`: what shipped, and that **the owner must run `supabase/migrations/0008_checkins.sql` in Supabase before merging to `main`**, since production code reads `players.freed_at`.
- [ ] **Step 2:** Commit (`docs: Plan A hand-off`). Don't merge to `main` or push to production until the owner confirms 0008 has run.
