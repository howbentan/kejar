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

