# Check-ins, Auto-jail, and the Penjara Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "skipping check-ins costs nothing" exploit by tightening what counts as a check-in and auto-jailing a runner who misses two scheduled check-ins in a row, and rename the jail to "Penjara" wherever players see it.

**Architecture:** The scheduled-ping alert lead time moves from 30 s to 45 s. Each runner's own "last released" time (a new `freed_at` field, set by jailbreak today) becomes the anchor for their missed-check-in streak, so a freshly-freed runner never starts jailed again at the very next ping. When the existing `missedTwoInARow` check trips at a ping's reveal, the runner is jailed exactly like a normal catch (`caught_by: null`) instead of only alerting a marshal, and survival time for results ends on that jailing the same way it ends on a catch. "Jail" becomes "Penjara" in every string a player reads; internal identifiers (component name, map layer ids, the `KEJAR:JAIL` QR payload) are untouched.

**Scope note (Claude's call):** The design doc also covers §5, "Dikejar can see Kejar at check-in" (an organiser switch that shows runners a frozen snapshot of chaser positions). `docs/superpowers/specs/2026-10-30-kejar-rules.md` §12's build-order item #1 only names "the 45 s window, auto-jail, Penjara naming" — it does not name the chaser-snapshot switch. That switch also needs its own new storage (a chaser-position snapshot per alert) that nothing else in this plan needs, so it is left out of this plan entirely and should be its own follow-up plan once this one ships. Confirm this split is what you want before executing.

**Tech Stack:** TypeScript, Vitest, the existing `MemoryStore`/`SupabaseStore` split behind the `GameStore` interface, Supabase/Postgres for the one new column.

**Spec:** `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md` (§4, §6, §8a — the parts this plan builds). `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for numbers and wins any conflict.

## Global Constraints

- Brand colours: Volt `#C6FF3D`, black and white only, if any UI text styling is touched.
- Free tiers only; keep the single `api/game.ts` function — no new serverless functions.
- Any new database column is a numbered migration the owner runs by hand in Supabase; this plan adds exactly one, `0008_freed_at.sql`.
- Reuse existing shared code rather than duplicating it: `missedTwoInARow` (`app/shared/alerts.ts`), `toWall` (`app/shared/clock.ts`), the existing `pushTo` check-in push.
- No new push notifications (design doc §4, §5.4's rule — this plan doesn't touch §5, but must not add a push call either).
- Nothing here is judged by a marshal; every rule is decided by the app.
- Mat Rempit's bonus pings keep their own 30 s alert lead and never count toward the auto-jail streak.

## Review Focus

- **Mat Rempit's bonus pings must never count toward the 2-missed streak.** A runner who ignores every bonus ping but checks in to every scheduled ping must never be auto-jailed.
- **A runner never yet freed this game (`freed_at` is `null`) must anchor correctly at the chase start,** not misbehave or auto-jail them using a window that predates the chase.
- **Auto-jailing the last free runner must end the game for the chasers,** exactly like a normal catch does.
- **A runner already on their one lifetime "freed" who is auto-jailed a second time must stay in Penjara for good.** Auto-jail must never grant a fresh escape.
- **No check-in can be missed while the game is paused.** The streak must not advance during a pause (design doc §4.6).

---

## Task 1: Split the scheduled check-in alert lead time to 45 s

**Files:**
- Modify: `app/shared/clock.ts` (the `ALERT_LEAD_MS` constant and `pingTimes`)
- Test: `app/shared/clock.test.ts` (create if it doesn't already exist, following the import/fixture style of `app/shared/views.test.ts`)

**Interfaces:**
- Produces: `export const SCHEDULED_ALERT_LEAD_MS = 45_000` from `app/shared/clock.ts`, used by `pingTimes` for every scheduled ping's `alertAt`.
- Leaves `ALERT_LEAD_MS` (30 s) in place and unrenamed if anything outside `pingTimes` still reads it (check before touching it — see Step 3).

- [ ] **Step 1: Write the failing test**

```ts
import { game, T0, MIN } from './fixtures.js'
import { pingTimes, SCHEDULED_ALERT_LEAD_MS } from './clock.js'

it('a scheduled ping alerts 45 s before it reveals', () => {
  const g = game({ started_at: new Date(T0).toISOString(), settings: { ...game().settings, pingMin: 5 } })
  const [first] = pingTimes(g, T0 + 5 * MIN)
  expect(first.revealAt - first.alertAt).toBe(45_000)
  expect(SCHEDULED_ALERT_LEAD_MS).toBe(45_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- clock`
Expected: FAIL — `SCHEDULED_ALERT_LEAD_MS` is not exported, or the lead time is still 30 s.

- [ ] **Step 3: Grep for every other usage of `ALERT_LEAD_MS` before changing anything**

Run: `grep -rn "ALERT_LEAD_MS" app/`
If any call site outside `pingTimes` depends on the 30 s value (most likely wherever a bonus/Mat Rempit ping's `alert_at`/`reveal_at` gets computed before being passed to `addBonusPing`), leave that call site reading the old `ALERT_LEAD_MS` constant unchanged. Only `pingTimes`'s computation for scheduled pings should move to the new constant.

- [ ] **Step 4: Add `SCHEDULED_ALERT_LEAD_MS = 45_000` to `app/shared/clock.ts` and use it in `pingTimes`'s `alertAt = revealAt - SCHEDULED_ALERT_LEAD_MS` computation**

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- clock`
Expected: PASS

- [ ] **Step 6: Run the full suite to confirm nothing else assumed the old 30 s scheduled lead**

Run: `npm test`
Expected: PASS. If something fails because it hardcoded the old 30 s lead for a *scheduled* ping specifically (not a bonus ping), fix that test's expectation to 45 s rather than reverting the source change.

- [ ] **Step 7: Commit**

```bash
git add app/shared/clock.ts app/shared/clock.test.ts
git commit -m "feat: scheduled pings alert 45s before reveal, not 30s"
```

---

## Task 2: Track each runner's "last released" time

**Files:**
- Modify: `app/shared/types.ts` (add `freed_at` to `Player`)
- Modify: `app/api/_lib/actions.ts` (the `jailbreak` action's release patch)
- Create: `supabase/migrations/0008_freed_at.sql`
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `Player.freed_at: string | null` (an ISO timestamp, `null` until the runner has ever been freed).
- Consumes nothing new; `jailbreak`'s existing `store.updatePlayers` call is extended, not restructured.

- [ ] **Step 1: Write the failing test**

```ts
it('jailbreak sets freed_at on everyone it frees', async () => {
  // ...use this file's existing createOrganiser/run helpers to get a game past hide into chase,
  // jail a runner, then run the jailbreak action for a rescuer...
  const { game: g } = /* existing fixture setup */
  await run('jailbreak', { code: g.code, token: rescuerToken, ... })
  const freed = (await store.players(g.id)).find((p) => p.id === jailedRunnerId)
  expect(freed.freed_at).not.toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — `freed_at` is `undefined`, not a timestamp.

- [ ] **Step 3: Add `freed_at: string | null` to the `Player` interface in `app/shared/types.ts`, next to `freed_once`**

- [ ] **Step 4: Create `supabase/migrations/0008_freed_at.sql`**, following `0007_arenas.sql`'s one-line-comment-plus-rationale header style:

```sql
-- Tracks when a runner was last released (jailbreak, and later the dare
-- wheel's free slice and Dato Seri's Settle), so the auto-jail streak
-- anchors at release, not chase start. See checkins design doc §4.4.
alter table players add column freed_at timestamptz;
```

- [ ] **Step 5: In `app/api/_lib/actions.ts`'s `jailbreak` action, add `freed_at: new Date(now).toISOString()` to the patch already sent to `store.updatePlayers` for every freed id**

- [ ] **Step 6: If `SupabaseStore`'s `updatePlayers` (or any other method) enumerates player columns explicitly rather than spreading the patch object, add `freed_at` to that list**

Check `app/api/_lib/supabaseStore.ts` for an explicit column list on `updatePlayers`/`addPlayer`/`players`; most Supabase wrappers spread the patch directly into `.update()`, in which case no change is needed there — only check and note which is true.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/shared/types.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts supabase/migrations/0008_freed_at.sql
git commit -m "feat: track freed_at, set by jailbreak"
```

---

## Task 3: Anchor the missed-check-in streak at each runner's own release time

**Files:**
- Modify: `app/api/_lib/actions.ts:205-232` (the `advance` function's reveal-processing loop)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `Player.freed_at` (Task 2), `missedTwoInARow(windows: number[], lastAt: number | null): boolean` (unchanged signature, `app/shared/alerts.ts`).
- Produces: per-runner `windows` arrays inside `advance`, each anchored at `max(chaseStartOf(game, now)!, Date.parse(player.freed_at) || -Infinity)` rather than the single shared array anchored only at `chaseStartOf` that exists today.

- [ ] **Step 1: Write the failing test**

```ts
it('a runner freed just before this reveal does not inherit misses from before they were freed', async () => {
  // set up a runner jailed, then freed (freed_at = some time T), who then misses the next
  // two scheduled check-ins after T. Assert they are NOT auto-jailed on the first of those
  // two misses (their streak should only have one miss counted, since the ping before T
  // doesn't belong to their post-release window).
})

it('a runner never freed this game still auto-jails correctly using chase start as the anchor', async () => {
  // a runner with freed_at === null who misses two scheduled check-ins in a row from the
  // start of the game is still caught by the existing logic.
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL (or passes vacuously if Task 4 hasn't wired up the jailing yet — if so, assert on the computed `windows`/streak state this task changes, not on `jailed`, and extend the assertion once Task 4 lands. Use your judgement; it's fine for this task's test to assert an intermediate signal if Task 4 is the very next task in the same sitting.)

- [ ] **Step 3: In `advance`, change the `windows` array construction inside the `for (const seq of work.reveal)` loop so it's built per free runner, not once for all runners**

For each free runner `p`:
```ts
const anchor = Math.max(chaseStartOf(game, now)!, p.freed_at ? Date.parse(p.freed_at) : -Infinity)
const windows = [anchor, ...pingTimes(game, now).filter((t) => t.seq <= seq && t.revealAt > anchor).map((t) => t.revealAt)]
```
Keep everything else about the loop (how `last` — the runner's latest position — is found) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: anchor the missed-check-in streak at a runner's own last release"
```

---

## Task 4: Auto-jail a runner who misses two scheduled check-ins in a row

**Files:**
- Modify: `app/shared/types.ts` (`EventType` union)
- Modify: `app/api/_lib/store.ts` (`GameStore.catchRunner`, `MemoryStore.catchRunner`)
- Modify: `app/api/_lib/supabaseStore.ts` (`SupabaseStore.catchRunner`)
- Modify: `app/api/_lib/actions.ts:224-229` (the `missed` event emission point in `advance`)
- Modify: `app/shared/alerts.ts` (`toAlert`'s switch)
- Modify: `app/shared/views.ts` (`feedText`'s switch)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/alerts.test.ts` (create if it doesn't exist), `app/shared/views.test.ts`

**Interfaces:**
- Consumes: Task 3's per-runner `windows` and the existing `missedTwoInARow` result at that same point in `advance`.
- Produces: `EventType` gains `'auto-jailed'`. `GameStore.catchRunner(id: string, by: string | null): Promise<boolean>` — widened from `by: string`; `by: null` means no chaser made the catch. Later tasks and any future spec (the dare wheel, Dato Seri) that need to tell an auto-jail apart from a normal catch should match on `event.type === 'auto-jailed'` and `player.caught_by === null`.

- [ ] **Step 1: Write the failing test**

```ts
it('a runner who misses two scheduled check-ins in a row is auto-jailed', async () => {
  // drive the game through two scheduled reveals with no location sent for one runner,
  // using this file's existing time-travel/run helpers
  const players = await store.players(g.id)
  const p = players.find((x) => x.id === runnerId)
  expect(p.jailed).toBe(true)
  expect(p.caught_by).toBeNull()
  const events = await store.events(g.id)
  expect(events.some((e) => e.type === 'auto-jailed' && e.target_id === runnerId)).toBe(true)
  expect(events.some((e) => e.type === 'missed' && e.target_id === runnerId)).toBe(false)
})

it('auto-jailing the last free runner ends the game for the chasers', async () => {
  // same setup, but every other runner is already jailed
  const ended = await store.gameByCode(g.code)
  expect(ended.winner).toBe('chasers')
})

it('a runner already on their one lifetime freed who is auto-jailed again stays jailed for good', async () => {
  // runner has freed_once: true already; drive them to a second auto-jail; confirm jailed stays
  // true and nothing re-opens their jailbreak eligibility
})

it('a missed Mat Rempit bonus ping never counts toward the auto-jail streak', async () => {
  // a runner who checks in to every scheduled ping but ignores a Mat Rempit bonus ping
  // (seq >= BONUS_SEQ_BASE) must never be auto-jailed
  const players = await store.players(g.id)
  expect(players.find((p) => p.id === runnerId).jailed).toBe(false)
})

it('no check-in can be missed while the game is paused', async () => {
  // pause the game between two scheduled reveals (no location sent for one runner), resume,
  // confirm the paused gap didn't itself count as a miss once the schedule continues
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — the runner is shown `missed` but `jailed` stays `false`, and the game doesn't end.

- [ ] **Step 3: Add `'auto-jailed'` to the `EventType` union in `app/shared/types.ts`**

- [ ] **Step 4: Widen `catchRunner`'s `by` parameter to `string | null` in the `GameStore` interface (`app/api/_lib/store.ts`), `MemoryStore.catchRunner`, and `SupabaseStore.catchRunner` (`app/api/_lib/supabaseStore.ts`)**

No other change to either implementation's body — both already write `caught_by` through from the parameter, and `Player.caught_by` is already typed `string | null`.

- [ ] **Step 5: Read `advance`'s reveal loop in full and confirm whether the existing `missedTwoInARow` check already only runs for scheduled-ping seqs (below `BONUS_SEQ_BASE`), or whether it also runs for bonus-ping reveals**

`pingTimes(game, now)` (which feeds `windows`, Task 3) only generates the regular schedule, so a bonus ping's own reveal is unlikely to appear in `windows` — but confirm whether `work.reveal` itself (the list of seqs being processed this tick) is filtered to scheduled seqs only before this check runs. If it isn't, add an explicit `seq < BONUS_SEQ_BASE` guard around the auto-jail check so a bonus-ping reveal can never trigger it, per the design doc's explicit non-goal.

- [ ] **Step 6: In `advance`'s reveal loop, where `missedTwoInARow` currently triggers a `missed` event (`app/api/_lib/actions.ts:224-229`), replace that emission:**

On `missedTwoInARow(windows, lastAt) === true` for a free runner `p`:
```ts
await store.catchRunner(p.id, null)
await addEvent({ type: 'auto-jailed', actor_id: null, target_id: p.id, data: {} })
```
Then, after the reveal loop finishes processing all runners for this `seq` (matching how `catchAction` checks for the game ending after a normal catch), check whether every runner is now jailed; if so, call `finish(ctx, game)` the same way `catchAction` does.

- [ ] **Step 7: In `app/shared/alerts.ts`'s `toAlert`, add a case for `'auto-jailed'` producing the marshal alert text `#07 missed 2 check-ins — sent to Penjara`** (substituting the real tag), matching whatever existing helper the other cases use to format a player's `#NN` tag. This case replaces the old `missed`-event alert for this condition — `missed` events are no longer emitted at this trigger point (Task 4 Step 6), so no "isn't sent as well" guard is needed; there's nothing left to guard against.

- [ ] **Step 8: In `app/shared/views.ts`'s `feedText`, add a case for `'auto-jailed'` producing the same copy, `#07 missed 2 check-ins — sent to Penjara`, resolving the target player the same way neighbouring cases do**

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/shared/types.ts app/api/_lib/store.ts app/api/_lib/supabaseStore.ts app/api/_lib/actions.ts app/shared/alerts.ts app/shared/views.ts app/api/_lib/actions.test.ts app/shared/alerts.test.ts app/shared/views.test.ts
git commit -m "feat: auto-jail a runner who misses two scheduled check-ins in a row"
```

---

## Task 5: Auto-jail ends survival time in results, without counting as a catch

**Files:**
- Modify: `app/shared/results.ts`
- Test: `app/shared/results.test.ts` (create if it doesn't already exist, following `app/shared/views.test.ts`'s fixture style)

**Interfaces:**
- Consumes: `'auto-jailed'` events (Task 4).
- Produces: no new exported shape — `computeResults`'s existing `Results` return type is unchanged, only which events feed `longestSurvivor` changes.

- [ ] **Step 1: Write the failing test**

```ts
it('an auto-jailed runner\'s survival time ends at the auto-jail, not at game end', () => {
  const events = [event('auto-jailed', T0 + 10 * MIN, { target_id: 'r1' })]
  const results = computeResults(g, [player('r1', 'runner')], events)
  expect(results.longestSurvivor.id).toBe('r1')
  expect(results.longestSurvivor.ms).toBe(10 * MIN)
})

it('an auto-jail is never counted as a catch for Most catches', () => {
  const events = [event('auto-jailed', T0 + 10 * MIN, { target_id: 'r1' })]
  const results = computeResults(g, [player('r1', 'runner')], events)
  expect(results.mostCatches).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- results`
Expected: FAIL — `longestSurvivor` is `null` because only `'caught'` events are considered.

- [ ] **Step 3: In `computeResults`, change the event filter that builds `longestSurvivor`'s candidates from `events.filter((e) => e.type === 'caught')` to also include `'auto-jailed'` events** (`e.type === 'caught' || e.type === 'auto-jailed'`). Leave the `mostCatches` tally's filter as `'caught'` only — unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- results`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/results.ts app/shared/results.test.ts
git commit -m "feat: an auto-jail ends survival time like a catch, without counting as one"
```

---

## Task 6: Rename "jail" to "Penjara" in every player-facing string

**Files:**
- Modify: `app/src/game/MarshalTools.tsx:149`
- Modify: `app/src/game/SetupMap.tsx:15`
- Modify: `app/src/game/PowerUpHand.tsx:37`
- Modify: `app/src/screens/ArenaSetup.tsx:170`
- Modify: `app/src/screens/HostNew.tsx:278`
- Modify: `app/src/screens/Jail.tsx:13,63,74`
- Modify: `app/src/screens/PrintTags.tsx:47-48`
- Test: whichever of the above have existing test files with assertions on the old text (at minimum check `Jail.test.tsx`)

**Interfaces:** None — this task only changes string literals, no types or signatures.

**Explicitly unchanged** (internal identifiers, not player-facing, per design doc §6): the component file/name `Jail.tsx`, mode-key strings `'jail'` (`ArenaSetup.tsx:145`, `HostNew.tsx:50/128`, `PlaceMap.tsx:16`), MapLibre source/layer ids `'jail'` (`Map.tsx:109/114/116`), the `JAIL_QR` constant name, and the `KEJAR:JAIL` QR payload itself — already-printed cards must keep working.

**Left as a judgement call, not decided by the design doc:** `Results.tsx:12`'s `'Jailbreak hero'` award name stays as-is. The design doc only renames the noun "jail" (the place); "jailbreak" is an established term for the rescue action throughout every other doc in this project and is never renamed alongside it.

- [ ] **Step 1: Grep for any existing test assertions on the old "jail"/"Jail" text in a player-facing string**

Run: `grep -rln "jail\|Jail" app/src/**/*.test.tsx 2>/dev/null`
For each hit, confirm whether the asserted text is one of the strings this task changes (player-facing) or an internal identifier (unchanged) before touching it.

- [ ] **Step 2: Apply the renames listed in Files above, one file at a time, keeping every internal identifier untouched**

- [ ] **Step 3: Update any test assertions found in Step 1 that covered a string this task changed, to expect "Penjara" instead**

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/game/MarshalTools.tsx app/src/game/SetupMap.tsx app/src/game/PowerUpHand.tsx app/src/screens/ArenaSetup.tsx app/src/screens/HostNew.tsx app/src/screens/Jail.tsx app/src/screens/PrintTags.tsx
git commit -m "feat: rename jail to Penjara in every player-facing string"
```
