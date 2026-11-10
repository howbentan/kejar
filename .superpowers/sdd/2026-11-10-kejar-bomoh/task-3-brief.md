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

