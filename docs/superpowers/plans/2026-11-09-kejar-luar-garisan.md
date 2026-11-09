# Luar Garisan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leaving the play area has a real penalty. A runner or chaser whose location is reported outside the 20 m margin twice in a row (with no report inside the margin in between) is marked **Luar Garisan**. They're warned on the first report. From then on they can keep playing socially, but they can't win anything that round.

**Architecture:**
- **Two new nullable timestamps on `players`.**
  - `out_warned_at`: the first outside report has happened.
  - `disqualified_at`: Luar Garisan, permanent for the round.
- **Evaluation point:** the decision runs where the existing `outside` alert already runs, `checkWhere()` in `app/api/_lib/actions.ts`, on every `location` report.
- **Consequences:** they reuse the existing "free runner" checks by widening each from `!jailed` to `!jailed && !disqualified_at`.
- **Screens:**
  - A disqualified runner sees the existing Penjara spectator map with Luar Garisan copy, and none of Penjara's ceremony.
  - A disqualified chaser gets a banner.

**Tech Stack:** TypeScript, React, Vitest, Supabase/Postgres (one new migration, `0013_luar_garisan.sql`, which the owner runs by hand).

**Spec:** `docs/superpowers/specs/2026-11-02-kejar-luar-garisan-design.md`. Where it disagrees, the rules doc `docs/superpowers/specs/2026-10-30-kejar-rules.md` wins.

## Global Constraints

- Brand colours are Volt `#C6FF3D`, black and white only. Luar Garisan must never use Penjara's language, screen furniture or ceremony (spec §9).
- **Copy: English with a light Malaysian twist** (the owner's decision, 2026-11-09). Sentences stay grammatical and readable by a non-Malay speaker. Common words like *eh*, *balik*, *alamak* and *lah* add the flavour; nothing needs a dictionary. Marshal screens stay plain English, as safety screens always have. Exact copy:
  - **Runner's first warning push:** `Eh, you're outside the play area! Balik before your next check-in or you're out.` (spec §6.1)
  - **Chaser's first warning push:** `Eh, you're outside the play area! Balik now or you're out.` Claude's call per spec §10: chasers report every few seconds, so "next check-in" would be wrong for them.
  - **Runner's final push:** `Luar Garisan lah! You left the play area, so no winning this round. You can still play along.`
  - **Chaser's final push:** `Luar Garisan lah! You left the play area, so no winning this round, and your catches don't count.`
  - **No em-dashes in any player-facing line** (owner's decision). Use a full stop, comma, colon or `!` instead.
- The spatial buffer stays `OUTSIDE_MARGIN_M` (20 m). Nothing new is tracked; no new location stream.
- One free out-of-bounds report; the second consecutive one triggers it. A report within the margin resets the streak.
- It's permanent for the round. Coming back doesn't undo it.
- Free tiers only, and the single `api/game.ts` function stays. The new migration is idempotent and wrapped in `begin; … commit;` like `0012`.
- **Run 0013 before merging.** The player select reads the new columns, so every game breaks until it runs. It's additive and safe to run on the live database ahead of the merge. In code, test the fields as truthy (`!p.disqualified_at`, never `=== null`), so test fixtures and older rows without them still work.

## Review Focus

1. **Paused game:** a player who walks out while the game is paused, for example to reach a marshal, is never warned or disqualified. Pausing should freeze the rule as it freezes everything else (Task 1 test).
2. **GPS jitter in the margin band:** a report 0–20 m outside counts as *inside* for the streak, so it resets a pending warning. Only reports more than 20 m out count (Task 1 test).
3. **Already jailed or removed:** a jailed runner sitting in Penjara is never disqualified, nor is a removed player. Penjara is inside the area, but GPS drift there must not stack a second penalty (Task 1 test).
4. **The last free runner gets disqualified:** the game ends exactly as if they were caught, and the winner is the chasers (spec §7a; Task 2 test).
5. **A disqualified runner can't be caught or freed:** a chaser scanning a disqualified runner's tag is refused, not credited. A jailbreak or Settle never counts or frees a disqualified player (Task 2 test).

---

### Task 1: The rule: warning, streak and disqualification

**Files:**
- Create: `supabase/migrations/0013_luar_garisan.sql`
- Modify: `app/shared/types.ts` (`Player`, `EventType`)
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts` (`PLAYER_COLUMNS`, new store method)
- Modify: `app/api/_lib/actions.ts` (`checkWhere`)
- Modify: `app/public/sw.js` (new `notice` push type)
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/src/game/sw.test.ts`

**Interfaces:**
- **Produces, on `Player`:**
  - `out_warned_at?: string | null`
  - `disqualified_at?: string | null`
  - Both are optional, so rows read before 0013 still type-check.
- **Produces, on `EventType`:** `'out-warned' | 'luar-garisan'`. Both have actor = the player and data `{ who }`, the same `who(me)` label the `outside` event uses.
- **Produces:** `GameStore.markOutside(playerId: string, at: string): Promise<'warned' | 'disqualified' | 'unchanged'>`. It is atomic, and decides from the stored row, never the caller's copy.
  - If `disqualified_at` is set, it returns `unchanged`.
  - If `out_warned_at` is null, it sets it to `at` and returns `warned`.
  - If `out_warned_at` is already set, it sets `disqualified_at = at` and returns `disqualified`.
- **Produces:** `GameStore.clearOutWarning(playerId: string): Promise<void>`, which sets `out_warned_at = null` when `disqualified_at` is null.
- **Produces:** the push payload `{ type: 'notice', code, title, body }`. `sw.js` shows `title` and `body` and opens `/g/<code>` when tapped.

- [ ] **Step 1: Write the failing tests** in `actions.test.ts`, in a `describe('Luar Garisan')`. Use the existing helpers that run `location` at a given clock and position:
  - `it('warns a runner on the first report more than 20 m outside, and pushes the runner warning')`. Expect one `out-warned` event and one push to that player with the exact runner warning copy. `disqualified_at` stays unset.
  - `it('disqualifies on the second consecutive report outside')`. Expect a `luar-garisan` event, `disqualified_at` set to that report's time, and the runner's final push copy.
  - `it('a report back within 20 m in between resets the streak')`. The sequence outside → 10 m outside → outside gives only a new warning, no disqualification.
  - `it('uses the chaser copy for chasers')`. Chasers get both chaser pushes.
  - `it('stays disqualified after coming back inside')`. Inside reports never clear `disqualified_at`.
  - `it('never warns or disqualifies while the game is paused, in the lobby, or after it ends')` (Review Focus 1).
  - `it('never warns or disqualifies a jailed runner, a marshal, or a removed player')` (Review Focus 3).
  - `it('keeps the existing marshal outside alert')`: the `outside` event still fires once per excursion, as today.
  - `store.test.ts`: `MemoryStore.markOutside` goes `warned`, then `disqualified`, then `unchanged`, and `clearOutWarning` resets a pending warning but not a disqualification.
  - `sw.test.ts`: a `{ type: 'notice', code: 'ABC234', title: 'T', body: 'B' }` push shows a notification titled `T` with body `B`, and tapping it opens `/g/ABC234`.
- [ ] **Step 2: Run them to see them fail.** Run `cd app && npx vitest run api/_lib/actions.test.ts api/_lib/store.test.ts src/game/sw.test.ts -t "Luar Garisan|markOutside|notice"`. Expected: FAIL.
- [ ] **Step 3: Write `0013_luar_garisan.sql`.**
  - It adds `out_warned_at timestamptz` and `disqualified_at timestamptz` to `players` (`add column if not exists`).
  - It adds `mark_outside(p_player uuid, p_at timestamptz) returns text`. The function locks the player row (`for update`) and applies the rules in the interface above. Revoke it from `public, anon, authenticated` and grant it to `service_role`.
  - Add the two columns to `PLAYER_COLUMNS` in `supabaseStore.ts`. This means 0013 must run before the code goes live, the same as Plan D's 0011. HANDOFF says so in Task 3.
- [ ] **Step 4: Extend `checkWhere`** in `actions.ts`.
  - Keep the existing guard (hiding or chasing only; not jailed; runner or chaser only), and also skip when `game.paused_at` is set or `me.disqualified_at` is set.
  - **When `outsideBy > OUTSIDE_MARGIN_M`:** call `markOutside`.
    - On `warned`, add the `out-warned` event and push the side's warning.
    - On `disqualified`, add the `luar-garisan` event and push the side's final copy.
  - **When `outsideBy <= OUTSIDE_MARGIN_M` and `me.out_warned_at`:** call `clearOutWarning`.
  - The existing `outside` flag and alert logic is unchanged.
  - Pushes go through the existing `pushTo(ctx, [me], …)`.
- [ ] **Step 5: Add the `notice` branch to `sw.js`** before the final fall-through. It shows `data.title` with body `data.body`, uses tag `kejar-notice` and `requireInteraction: true`, and sets `data: { url: '/g/' + data.code }`. Keep the file's CRLF line endings, and don't use `sed -i`.
- [ ] **Step 6: Run the tests, typecheck and full suite.** Run the Step 2 command, then `npm run typecheck` and `npx vitest run`. Expected: all pass.
- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/0013_luar_garisan.sql app/shared/types.ts app/api/_lib/store.ts app/api/_lib/store.test.ts app/api/_lib/supabaseStore.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/public/sw.js app/src/game/sw.test.ts
git commit -m "feat: Luar Garisan, a warning then disqualification for leaving the play area"
```

---

### Task 2: What it costs: ending the game, results, catches, power-ups

**Files:**
- Modify: `app/api/_lib/actions.ts` (the three "every runner jailed" checks at about lines 325, 652 and 1242; the free-runner filters at about 261 and 269; `catchAction`; `jailbreak`, `settle`, `claim`, `usePowerup`, `grabPick`)
- Modify: `app/shared/catch.ts` (`judgeCatch`), `app/shared/results.ts` (`computeResults`), `app/shared/views.ts` (counts, `freeNow`)
- Create: `app/shared/players.ts`
- Test: `app/api/_lib/actions.test.ts`, `app/shared/results.test.ts`, `app/shared/catch.test.ts`

**Interfaces:**
- **Consumes:** `Player.disqualified_at` and the `luar-garisan` event from Task 1.
- **Produces:** `isOut(p: Player): boolean`, meaning `p.jailed || !!p.disqualified_at`, in `app/shared/players.ts`. It's the one "no longer free" test every site uses, so they can't drift apart.

- [ ] **Step 1: Write the failing tests.**
  - `results.test.ts`:
    - `it('a disqualified runner is not a survivor, and their survival ends at Luar Garisan')`. Use a `luar-garisan` event at chaseStart + 10 min, and expect longest-survivor ms ≤ 10 min for them.
    - `it('a disqualified player wins no award')`. A disqualified chaser with the most catches before disqualification is not `mostCatches`. A disqualified runner is never `longestSurvivor`.
  - `actions.test.ts`:
    - `it('the game ends when the last free runner is disqualified')`. Expect an `ended` event, with chasers as the winner (Review Focus 4).
    - `it('a disqualified chaser\'s catch is refused')`. The reason is `'disqualified'`, the runner stays free, and no `caught` event is written.
    - `it('a disqualified runner cannot be caught')`. The reason is `'already-out'`, and no `caught` event is written (Review Focus 5).
    - `it('a disqualified runner gets no check-in pushes and is never auto-jailed')`.
    - `it('a disqualified player cannot claim or use power-ups, jailbreak or Settle')`. Each gives `{ ok: false, reason: 'disqualified' }`.
    - `it('jailbreak and Settle never free or count a disqualified player')`. This holds as long as they only look at `jailed` runners; pin it.
  - `catch.test.ts`: `judgeCatch` gives `disqualified` for a disqualified chaser and `already-out` for a disqualified runner.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run shared/results.test.ts shared/catch.test.ts api/_lib/actions.test.ts -t "disqualified|Luar Garisan"`. Expected: FAIL.
- [ ] **Step 3: Implement the changes.**
  - **`isOut`:** add `players.ts` and use `isOut` at the three end-of-game checks and both free-runner filters in `actions.ts`, and in `computeResults`'s survivors and `views.ts`'s free counts.
  - **`computeResults`:**
    - add `luar-garisan` events to the list that ends survival;
    - leave disqualified players out of every award, with the same `inGame` style as removed players.
    - This plan's call, from spec §3 "can't win anything time- or catch-based": earlier catches don't count towards awards either.
  - **`judgeCatch`:** check a disqualified chaser after the role check (reason `disqualified`), and a disqualified runner next to the `already-caught` check (reason `already-out`).
  - **Actions:** `claim`, `usePowerup`, `grabPick`, `jailbreak` and `settle` refuse a disqualified caller with `{ ok: false, reason: 'disqualified' }` right after `requirePlayer`.
- [ ] **Step 4: Run the tests, typecheck and full suite.** Run the Step 2 command, `npm run typecheck` and `npx vitest run`. Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add app/shared/players.ts app/shared/results.ts app/shared/results.test.ts app/shared/catch.ts app/shared/catch.test.ts app/shared/views.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: a Luar Garisan player can't win, catch, be caught or use power-ups"
```

---

### Task 3: The screens

**Files:**
- Modify: `app/shared/views.ts` (runner spectator view; marshal roster; alerts)
- Modify: `app/shared/alerts.ts` (a `luar-garisan` alert for marshals)
- Modify: `app/src/screens/GameScreen.tsx` (routing)
- Create: `app/src/screens/LuarGarisan.tsx`
- Modify: `app/src/screens/ChaserChase.tsx` (banner and catch refusal copy)
- Modify: `app/src/game/MarshalTools.tsx` (roster pill)
- Modify: `docs/HANDOFF.md`
- Test: `app/shared/views.test.ts`, `app/src/screens/LuarGarisan.test.tsx`, `app/src/screens/ChaserChase.test.tsx`, `app/src/game/MarshalTools.test.tsx`, `app/src/screens/GameScreen.test.tsx`

**Interfaces:**
- **Consumes:** Task 1's `Player.disqualified_at` and `luar-garisan` event, and Task 2's `isOut`.
- **Produces:**
  - `RosterEntry` gains `disqualified_at?: string | null`.
  - `Alert['kind']` gains `'luar-garisan'`, with text `${who} is Luar Garisan (left the play area twice)`.

- [ ] **Step 1: Write the failing tests.**
  - `views.test.ts`:
    - A disqualified runner gets the same spectator dots a jailed runner gets: everyone, delayed by the spectator delay.
    - They get no check-in banner, `settle: null` and `jailReason: null`.
    - The marshal roster carries `disqualified_at`.
    - Marshals get a `luar-garisan` alert.
  - `GameScreen.test.tsx`: a runner view with `me.disqualified_at` set renders `LuarGarisan`, not `Jail` or `RunnerChase`.
  - `LuarGarisan.test.tsx`:
    - It shows the heading `Luar Garisan` and the line `Alamak, you left the play area. No winning this round, but you can still play along.`
    - It shows the spectator map.
    - It never shows any of `Penjara`, the ticket, the walk guide, Settle or a scan button (spec §9).
  - `ChaserChase.test.tsx`:
    - A disqualified chaser sees a banner `Luar Garisan: your catches don't count this round, boss.`, using the same component and pattern as the location-off warning.
    - A catch refused with `disqualified` shows `You're Luar Garisan lah, so that catch doesn't count.`
    - A catch refused with `already-out` shows `Aiyo, that runner is already out of this round.`
  - `MarshalTools.test.tsx`: a roster entry with `disqualified_at` shows a `LUAR GARISAN` pill (plain lime outline, not the Penjara pill), with `left the play area`.
- [ ] **Step 2: Run them to see them fail.** Run `npx vitest run shared/views.test.ts src/screens src/game/MarshalTools.test.tsx -t "Luar Garisan|disqualified"`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - **`views.ts`:** wherever it treats `me.jailed` as "spectator", use `isOut(me)`, but keep every Penjara-specific field (`jailReason`, `jailCheckins`, `settle`, `caughtBy`) tied to `jailed` only. Add `disqualified_at` to `RosterEntry` and the `luar-garisan` alert.
  - **`LuarGarisan.tsx`:** reuse the map and layout pieces `Jail.tsx` uses, without its Penjara parts.
  - **`GameScreen`:** route a runner with `me.disqualified_at` to `LuarGarisan` before the Jail check.
  - **`MarshalTools`:** the pill goes in the same cell as `JailStatus`.
  - **Copy:** add the two catch refusal lines wherever catch refusals are mapped to copy today.
  - **Map:** a disqualified player's own dot and others' view of it stay as they are today. This is spec §10's builder call: no change, and noted in the report.
- [ ] **Step 4: Update the HANDOFF entry** in the existing style: what was built, the copy, and **"run `supabase/migrations/0013_luar_garisan.sql` in Supabase before merging"**. The player select reads its new columns, so every game fails until it runs. It's additive, so it's safe to run ahead of the merge.
- [ ] **Step 5: Run the full suite, typecheck and build.** Run `npx vitest run`, `npm run typecheck` and `npm run build`. Expected: all pass.
- [ ] **Step 6: Commit.**

```bash
git add app/shared/views.ts app/shared/views.test.ts app/shared/alerts.ts app/src/screens/GameScreen.tsx app/src/screens/GameScreen.test.tsx app/src/screens/LuarGarisan.tsx app/src/screens/LuarGarisan.test.tsx app/src/screens/ChaserChase.tsx app/src/screens/ChaserChase.test.tsx app/src/game/MarshalTools.tsx app/src/game/MarshalTools.test.tsx docs/HANDOFF.md
git commit -m "feat: Luar Garisan screens for runners, chasers and marshals"
```
