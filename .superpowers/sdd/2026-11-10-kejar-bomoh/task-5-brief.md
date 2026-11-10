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

