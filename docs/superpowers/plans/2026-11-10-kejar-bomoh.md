# Bomoh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Bomoh, the chaser-side legendary power-up: a hidden purple card that, the instant a chaser finds it, reveals every free runner's exact position to the whole chaser team for the next 2 ping reveals.

**Architecture:** Mirror Dato Seri's existing hidden-stash grant (own `games.bomoh_stash` column, own `claim_bomoh()` DB function, own QR prefix) exactly, since that schema layer is already built with a parallel-not-merged convention (`runner_sets`/`chaser_sets` etc.). But Bomoh's *activation* is simpler than Dato's: it fires the instant the stash is claimed (no hand card, no `powerups` row, no Settle-style second action — see spec §2e), and its *reveal effect* reuses Focus/Pak Guard's existing exact-dot mechanism in `views.ts` with the per-target radius check dropped. The one genuinely large discovery from grounding research: Dato's organiser card-lifecycle management in `app/api/_lib/actions.ts` (lobby hold, 24h expiry, reassign-on-retire, miss-limit lockout) is ~150 lines of logic, all hardcoded to `dato`. Duplicating that verbatim for Bomoh would be a real DRY violation (two ~150-line blocks that must be kept in sync forever), so this plan generalizes that layer to take `legendary: 'dato' | 'bomoh'` as a parameter instead — the admin card tooling (`YourKit.tsx`, `requireSecretCard`, `secret_cards` table) was already built generic in anticipation of this.

**Tech Stack:** TypeScript (React frontend in `app/src`, Vercel API functions in `app/api`), Supabase/Postgres with `plpgsql` functions, Vitest for tests.

**Spec:** [docs/superpowers/specs/2026-10-30-kejar-chaser-legendary-design.md](../specs/2026-10-30-kejar-chaser-legendary-design.md) — read §2, §2a–§2e before starting. §2d resolves the reveal mechanism; §2e (added alongside this plan) resolves and corrects the activation model to instant-on-claim.

## Global Constraints

- QR prefix: `KEJAR:BOMOH:` (spec §2e, mirroring `datoQr`'s `KEJAR:DATO:`).
- Reach check: reuse the existing module-private `withinClaimReach` in `app/shared/powerups.ts` (`CLAIM_RADIUS_M = 30`, `CLAIM_FRESH_MS = 30_000`, `MAX_ACCURACY_M = 20`) — identical to Dato Seri's claim reach, no new constant.
- Reveal duration: **the next 2 ping reveals after `claimedAt`**, not a timer (spec §2d) — computed as a count of revealed pings with `reveal_at > claimedAt`, never a `setTimeout`/deadline.
- Reveal scope: **every free runner, team-wide** — no per-target distance filter (unlike Focus's `FOCUS_M`), and shared automatically across the whole chaser team because it's sourced from `games.bomoh_stash`, not a per-player `powerups` row (spec §2d).
- Activation: **instant on claim** (spec §2e) — `claimBomoh` never inserts a `powerups` row, never touches `PowerUpKind`, `slotBusy`, `PowerUpHand.tsx`, `PowerCard.tsx`, or `powerInfo.ts`.
- `catch.ts`: **no changes** — already confirmed safe for stale post-reveal catches (spec §2d).
- `secret_cards` (migration `0014_setup.sql`): **no schema changes** — already generic over `legendary in ('dato', 'bomoh')`.
- Colour: purple, using the existing `--bomoh-1/2/3`/`--bomoh-ink` CSS tokens already referenced in `YourKit.tsx`/`HostNew.tsx` — never Dato's yellow tokens or the lime `VOLT` used for Focus's ring.
- Out of scope for this plan (per spec §2a's sequencing and §3's open items): the optional staffed "ritual" grant mode, the exact fuzzy-hint-zone radius tuning, and any card-art/motion-design pass beyond what already exists in the mockups.

## Review Focus

- **Two chasers scan the Bomoh QR at the same instant.** A reasonable person expects exactly one claim to win, same as Dato Seri's stash today. Pinned in Task 1 with a concurrent-claim test against `claim_bomoh()`.
- **Bomoh is claimed, then the organiser retires or reprints its physical card before the game ends.** A reasonable person expects the lobby-hold/reassign/reprint logic to touch `bomoh_stash` and the Bomoh `kit.placed` key, not silently default to Dato's fields because of a leftover hardcoded reference from the generalization. Pinned in Task 4.
- **Bomoh's 2-reveal window runs past the end of the game, or is claimed on the very last reveal.** A reasonable person expects it to just reveal fewer than 2 times, not crash, hang, or reveal into a reveal that never comes. Pinned in Task 6.
- **The same runner is covered by both an active Focus and an active Bomoh at once.** A reasonable person expects one consistent dot, not a flicker or a contradiction between `exact` and `revealedBy`. Pinned in Task 6 (Bomoh's ring wins the tie-break, since it is the rarer, team-wide effect).
- **Both legendaries are live and unclaimed in the same Full-mode game.** A reasonable person expects two independent hint zones on the map, each honestly centred on its own hidden stash, never merged into one zone or one overwriting the other. Pinned in Task 6 and Task 7.

---

### Task 1: `bomoh_stash` column, `claim_bomoh()`, and the store layer

**Files:**
- Create: `supabase/migrations/0015_bomoh.sql`
- Modify: `app/shared/types.ts` (add `BomohStash` interface mirroring `DatoStash` at lines 102-119; add `bomoh_stash?: BomohStash | null` to `Game` alongside `dato_stash` at line 94)
- Modify: `app/shared/store.ts` (find the in-memory `claimDato` implementation around lines 500-519; add a sibling `claimBomoh`)
- Modify: `app/shared/supabaseStore.ts` (find the `claim_dato` RPC wrapper around lines 253-258; add a sibling `claimBomoh` calling a `claim_bomoh` RPC)
- Test: `app/shared/store.test.ts` (or wherever the existing `claimDato` store test lives — grep for it first)

**Interfaces:**
- Produces: `BomohStash` (same shape as `DatoStash`: `code?: string`, `card?: { id, letter }`, `lat`, `lng`, `claimedBy`, `claimedAt`), `Game.bomoh_stash`, `store.claimBomoh(gameId: string, playerId: string, at: Date): Promise<boolean>` (returns whether the claim succeeded — unlike `claimDato`, it returns a boolean, not a `PowerUp[]`, since no `powerups` row is ever inserted).

- [ ] **Step 1: Write the failing store-level test**

Grep `app/shared` for the existing `claimDato`/`claim_dato` test(s) (likely in `store.test.ts` or `actions.test.ts`) to find the exact test pattern for a race (two concurrent claims resolve to exactly one winner) and a few rejections (`already claimed`, `not dropped yet`/`lat` is null, `game not found`). Write the same three cases for `claimBomoh`, asserting it returns `true` exactly once across two concurrent calls and `false` for the rejection cases, and that `game.bomoh_stash.claimedBy`/`claimedAt` end up set to the winner's id/time.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- store.test` (adjust to the actual test file found in Step 1)
Expected: FAIL — `claimBomoh` does not exist yet.

- [ ] **Step 3: Write `supabase/migrations/0015_bomoh.sql`**

```sql
-- Bomoh's hidden stash (jail design §2e): same shape as Dato Seri's, { code, lat, lng, claimedBy, claimedAt }.
alter table games add column if not exists bomoh_stash jsonb;

-- Mirrors claim_dato() exactly (same locking and re-check), except it never inserts into powerups: Bomoh
-- activates the instant it's claimed (spec §2e), it doesn't sit in a hand. Returns true iff this call won the claim.
create or replace function claim_bomoh(p_game uuid, p_player uuid, p_at timestamptz) returns boolean
language plpgsql
as $$
declare
  g games;
begin
  select * into g from games where id = p_game for update;
  if not found or g.bomoh_stash is null or jsonb_typeof(g.bomoh_stash) <> 'object'
     or coalesce(jsonb_typeof(g.bomoh_stash -> 'lat'), 'missing') <> 'number'
     or (g.bomoh_stash ->> 'claimedBy') is not null then
    return false;
  end if;
  update games
     set bomoh_stash = g.bomoh_stash || jsonb_build_object(
           'claimedBy', p_player::text,
           'claimedAt', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_game;
  return true;
end;
$$;

revoke execute on function claim_bomoh(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_bomoh(uuid, uuid, timestamptz) to service_role;
```

- [ ] **Step 4: Add `BomohStash` and `Game.bomoh_stash` to `app/shared/types.ts`**

Copy the `DatoStash` interface (lines 102-119) verbatim as `BomohStash`. Add `bomoh_stash?: BomohStash | null` next to `dato_stash?: DatoStash | null` (line 94).

- [ ] **Step 5: Implement `claimBomoh` in `app/shared/store.ts` and `app/shared/supabaseStore.ts`**

Mirror the existing `claimDato` implementation in each file exactly, minus the `powerups` insert, returning a boolean instead of the inserted row(s).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- store.test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0015_bomoh.sql app/shared/types.ts app/shared/store.ts app/shared/supabaseStore.ts app/shared/store.test.ts
git commit -m "feat: add bomoh_stash column and claim_bomoh for Bomoh's grant"
```

---

### Task 2: QR helpers for Bomoh

**Files:**
- Modify: `app/shared/ids.ts` (add next to `datoQr`/`isDatoQr`/`datoCodeFromQr`)
- Test: `app/shared/ids.test.ts`

**Interfaces:**
- Produces: `bomohQr(code: string): string` (returns `` `KEJAR:BOMOH:${code}` ``), `isBomohQr(text: string): boolean` (regex `/^KEJAR:BOMOH(:|$)/`), `bomohCodeFromQr(text: string): string | null` (regex `/^KEJAR:BOMOH:([A-Za-z0-9_-]{1,64})$/`).

- [ ] **Step 1: Write the failing tests**

Mirror the existing `datoQr`/`isDatoQr`/`datoCodeFromQr` test cases in `ids.test.ts` (round-trip, rejects a Dato QR as not-Bomoh and vice versa, rejects malformed codes) for the three new functions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ids.test`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement `bomohQr`, `isBomohQr`, `bomohCodeFromQr` in `app/shared/ids.ts`**

Copy `datoQr`/`isDatoQr`/`datoCodeFromQr`'s bodies verbatim with `DATO` → `BOMOH`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ids.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/ids.ts app/shared/ids.test.ts
git commit -m "feat: add bomohQr/isBomohQr/bomohCodeFromQr"
```

---

### Task 3: `judgeBomohClaim` pure logic

**Files:**
- Modify: `app/shared/powerups.ts` (add next to `judgeDatoClaim`, lines 62-87; reuses the existing module-private `withinClaimReach`, line 57)
- Test: `app/shared/powerups.test.ts`

**Interfaces:**
- Consumes: `BomohStash` and `store.claimBomoh` from Task 1, `placedStash` (already exported from `types.ts`).
- Produces:
```ts
export type BomohClaimJudgement =
  | { ok: true }
  | { ok: false; reason: 'not-chasing' | 'cannot-claim' | 'no-stash' | 'too-far' }

export function judgeBomohClaim(i: {
  phase: Phase; me: Player; stash: BomohStash | null | undefined
  myPos: Position | null; now: number
}): BomohClaimJudgement
```
Note there is no `powerUps`/`pings` input and no `'hand-full'` reason — Bomoh never occupies a hand slot (Global Constraints), so `slotBusy` is never called here, unlike `judgeDatoClaim`.

- [ ] **Step 1: Write the failing tests**

Mirror `judgeDatoClaim`'s existing test cases in `powerups.test.ts` for: wrong phase → `not-chasing`; `me.role !== 'chaser'` (a runner or marshal attempting the claim) → `cannot-claim`; no stash dropped yet, or already claimed by someone → `no-stash`; too far from the dropped spot → `too-far`; valid chaser in reach of an unclaimed, dropped stash → `{ ok: true }`. (Dato's claim additionally checks `i.me.jailed`; chasers are never jailed, so that check is simply omitted, not ported.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- powerups.test`
Expected: FAIL — `judgeBomohClaim` not defined.

- [ ] **Step 3: Implement `judgeBomohClaim` in `app/shared/powerups.ts`**

```ts
export function judgeBomohClaim(i: {
  phase: Phase; me: Player; stash: BomohStash | null | undefined
  myPos: Position | null; now: number
}): BomohClaimJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.me.role !== 'chaser') return { ok: false, reason: 'cannot-claim' }
  const stash = placedStash(i.stash)
  if (!stash || stash.claimedBy !== null) return { ok: false, reason: 'no-stash' }
  if (!withinClaimReach(i.myPos, stash, i.now)) return { ok: false, reason: 'too-far' }
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- powerups.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/powerups.ts app/shared/powerups.test.ts
git commit -m "feat: add judgeBomohClaim"
```

---

### Task 4: Generalize the organiser card-lifecycle layer over `legendary`

**Files:**
- Modify: `app/api/_lib/actions.ts`, lines 155-393: `secretLettersFor`, `expiredLobby`, `holdsCard`, `isDropped`, `cardHolders`, `freeDatoCard`, `stashOn`, `releaseDatoCard`, `wantsDatoCard`, `assignFreeCard`, `reassignDatoCard`, `recheckExpiredLobby`, `settleLobbyCard`, `needsRecheck`, `retireSecretCard`, `reprintSecretCard`, `settingsFrom`
- Test: `app/api/_lib/actions.test.ts` (extend the existing Dato admin-flow tests: retire, reprint, expired-lobby recheck, reassign-on-retire)

**Interfaces:**
- Consumes: `Game.bomoh_stash` (Task 1).
- Produces: every function below now takes (or closes over) a `legendary: 'dato' | 'bomoh'` parameter and reads/writes `game.dato_stash` or `game.bomoh_stash` accordingly, instead of being hardcoded to `dato_stash`. Keep each function's existing name where it's already generic-sounding (`cardHolders`, `expiredLobby`, `isDropped`, `holdsCard`, `needsRecheck`, `settleLobbyCard`); rename the Dato-specific-named ones to drop "Dato" (`freeDatoCard` → `freeCard(legendary)`, `releaseDatoCard` → `releaseCard`, `wantsDatoCard` → `wantsCard`, `reassignDatoCard` → `reassignCard`) so call sites read correctly for either legendary.

This is a **behavior-preserving refactor for Dato**, proven by Dato's own existing tests continuing to pass unmodified — do not change Dato's observable behavior anywhere in this task.

- [ ] **Step 1: Read the full current implementation**

Read `app/api/_lib/actions.ts` lines 155-393 in full (if not already open) to see every call site of each function being renamed/generalized, including ones outside this line range (grep the whole file for each function name before renaming it).

- [ ] **Step 2: Write the failing tests for Bomoh's admin flows**

Add Bomoh-flavoured versions of the existing Dato admin tests in `actions.test.ts`: retiring a Bomoh card that a lobby holds gives that lobby a fresh free Bomoh card (or turns Bomoh off with the existing `NO_FREE_CARD_NOTICE`-style notice — add a `NO_FREE_BOMOH_CARD_NOTICE` constant mirroring `NO_FREE_CARD_NOTICE`'s wording but for "Reprint a purple card to use Bomoh."); reprinting a dropped Bomoh card clears that lobby's drop (`lat`/`lng`/`claimedBy`/`claimedAt` back to null, mirroring the Dato reprint behavior at actions.ts:341-351) and clears `kit.placed.bomoh`; an expired lobby holding an unused Bomoh card recovers it for reassignment the same way Dato's does.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- actions.test`
Expected: FAIL — the admin actions don't yet do anything for a `'bomoh'` card (they're hardcoded to `dato_stash`).

- [ ] **Step 4: Generalize each function to take `legendary: 'dato' | 'bomoh'`**

Thread a `legendary` parameter through the call chain from `retireSecretCard`/`reprintSecretCard` (which already receive `card.legendary` via `requireSecretCard`, per `actions.ts:298`) down into every function listed above. Each function picks `dato_stash`/`bomoh_stash` and `kit.placed.dato`/`kit.placed.bomoh` based on that parameter instead of a hardcoded field name. `secretLettersFor`'s comment ("Only Dato Seri's yellow card is assigned yet") becomes stale — update it to reflect both cards being assigned.

- [ ] **Step 5: Fix `settingsFrom`'s hardcoded `bomoh: 'off'`**

At `actions.ts:386-390`, the validation loop already checks both `legendaries.dato` and `legendaries.bomoh` are `'off'`/`'stash'`. Change the assignment on line 390 from `s.legendaries = { dato: legendaries.dato, bomoh: 'off' }` to `s.legendaries = legendaries`, so a lobby can actually turn Bomoh on.

- [ ] **Step 6: Run tests to verify they pass, including Dato's pre-existing ones**

Run: `npm test -- actions.test`
Expected: PASS — both the new Bomoh admin tests and every pre-existing Dato admin test (retire/reprint/expired-lobby), unmodified, still pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "refactor: generalize the card-lifecycle layer over dato/bomoh"
```

---

### Task 5: `claimBomoh` action, claim dispatch, and `dropBomohSeri`

**Files:**
- Modify: `app/api/_lib/actions.ts` (add `claimBomoh` mirroring `claimDato`, lines 1195-1226; wire into the `claim` action's dispatch, around line 1156; add `dropBomohSeri` mirroring whatever `dropDatoSeri` does — grep the file for `dropDatoSeri` first, it is not yet read in this plan's research)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `isBomohQr`/`bomohCodeFromQr` (Task 2), `judgeBomohClaim` (Task 3), `store.claimBomoh` (Task 1), the generalized `freeCard`/`isDropped`/`stashOn` etc. (Task 4).
- Produces: `claimBomoh(ctx, game, me, qr): Promise<ActionResult>` returning `{ ok: true, kind: 'bomoh' }` on success, the same miss-tracked rejection shapes as `claimDato` on failure; `dropBomohSeri` action (organiser/marshal-only, sets `bomoh_stash.lat`/`lng` from the caller's current position, mirroring `dropDatoSeri`'s own auth and shape).

- [ ] **Step 1: Write the failing tests**

Mirror `claimDato`'s existing test suite in `actions.test.ts` for `claimBomoh`: a chaser in reach of a dropped, unclaimed stash with the right code succeeds and returns `{ ok: true, kind: 'bomoh' }`, retires the physical card, and adds the shared anonymized `legendary` feed event; a wrong/stale/foreign code is a silent miss; `STASH_MISS_LIMIT` consecutive misses locks out further attempts; two concurrent claims resolve to exactly one winner (via `store.claimBomoh`'s race-safety from Task 1); a runner (not chaser) attempting the claim is rejected via `judgeBomohClaim`'s `cannot-claim`, not counted as a miss. Also add a `dropBomohSeri` test mirroring `dropDatoSeri`'s (organiser/marshal can drop, player cannot, the dropped lat/lng appear in `view.bomohStash` once Task 6 lands — stub assertion against `game.bomoh_stash` directly until then).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- actions.test`
Expected: FAIL — `claimBomoh`/`dropBomohSeri` not defined, `isBomohQr` not dispatched.

- [ ] **Step 3: Implement `claimBomoh` and wire the dispatch**

Mirror `claimDato` (actions.ts:1195-1226) step for step — miss-limit check, code-hash compare against `game.bomoh_stash?.code`, `judgeBomohClaim`, `store.claimBomoh`, retire the physical card, add the anonymized `legendary` feed event, return `{ ok: true, kind: 'bomoh' }` — with one deliberate omission: **no `powerups` row is read back or returned**, since `store.claimBomoh` only returns a boolean (Task 1). In the `claim` action (around line 1156), add `if (isBomohQr(str(body.qr))) return claimBomoh(ctx, fresh as GameRow, me, str(body.qr))` alongside the existing `isDatoQr` branch.

- [ ] **Step 4: Implement `dropBomohSeri`**

Mirror whichever function implements `dropDatoSeri` (grep for it in `actions.ts`), substituting `bomoh_stash` for `dato_stash` and the generalized Task 4 helpers.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- actions.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: add claimBomoh and dropBomohSeri actions"
```

---

### Task 6: `views.ts` — Bomoh's reveal effect and hint zone

**Files:**
- Modify: `app/shared/views.ts`:
  - `View` interface: add `bomohStash?: PlacedStash | null` and `bomohCard?: { letter: string; code: string } | null` (mirror lines 163, 169), add `bomohZone: { lat: number; lng: number; radiusM: number } | null` (mirror line 152)
  - `chaserDots` (lines 338-401): extend the reveal computation
  - `legendaryZoneFor` (lines 546-555): add a sibling `bomohZoneFor`
  - `datoCardOf` (lines 859-862): add a sibling `bomohCardOf`
  - The organiser-only field spread (line 851) and the removed-player reset spread (line 726)
  - The `viewFor`/`fullView` wiring that sets `legendaryZone: legendaryZoneFor(i, phase)` (line 847)
- Modify: `app/shared/types.ts`: widen `MapDot.revealedBy` from `'focus' | null` to `'focus' | 'bomoh' | null`
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `Game.bomoh_stash` (Task 1).
- Produces: `View.bomohStash`, `View.bomohCard`, `View.bomohZone`; `MapDot.revealedBy` now includes `'bomoh'`.

- [ ] **Step 1: Write the failing tests**

In `views.test.ts`, add cases for `chaserDots` (via whatever top-level `viewFor`/`chaserDots` test harness already exists for Focus's reveal):
- A chaser's view, with `game.bomoh_stash.claimedBy` set and `claimedAt` before the most recent ping reveal: every free runner's dot has `exact: true, revealedBy: 'bomoh'`, regardless of distance from any chaser.
- The *third* ping reveal after `claimedAt`: dots revert to the normal fuzzy/decoy treatment (no `revealedBy`).
- A runner covered by both an active Focus and an active Bomoh at the same reveal: `revealedBy` is `'bomoh'`, not `'focus'`.
- `game.bomoh_stash` with no `claimedBy` (not yet found): no effect on any dot.
- A reveal exactly at the second-ping boundary (the last reveal the card is active for) still shows `revealedBy: 'bomoh'`.

Also add `legendaryZoneFor`/`bomohZoneFor` cases mirroring the existing Dato zone tests: an unclaimed, dropped `bomoh_stash` produces a `bomohZone` distinct in location from an unclaimed `dato_stash`'s `legendaryZone` in the same game (different seed suffix); a claimed or undropped stash produces `null`; Core mode produces `null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- views.test`
Expected: FAIL — `bomohZone`/Bomoh reveal not implemented.

- [ ] **Step 3: Implement the reveal computation in `chaserDots`**

Add, alongside the existing `focusers`/`focused` computation (lines 360, 383):

```ts
const bomoh = placedStash(i.game.bomoh_stash)
const bomohClaimedAt = bomoh?.claimedBy ? Date.parse(bomoh.claimedAt!) : null
const bomohRevealNo = bomohClaimedAt === null ? Infinity : revealed.filter((r) => Date.parse(r.reveal_at) > bomohClaimedAt).length
const bomohActive = bomohClaimedAt !== null && Date.parse(last.reveal_at) > bomohClaimedAt && bomohRevealNo <= 2
```

Then, in the per-runner loop, treat `bomohActive` as applying to every runner with no distance check, and let it take priority over `focused` for `revealedBy` when both apply:

```ts
const focused = focusers.some((f) => distanceM(f, at) <= FOCUS_M)
const revealedByBomoh = bomohActive ? 'bomoh' : null
```

Thread `revealedByBomoh ?? (focused ? 'focus' : null)` into each of the three existing dot branches (decoyed+revealed, focused, plain) in place of today's hardcoded `'focus'`, and treat `revealedByBomoh !== null || focused` as the existing `focused` boolean was used (i.e. the condition for "exact" dots).

- [ ] **Step 4: Implement `bomohZoneFor` and `bomohCardOf`**

Copy `legendaryZoneFor` (lines 546-555) as `bomohZoneFor`, reading `i.game.bomoh_stash` and seeding with `` `${secretSeed(i.game)}:bomoh-legendary-zone` `` (a distinct suffix from Dato's `legendary-zone`, so the two zones never land at the same offset). Copy `datoCardOf` (lines 859-862) as `bomohCardOf`, reading `i.game.bomoh_stash`.

- [ ] **Step 5: Wire the new fields**

Add `bomohZone: bomohZoneFor(i, phase)` next to `legendaryZone: legendaryZoneFor(i, phase)` (line 847). Add `bomohStash: placedStash(i.game.bomoh_stash), bomohCard: bomohCardOf(i)` into the organiser-only spread (line 851). Add `bomohStash: undefined, bomohCard: undefined, bomohZone: null` into the removed-player reset spread (line 726).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- views.test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts app/shared/types.ts
git commit -m "feat: compute Bomoh's team-wide reveal and hint zone in views.ts"
```

---

### Task 7: Map rendering — purple reveal ring and Bomoh's hint zone

**Files:**
- Modify: `app/src/game/Map.tsx`:
  - Find and mirror `legendaryYellow()` as `legendaryPurple()`, reading `--bomoh-1/2/3` instead of `--legendary-1/2/3`
  - Add a `bomoh-legendary`/`bomoh-legendary-fill`/`bomoh-legendary-line` source+layers (mirror lines 270-272), and a `bomoh-legendary-marker` HTML marker (mirror lines 470-479)
  - Add a `bomoh-reveal-ring` layer (mirror lines 380-391) filtered on `['==', ['get', 'revealedBy'], 'bomoh']`, coloured with `legendaryPurple()` instead of `VOLT`
  - `GameMap`'s props: add `bomohZone: LegendaryZone | null` alongside the existing `legendaryZone` prop
- Modify: `app/src/game/ChaseLayout.tsx:88`: pass `bomohZone={view.bomohZone}` alongside `legendaryZone={view.legendaryZone}`
- Test: `app/src/game/Map.test.tsx`

**Interfaces:**
- Consumes: `View.bomohZone` (Task 6), `MapDot.revealedBy` including `'bomoh'` (Task 6).

- [ ] **Step 1: Write the failing tests**

Mirror the existing `legendaryZone`/`reveal-ring` tests in `Map.test.tsx`: rendering with a `bomohZone` prop adds the `bomoh-legendary` source/layers at the given coordinates, distinct from a simultaneously-rendered `legendaryZone`; a dot with `revealedBy: 'bomoh'` in the `points`/`dots` data appears in the `bomoh-reveal-ring` layer's filtered data, and a `revealedBy: 'focus'` dot does not.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Map.test`
Expected: FAIL

- [ ] **Step 3: Implement the purple color helper, sources, layers, and marker**

Mirror the Dato zone/marker code exactly, substituting the purple palette and the `bomoh` prefix throughout. Keep the same `?` marker glyph (the colour and position already distinguish it from Dato's zone; no need for a second glyph).

- [ ] **Step 4: Add the `bomoh-reveal-ring` layer and the `bomohZone` prop + effect**

Mirror `reveal-ring`'s layer definition and the `zoneKey`/`useEffect` pair that keeps the zone source and marker in sync with the prop (lines 463-479).

- [ ] **Step 5: Wire `bomohZone` through `ChaseLayout.tsx`**

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- Map.test`
Expected: PASS

- [ ] **Step 7: Manually verify in the dev server**

Start the `kejar-dev` preview, join a Full-mode game as organiser with a `bomoh_stash` seeded via the test harness (or temporarily via direct DB edit), confirm the purple hint zone and marker render distinctly from a simultaneous Dato zone, and that a manually-flagged `revealedBy: 'bomoh'` dot shows the purple ring. Compare against `docs/superpowers/mockups/2026-10-31-chaser-legendary/3-bomoh-reveal-effect.html` for the intended look.

- [ ] **Step 8: Commit**

```bash
git add app/src/game/Map.tsx app/src/game/Map.test.tsx app/src/game/ChaseLayout.tsx
git commit -m "feat: render Bomoh's purple reveal ring and hint zone on the map"
```

---

### Task 8: Organiser stash-drop UI and scan routing

**Files:**
- Modify: `app/src/game/SetupMap.tsx`: generalize `HiddenCard` to take a `legendary: 'dato' | 'bomoh'` prop (plus whatever label/colour/copy differs) instead of hardcoding `view.datoStash`/`view.datoCard`/`dropDatoSeri`/the yellow-card copy; render one instance per enabled legendary at `HiddenCard`'s call site (grep for it — likely `Lobby.tsx` or similar)
- Modify: `app/src/screens/WalkPark.tsx`: add a Bomoh branch alongside lines 103-106 and 212-216 (`letter`/`hideLine` for Bomoh's card, a "Drop Bomoh here" button calling `dropBomohSeri`)
- Modify: `app/src/game/scan.ts:12`: add `isBomohQr(text)` to the claim-routing condition
- Test: `app/src/game/SetupMap.test.tsx`, `app/src/screens/WalkPark.test.tsx`, `app/src/game/scan.test.ts`

**Interfaces:**
- Consumes: `view.bomohStash`/`view.bomohCard` (Task 6), `dropBomohSeri` action (Task 5), `isBomohQr` (Task 2).

- [ ] **Step 1: Read `WalkPark.tsx` in full**

Read the whole file (not just the grepped lines) to see how it already sequences multiple cards/stations through its setup wizard, so Bomoh's drop step fits the same sequencing rather than being bolted on separately.

- [ ] **Step 2: Write the failing tests**

Mirror the existing Dato-flavoured tests in each of the three test files with a Bomoh fixture: `SetupMap.test.tsx` — `HiddenCard` renders for Bomoh when `view.bomohStash !== undefined`, shows the purple styling/copy, and calls `dropBomohSeri` on drop; `WalkPark.test.tsx` — the wizard shows a "Drop Bomoh here" step when Bomoh is enabled for this game, with the right card letter; `scan.test.ts` — `scanTarget` routes a Bomoh QR to `{ action: 'claim', body: { qr: text } }` for both roles, same as a Dato QR.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- SetupMap.test WalkPark.test scan.test`
Expected: FAIL

- [ ] **Step 4: Generalize `HiddenCard`**

Replace the hardcoded `datoStash`/`datoCard`/`'dropDatoSeri'`/copy references with parameters driven by the new `legendary` prop. Render `<HiddenCard legendary="dato" .../>` and, when Full mode has Bomoh enabled, `<HiddenCard legendary="bomoh" .../>` at the call site.

- [ ] **Step 5: Extend `WalkPark.tsx`**

Add the Bomoh branch found missing in Step 1/2, following the same pattern as the existing Dato step.

- [ ] **Step 6: Extend `scan.ts`**

`if (stationFromQr(text) !== null || isDatoQr(text) || isBomohQr(text)) return { action: 'claim', body: { qr: text } }`

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- SetupMap.test WalkPark.test scan.test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/src/game/SetupMap.tsx app/src/screens/WalkPark.tsx app/src/game/scan.ts app/src/game/SetupMap.test.tsx app/src/screens/WalkPark.test.tsx app/src/game/scan.test.ts
git commit -m "feat: organiser stash-drop UI and scan routing for Bomoh"
```

---

### Task 9: Turn the lobby toggle on

**Files:**
- Modify: `app/src/screens/HostNew.tsx`, lines 610-642 (the disabled Bomoh `<Legendary>` block)
- Test: `app/src/screens/HostNew.test.tsx` (or wherever the Dato toggle is tested)

**Interfaces:**
- Consumes: `settingsFrom`'s fix from Task 4 (Step 5) — this task only needs the client side now.

- [ ] **Step 1: Write the failing test**

Mirror whatever test exists for Dato's `<Legendary>` toggle: selecting "Hidden stash" for Bomoh updates `settings.legendaries.bomoh` to `'stash'` and the control is interactive (not disabled).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- HostNew.test`
Expected: FAIL — the Bomoh `Seg` is hardcoded to `value="off"` with `disabled: true` and a no-op `onChange`.

- [ ] **Step 3: Wire the toggle and fix the copy**

At lines 610-642: replace `value="off"` with `settings.legendaries.bomoh`, remove `disabled: true` from the `'stash'` option, replace `onChange={() => undefined}` with `onChange={(v) => set({ legendaries: { ...settings.legendaries, bomoh: v } })}`, and remove the `"NOT BUILT YET"` badge from `title`. Update the `say` copy from the stale "sees every free runner live for 1 minute, or until the end in the last 5 minutes" to match the resolved design (spec §2d): something like "sees every free runner's exact spot for its next two pings, team-wide" — keep it in the same plain-English-plus-flavour style as the line it replaces.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- HostNew.test`
Expected: PASS

- [ ] **Step 5: Manually verify in the dev server**

Start the `kejar-dev` preview, open Host → New Game → Full mode, confirm the Bomoh toggle is now a live, clickable control with the updated copy, and that creating a lobby with it set to "Hidden stash" actually persists (check the organiser's lobby screen shows the Bomoh `HiddenCard` tool from Task 8).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/HostNew.tsx app/src/screens/HostNew.test.tsx
git commit -m "feat: turn on the Bomoh lobby toggle"
```

---

### Task 10: End-to-end scenario test

**Files:**
- Modify: `app/api/_lib/actions.test.ts` (or a new `bomoh.e2e.test.ts` alongside it, whichever matches how this codebase already structures its multi-step scenario tests — grep for an existing Dato end-to-end scenario, e.g. "drop, claim, settle" for Dato Seri, and match its style)

**Interfaces:**
- Consumes: every task above.

- [ ] **Step 1: Write the failing end-to-end test**

One scenario, driven only through the public `Action` entry points (`dropBomohSeri`, `claim`, and repeated `view` calls as ping reveals advance), asserting throughout:
1. A Full-mode lobby with `legendaries.bomoh: 'stash'` has a `bomoh_stash` with a code and no lat/lng.
2. The organiser drops the card; a chaser's `view` shows a `bomohZone` hint, no exact reveal yet.
3. A chaser scans the Bomoh QR in reach: `claim` returns `{ ok: true, kind: 'bomoh' }`; the physical card is retired; the shared feed gets one anonymized `legendary` entry.
4. At the next ping reveal, every chaser's `view.dots` shows every free runner `exact: true, revealedBy: 'bomoh'`, including a chaser who took no part in the claim (team-wide sharing).
5. At the ping reveal after that (the second one since claim), the reveal is still active.
6. At the third ping reveal since claim, dots for those same runners are back to fuzzy/decoy with no `revealedBy`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- actions.test` (or the new file's path)
Expected: FAIL at whichever step the plan's earlier tasks left incomplete, if any; otherwise this is the first real exercise of the full chain together and may surface an integration gap between tasks.

- [ ] **Step 3: Fix any integration gap found**

If the scenario fails somewhere no earlier task's unit tests covered (e.g. an off-by-one in the reveal-count boundary, or a field missed in one of the view spreads), fix it in the relevant file from the task that owns it, and note the gap in the commit message.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- actions.test`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions anywhere else in the suite (especially Dato Seri's own existing tests, per Task 4's behavior-preservation requirement).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add end-to-end Bomoh scenario covering claim through reveal expiry"
```

---

## Self-Review Notes

**Spec coverage:** §2 (grant exists, stash default mode) — Tasks 1, 5, 9. §2a (stash mode only, ritual mode deferred) — Global Constraints' out-of-scope note. §2b (purple art) — Task 7 reuses existing `--bomoh-*` tokens; no new art asset work needed since `YourKit.tsx`/`HostNew.tsx` already reference the purple palette. §2c (kept secret, same as Dato) — Task 1/5 mirror Dato's secrecy exactly (organiser-only `bomohStash`/`bomohCard` fields, anonymized feed event). §2d (reveal mechanism, duration, team-sharing, no catch changes) — Task 6. §2e (instant activation, no hand card) — Global Constraints and Task 5. The large undocumented discovery (the admin lifecycle layer) is covered by Task 4, which wasn't anticipated by the spec but is necessary to actually ship §2's grant without duplicating ~150 lines.

**Type consistency:** `BomohStash` (Task 1) is consumed as-is by `judgeBomohClaim` (Task 3), `claimBomoh` (Task 5), and `views.ts` (Task 6) — same shape throughout. `MapDot.revealedBy`'s `'bomoh'` literal (Task 6) is consumed by `Map.tsx`'s `bomoh-reveal-ring` filter (Task 7) with matching spelling. `View.bomohZone`'s shape (`{ lat, lng, radiusM } | null`, Task 6) matches `GameMap`'s new `bomohZone` prop type (Task 7) exactly, mirroring `legendaryZone`.

**Proportion check:** this plan is long because the feature genuinely touches ten files across three layers (DB, server logic, client rendering) that Dato Seri also touches — it is not longer than the equivalent slice of Dato's own implementation would be. Code blocks are limited to the two places a signature or exact algorithm needed pinning (the `claim_bomoh()` SQL function, adapted directly from `claim_dato()`, and the reveal-count/tie-break logic in `chaserDots`, which is the one piece of genuinely new logic in the whole plan) — everything else directs the implementer to mirror a named, located, existing function.
