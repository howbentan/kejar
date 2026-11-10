# Task 6 Report: `views.ts` — Bomoh's reveal effect and hint zone

## Fix round 1 (review findings)

**Finding:** The "lands at a different offset than an unclaimed dato_stash" zone test only asserted
`expect(v.bomohZone).not.toBeNull()` and `expect(v.bomohZone).not.toEqual(v.legendaryZone)`. Before
`bomohZoneFor` existed, `v.bomohZone` was `undefined` — `undefined` passes `.not.toBeNull()` (it isn't strictly
`null`) and trivially passes `.not.toEqual()` against any real object, so the test went green even with no
implementation. The reviewer traced this from the RED log: 5 of 8 new tests failed pre-implementation, not 8,
meaning 3 passed vacuously (not the 2 my original report's narrative named — I had only accounted for the two
legitimate "no-effect" tests, missing that this zone test was *also* vacuous).

**Fix:** Added positive, implementation-dependent assertions to that test before the inequality check:
`typeof v.bomohZone?.lat === 'number'`, `typeof v.bomohZone?.lng === 'number'`, `v.bomohZone?.radiusM ===
LEGENDARY_ZONE_M`, and the same `distanceM` well-inside-the-band check the existing Dato zone test uses. Any of
these fail hard against `undefined`, so the test can no longer pass without a working `bomohZoneFor`.

**Also picked up both minor items** (not required, but cheap and worth the regression coverage):
- A Bomoh + Decoy test (`a decoyed runner under an active Bomoh is shown exactly at the decoy spot, not their
  real one`), mirroring the existing Focus + Decoy test at `views.test.ts:626`.
- Two organiser-gating tests for `bomohStash`/`bomohCard` (`the organiser gets the exact bomoh stash instead of
  a zone; a marshal gets neither`, and `the Bomoh card is for the organiser only, ...`), mirroring the existing
  `datoStash`/`datoCard` tests around `views.test.ts:828-852`.

### Corrected RED-count accounting

With the fix and the 3 new tests, there are 11 Bomoh-related tests total in this task (6 reveal + 5 zone).
Re-verified RED by reverting `shared/views.ts` to the pre-Task-6 commit (`d2aba26`) while keeping the current
test file:

```
$ npm test -- views.test
 Test Files  1 failed (1)
      Tests  9 failed | 119 passed (128)
```

9 of the 11 Bomoh tests failed, as expected. The 2 that still passed are legitimately no-op assertions that
hold both before and after implementation (not vacuous in the bug sense the reviewer flagged — they assert "no
effect", which happens to also describe the no-implementation starting state, and they still guard against a
future regression that turns the effect on by mistake):
- `reverts to the normal fuzzy/decoy treatment from the third reveal after the claim onward`
- `an unclaimed bomoh_stash has no effect on any dot`

All other 9 — including the now-strengthened zone-distinctness test, the two new organiser-gating tests, and
the new decoy test — failed for genuine implementation-missing reasons (`undefined` where a number/zone/stash
was expected, or `'focus'`/`null` where `'bomoh'` was expected). Full failure output for each is in the
`fix round 1` work; representative sample:

```
FAIL  Bomoh's hint zone (jail design §2e) > lands at a different offset than an unclaimed dato_stash at the same spot (distinct seed suffix)
AssertionError: expected 'undefined' to be 'number'
    expect(typeof v.bomohZone?.lat).toBe('number')

FAIL  Bomoh's hint zone (jail design §2e) > the organiser gets the exact bomoh stash instead of a zone; a marshal gets neither
AssertionError: expected undefined to be null
    expect(h.bomohZone).toBeNull()

FAIL  Bomoh's team-wide reveal (jail design §2e) > a decoyed runner under an active Bomoh is shown exactly at the decoy spot, not their real one
AssertionError: expected undefined to be true
    expect(dot.exact).toBe(true)
```

**GREEN** — restored `shared/views.ts` (byte-identical to the committed Task-6 version; no production-code
change was needed, only the test file changed):

```
$ npm test -- views.test
 Test Files  1 passed (1)
      Tests  128 passed (128)

$ npx tsc --noEmit -p .
(no output — clean)

$ npm test
 Test Files  81 passed (81)
      Tests  1194 passed (1194)
```

**Files changed in this round:** `app/shared/views.test.ts` only (53 lines added; `views.ts` untouched).

## What I implemented

### `app/shared/views.ts`

- **`MapDot.revealedBy`** widened from `'focus' | null` to `'focus' | 'bomoh' | null`. (The task brief said this
  lived in `app/shared/types.ts`; it doesn't — `MapDot` is defined in `views.ts` only. Checked `types.ts` directly;
  no `MapDot` reference there. Adapted the brief accordingly, no `types.ts` change was needed or made.)
- **`View` interface**: added `bomohZone: { lat: number; lng: number; radiusM: number } | null` (sibling of
  `legendaryZone`), and `bomohStash?: PlacedStash | null` / `bomohCard?: { letter: string; code: string } | null`
  (siblings of `datoStash`/`datoCard`).
- **`chaserDots`**: added the reveal computation, placed right after the `focusers` computation:

  ```ts
  const bomoh = placedStash(i.game.bomoh_stash)
  const bomohClaimedAt = bomoh?.claimedBy ? Date.parse(bomoh.claimedAt!) : null
  const bomohRevealNo = bomohClaimedAt === null ? Infinity : revealed.filter((r) => Date.parse(r.reveal_at) > bomohClaimedAt).length
  const bomohActive = bomohClaimedAt !== null && revealAt > bomohClaimedAt && bomohRevealNo <= 2
  ```

  (`revealAt` here is the already-computed `Date.parse(last.reveal_at)`, reused instead of re-parsing.)

  Inside the per-runner loop:

  ```ts
  const focused = focusers.some((f) => distanceM(f, at) <= FOCUS_M)
  // Bomoh takes priority over Focus when both apply: the rarer, team-wide effect wins the purple ring.
  const revealedByBomoh = bomohActive ? 'bomoh' : null
  const isExact = revealedByBomoh !== null || focused
  const revealedBy = revealedByBomoh ?? (focused ? 'focus' : null)
  ```

  Threaded `isExact`/`revealedBy` into all three existing branches (decoyed+revealed, focused-exact, plain-fuzzy),
  replacing the old `focused` boolean and hardcoded `'focus'` string. Decoyed runners keep their decoy spot under
  Bomoh too — same rule as Focus ("neither Focus nor Bomoh can expose a Decoy").

- **`bomohZoneFor`**: new function, a sibling of `legendaryZoneFor`, reading `i.game.bomoh_stash` and seeding with
  `` `${secretSeed(i.game)}:bomoh-legendary-zone` `` (distinct suffix from Dato's `legendary-zone`).
- **`bomohCardOf`**: new function, a sibling of `datoCardOf`, reading `i.game.bomoh_stash`.
- Wired `bomohZone: bomohZoneFor(i, phase)` next to `legendaryZone` in `fullView`.
- Wired `bomohStash`/`bomohCard` into the organiser-only spread, alongside `datoStash`/`datoCard`.
- Added `bomohZone: null, bomohStash: undefined, bomohCard: undefined` to the removed-player reset spread in
  `viewFor`.

No changes were needed to `app/shared/types.ts` — `BomohStash`/`bomoh_stash` already exist there from Task 1, and
`placedStash` already accepts either stash shape structurally (it only reads `lat`/`lng`/`claimedBy`/`claimedAt`).

### `app/shared/views.test.ts`

Added two new `describe` blocks:

1. `"Bomoh's team-wide reveal (jail design §2e)"` (after the `power-up effects` block) — 5 cases:
   - Active reveal: claimed before the last reveal → every free runner (including one otherwise "missed")
     gets `exact: true, revealedBy: 'bomoh'`, regardless of distance.
   - Exactly-2nd-reveal boundary: claimed before both of the two default reveals (10 min, 15 min) → still active
     at the 15 min reveal (`bomohRevealNo === 2`).
   - 3rd-reveal reversion: adds a 3rd ping reveal after the claim → `bomohRevealNo === 3` → reverts to plain
     fuzzy treatment (`revealedBy: null`, `fuzzy: true`).
   - Focus/Bomoh tie-break: both active on the same runner at the same reveal → `revealedBy: 'bomoh'`, not
     `'focus'`.
   - Unclaimed `bomoh_stash` (`claimedBy: null`): no effect — dot stays plain fuzzy.

2. `"Bomoh's hint zone (jail design §2e)"` (after the existing Dato Seri hint zone block) — 3 cases:
   - An unclaimed, dropped `bomoh_stash` at the same spot as an unclaimed `dato_stash` lands at a different
     offset (`bomohZone !== legendaryZone`), proving the distinct seed suffix.
   - A claimed or undropped (`lat`/`lng` null) `bomoh_stash` produces `bomohZone: null`.
   - Core mode produces `bomohZone: null` even with a dropped stash.

## Testing

- `npm test -- views.test`: 125/125 passed (full file, after implementation).
- `npm test` (full suite): 1191/1191 passed across 81 files.
- `npx tsc --noEmit -p .`: no errors.
- `npm run lint`: pre-existing warnings only, none in `views.ts`/`views.test.ts`.

### TDD Evidence

**RED** — temporarily reverted `shared/views.ts` to the committed (pre-Task-6) version while keeping the new
tests, then ran `npm test -- views.test`:

```
 FAIL  shared/views.test.ts > Bomoh's team-wide reveal (jail design §2e) > reveals every free runner exactly, regardless of distance from any chaser, once claimed
AssertionError: expected { id: 'r1', kind: 'runner', …(6) } to match object { lat: 3.002, lng: 101.002, …(2) }
- Expected: { "exact": true, "lat": 3.002, "lng": 101.002, "revealedBy": "bomoh" }
+ Received: { "lat": 3.002000359307929, "lng": 101.00193298476745, "revealedBy": null }

 FAIL  shared/views.test.ts > Bomoh's team-wide reveal (jail design §2e) > stays active through exactly the second ping-reveal after the claim
 FAIL  shared/views.test.ts > Bomoh's team-wide reveal (jail design §2e) > an active Bomoh beats an active Focus on the same runner: revealedBy is bomoh, not focus
AssertionError: expected 'focus' to be 'bomoh'

 FAIL  shared/views.test.ts > Bomoh's hint zone (jail design §2e) > a claimed or undropped bomoh_stash produces no zone
AssertionError: expected undefined to be null
 FAIL  shared/views.test.ts > Bomoh's hint zone (jail design §2e) > Core mode produces no bomoh zone even with a dropped stash

 Test Files  1 failed (1)
      Tests  5 failed | 120 passed (125)
```

(The 2 "no-effect" cases — 3rd-reveal reversion and unclaimed-stash — pass trivially pre-implementation since
they assert the pre-existing default behavior; the other 5 fail as expected because `bomohZone`/`View.bomohZone`
didn't exist and the reveal computation wasn't there.)

**GREEN** — restored the implementation, reran:

```
npm test -- views.test
 Test Files  1 passed (1)
      Tests  125 passed (125)

npm test
 Test Files  81 passed (81)
      Tests  1191 passed (1191)
```

## Files changed

- `app/shared/views.ts`
- `app/shared/views.test.ts`

## Self-review findings

- Brief said `types.ts` needed `MapDot.revealedBy` widened; `MapDot` actually lives in `views.ts`. Adapted —
  changed it there instead, confirmed via grep that `types.ts` has no `MapDot`.
- Avoided shadowing the outer `revealed` (the sorted reveal-pings array) with a same-named per-runner boolean;
  named the per-runner boolean `isExact` instead for clarity.
- Reused the already-parsed `revealAt` instead of re-parsing `last.reveal_at` a second time for the
  `bomohActive` check (functionally identical to the brief's snippet, just avoids the redundant `Date.parse`).
- Decoy interaction: confirmed Bomoh follows the same "can't expose a Decoy" rule as Focus — the decoy spot is
  kept, only the `exact`/`revealedBy` styling changes, matching the existing Focus+Decoy behavior and comment.
- No scope creep: didn't touch the organiser tooling, `actions.ts`, or anything outside `views.ts`/its test file.

## Concerns

None. The implementation is a direct, symmetric extension of the existing Dato Seri / Focus patterns, verified
with explicit RED/GREEN evidence for all 5 brief-specified boundary cases plus the 3 zone cases.
