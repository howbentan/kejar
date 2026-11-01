# Check-ins follow-up: strict 45 s window, marshal undo, auto-jailed screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the check-in work. First, a check-in counts **only** if sent in the 45 s before a scheduled ping, and a ping only counts towards auto-jail if its alert came after the runner's last release. Then add the marshal's "Phone problem: undo" and the final auto-jailed Penjara screen.

**Builds on:** `docs/superpowers/plans/2026-10-31-kejar-checkins-autojail-penjara.md` (built on branch `plan-checkins-autojail`). It already gives us:
- the 45 s scheduled alert;
- `players.freed_at` (migration 0008), set by jailbreak;
- auto-jail via `missedTwoInARow` with a per-runner anchor;
- the `auto-jailed` event (`data: { who, seq }`), its alert and feed line (`… missed 2 check-ins — sent to Penjara`), the alert reusing `AlertKind 'missed'`;
- survival ending at an auto-jail;
- the Penjara rename.

**Supersedes:** `docs/superpowers/plans/2026-10-30-kejar-plan-a-checkins-autojail.md`. That plan's Tasks 1, 4 (parts), 5 and 6 live on here, adapted to the code that now exists. Read it for the exact copy and test cases this plan refers to as "Plan A §n".

**Architecture:**
- **New pure functions in `app/shared/checkins.ts`** replace `missedTwoInARow`'s "any location since the previous reveal" rule in `advance` and in the chasers' "missed" dots.
- **A new `undoAutoJail` action** frees an auto-jailed runner without touching `freed_once`, and is logged to `safety_records`.
- **`View.jailReason`** drives the auto-jailed variant of `Jail.tsx`.

**Tech Stack:** Vite 8, React 19, TypeScript, Vitest; `GameStore` (`MemoryStore` / `SupabaseStore`); Supabase migrations run by the owner.

**Spec:**
- `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md` §4.2 and §4.4;
- `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §5a and §5b;
- `docs/superpowers/specs/2026-10-30-kejar-rules.md` (wins conflicts).

## Global Constraints

- Same as Plan A's Global Constraints: brand colours only; one `api/game.ts`; migrations run by the owner by hand; the 45 s scheduled lead with Flare's 30 s; the `KEJAR:JAIL` QR unchanged; plain English with the exact copy given; preserve each file's line endings; `npm test` and `npm run typecheck` green before every commit.
- **Migration:** `supabase/migrations/0009_auto_jail_undo.sql` widens `safety_records.type` to allow `'auto-jail-undone'`. Drop `safety_records_type_check` and re-add it with `('sos', 'report', 'removed', 'auto-jail-undone')`.
- **Hold-to-confirm** for the undo button comes with the motion plan; here it's a plain button.

## Review Focus

1. **The window edge:** a location exactly 45 s before the reveal counts; 45.001 s doesn't. A location after the reveal never counts for that ping.
2. **Release just before a ping:** a ping whose alert came before `freed_at` never counts, even if its reveal is after.
3. **Undo targets:** undo refuses a chaser's catch, an already-released runner, and a second undo, and never changes `freed_once`.
4. **Survival:** an undone auto-jail doesn't end survival time.
5. **The chasers' map:** the dashed "missed" circle uses the same 45 s rule (30 s for a Flare ping) as auto-jail, so the map and the rule never disagree.

---

### Task 1: The strict window as shared functions, used by `advance`

**Files:**
- Create: `app/shared/checkins.ts` and `app/shared/checkins.test.ts`
- Modify: `app/api/_lib/actions.ts` (the reveal loop in `advance`)
- Modify: `app/shared/views.ts` (export `latestAtOrBefore`; the chasers' `missed` dot rule)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Produces: `BONUS_ALERT_LEAD_MS = 30_000` (re-export `SCHEDULED_ALERT_LEAD_MS` from `clock.ts`); `alertLeadFor(seq)`, `checkedIn(revealAt, lastAt, leadMs)` and `autoJailDue(pings, since)`, **exactly as Plan A Task 1's Interfaces block defines them**.
- `missedTwoInARow` stops being used by `advance`. Delete it if nothing else imports it, along with its tests.

- [ ] **Step 1: Write the failing tests**
  - Plan A Task 1, Step 1: all the `checkins.test.ts` cases.
  - `actions.test.ts`:
    - **A location 60 s before ping 1's reveal and 50 s before ping 2's** → auto-jailed at ping 2. This fails today, because the old rule counts both.
    - **Freed 10 s before a reveal:** a runner with no check-in for that ping isn't charged with a miss for it. Build on the existing "freed just before a reveal" test, with `freed_at` inside ping 2's alert window.
  - `views.test.ts`: a chaser sees `missed: true` for a runner whose latest location is 46 s before the reveal, and not for one at 30 s.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/checkins.test.ts api/_lib/actions.test.ts shared/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - In `advance`, for each free runner, take the last two scheduled reveals up to this `seq`. Fetch `latestPositions` at both reveal times, pick `latestAtOrBefore` at each, and call `autoJailDue` with `since = max(chaseStart, freed_at)`.
  - Keep the existing `catchRunner(p.id, null)`, the event and the game-end check.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass. Some older tests that send a check-in "any time since the last reveal" may now need their location moved inside the 45 s window; keep their intent.
- [ ] **Step 5:** Commit: `feat: a check-in only counts inside the 45 s window, and only after release`.

### Task 2: The marshal undo, plus survival and the alert's target

**Files:**
- Create: `supabase/migrations/0009_auto_jail_undo.sql`
- Modify:
  - `app/shared/types.ts`: `EventType` adds `'auto-jail-undone'`;
  - `app/shared/alerts.ts`: `Alert.targetId: string | null`, plus a new `AlertKind 'auto-jail'` for `auto-jailed` events (label `Check-ins` in `MarshalTools`' `KIND_LABEL`);
  - `app/shared/views.ts`: the feed line for `auto-jail-undone`;
  - `app/shared/results.ts`: an undone auto-jail doesn't end survival;
  - `app/api/_lib/actions.ts`: the new `undoAutoJail` action;
  - `app/api/_lib/store.ts` and `app/api/_lib/supabaseStore.ts`: `SafetyRecord` type allows `'auto-jail-undone'`.
- Test: `app/shared/alerts.test.ts`, `app/shared/views.test.ts`, `app/shared/results.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `undoAutoJail` and its effects, **exactly as Plan A Task 5's Interfaces block**:
  - **Patch:** `{ jailed: false, caught_at: null, freed_at: now }`.
  - **Events:** `auto-jail-undone` and `handled`.
  - **Safety record:** `auto-jail-undone`.
  - **Refusal:** `{ ok: false, reason: 'not-undoable' }`.
- **The feed line:** `` `${tagLabel(target)} is back in the game (marshal)` ``.

- [ ] **Step 1: Write the failing tests**
  - Plan A Task 5, Step 1: tests 1–6.
  - Plan A Task 4, Step 1: the `results.test.ts` "auto-jail followed by `auto-jail-undone`" case, the `alerts.test.ts` `targetId` case, and the undo feed line.
- [ ] **Step 2:** Run: `cd app && npx vitest run api/_lib/actions.test.ts shared/`. Expected: FAIL.
- [ ] **Step 3: Implement**, including migration 0009.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: marshals can undo an auto-jail for a phone fault`.

### Task 3: The auto-jailed screen, the freed-once screen, and the marshal buttons

**Files:**
- Modify: `app/shared/views.ts` (`View.jailReason`), `app/src/screens/Jail.tsx`, `app/src/game/MarshalTools.tsx`
- Test: `app/shared/views.test.ts`, `app/src/screens/Jail.test.tsx`, `app/src/game/MarshalTools.test.tsx`

**Interfaces:**
- Produces: `View.jailReason: 'caught' | 'missed-checkins' | null`, as in Plan A Task 4.

- [ ] **Step 1: Write the failing tests**
  - Plan A Task 4: the `jailReason` cases.
  - Plan A Task 6, Step 1: the Jail and MarshalTools cases, with the exact copy:
    - `PENJARA · AUTO` and `Missed two check-ins.`;
    - the four random lines;
    - `Phone died or no buzz? Tell a marshal.`;
    - the freed-once copy, `That's the game for you.` and `You were already freed once, so you stay in Penjara until the end. Watch the chase from here.`;
    - the buttons `Phone problem: undo` and `It stands`.
- [ ] **Step 2:** Run: `cd app && npx vitest run src/ shared/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: auto-jailed Penjara screen and marshal undo buttons`.

### Task 4: Hand-off

- [ ] Note in `docs/HANDOFF.md` that **the owner must run 0008 and 0009 in Supabase before this reaches `main`**. Commit (`docs: check-ins follow-up hand-off`).
