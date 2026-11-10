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

