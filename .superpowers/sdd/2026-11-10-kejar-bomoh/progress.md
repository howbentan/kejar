# SDD ledger — plan: docs/superpowers/plans/2026-11-10-kejar-bomoh.md

## Pre-flight scan

Spec reachable: yes — docs/superpowers/specs/2026-10-30-kejar-chaser-legendary-design.md (§2, §2a-§2e).

Pairwise task/interface table:

| Pair | Shared surface | Producer → Consumer | Finding |
|---|---|---|---|
| 1 → 3,4,5,6 | `BomohStash` type, `store.claimBomoh` | Task 1 produces the type + store method | Clean — 3/4/5/6 only consume, no redefinition |
| 2 → 5,8 | `isBomohQr`/`bomohCodeFromQr` | Task 2 produces | Clean |
| 3 → 5 | `judgeBomohClaim` | Task 3 produces, Task 5 calls it in `claimBomoh` | Clean |
| 4 → 5 | generalized lifecycle fns (`freeCard`, `isDropped`, `stashOn`, etc.), `settingsFrom` bomoh passthrough | Task 4 produces, Task 5 depends on both for `claimBomoh`/`dropBomohSeri` | Clean — plan orders 4 before 5 |
| 6 → 7 | `View.bomohZone`, `MapDot.revealedBy` incl. `'bomoh'` | Task 6 produces, Task 7 renders | Clean |
| 6 → 8 | `view.bomohStash`/`view.bomohCard` | Task 6 produces, Task 8's `HiddenCard`/`WalkPark` consume | Clean — plan orders 6 before 8 |
| 5 → 8 | `dropBomohSeri` action | Task 5 produces, Task 8 calls it | Clean |
| 9 | `settingsFrom`'s bomoh passthrough (Task 4 step 5) | HostNew.tsx toggle depends on it already being unlocked | Clean — Task 4 already lands this; Task 9 is client-only by the time it runs |
| 1-9 → 10 | everything | end-to-end scenario test | Clean — last task, no producer conflicts |

Self-consistency per task: read each task's Files/Interfaces/Steps against
its own Review Focus/Global-Constraints references — no task asserts a test
with no assertions, no task duplicates another task's logic block verbatim
(Task 1's `claim_bomoh()` SQL is adapted-not-duplicated from `claim_dato()`,
explicitly noted in the plan as the one deliberately-small exception to the
Task-4 DRY argument).

Global Constraints cross-check: "no hand card, no `powerups` row" (Task 5)
agrees with Task 3's `judgeBomohClaim` (no `slotBusy` check) and Task 6
(reveal sourced from `bomoh_stash.claimedAt`, not a `powerups` row) — no
task re-introduces a hand-card path.

Scan is clean. No rulings needed before Task 1.

## Tasks

Task 1: complete (commits 41ff0d2..efbf3ad, review clean — Approved, no Critical/Important)
Task 1: note — brief's stated file paths (app/shared/store.ts, app/shared/supabaseStore.ts) were wrong; the real files are app/api/_lib/store.ts and app/api/_lib/supabaseStore.ts. Implementer correctly found and used the real files. Carry the correct paths into any later task whose brief references the store layer.
Task 1: minor (deferred): migration SQL not run against a live Postgres/Supabase instance — structural copy of already-proven claim_dato(), low risk, one-time sanity check recommended before production merge.

Task 2: complete (commits efbf3ad..8ce4ad7, review clean — Approved, no Critical/Important)
Task 2: minor (deferred): no length-boundary test (64/65 char) for bomohCodeFromQr's code regex — mirrors a pre-existing gap in the Dato test suite, not a new hole.

Task 3: complete (commits 8ce4ad7..9128e72, review clean — Approved, no Critical/Important)
Task 3: minor (deferred): powerups.test.ts's "never checks the hand" case is a duplicate of the success case (no power-up input to differ on) — can't fail for its stated reason; either delete or make it real by asserting {ok:true} with a held power-up present.

Task 4: complete (commits 9128e72..d059938, review clean — Approved, no Critical/Important). Highest-risk task in the plan; reviewer independently verified the central risk directly against the diff (no pre-existing Dato test assertion was weakened — only the one test whose premise Step 5 explicitly invalidates was updated).
Task 4: minor (deferred): stashOn()'s return type is still annotated DatoStash though it also builds Bomoh stashes now — harmless today since the two shapes are structurally identical, but won't be caught by the type system if they diverge later.
Task 4: minor (deferred): settingsFrom lost its "Bomoh isn't built yet" comment with nothing explaining why `s.legendaries = legendaries` is now safe — doc-only.
Task 4: CARRY FORWARD to Task 5 — MemoryStore.unfinishedGames (store.ts) and supabaseStore.ts both have a dato_stash-only pre-filter for "games with an undropped/dropped stash still pending." It's correctly out of scope for Task 4 (nothing load-bearing calls it with 'bomoh' yet), but Task 5 adds dropBomohSeri, which WILL set bomoh_stash.lat for real lobbies — at that point this filter needs a matching bomoh_stash check or Bomoh-holding lobbies may be mishandled by whatever unfinishedGames feeds. Task 5's implementer must check this filter's call sites and widen it if dropBomohSeri's lobbies would otherwise be filtered out incorrectly. — RESOLVED in Task 5 (unfinishedGames widened in both stores, covering test added).

Task 5 (first pass): claimBomoh/isBomohQr-dispatch/dropBomohSeri all correctly implemented, but review surfaced a genuine plan gap I (controller) did not scope into any task: three Dato-only call sites in actions.ts — create (~618-626, eager card assignment so the organiser can print before hiding, ruling R15), start (~718), the organiser's own state poll (~785-787, needsRecheck/settleLobbyCard for expiry R3/R9), and setMode (~1852/1855, releaseCard on leaving Full, settleLobbyCard on entering) — were never threaded for 'bomoh'. Consequence: Bomoh's card is only ever assigned inside dropBomohSeri itself, so the organiser cannot print it before physically hiding it (backwards from the intended workflow), a held Bomoh card leaks forever if the game switches back to Core via setMode, and Bomoh never gets expiry re-check/reassignment on the organiser's poll.
Ruling: this is real and load-bearing (blocks Task 6/8's organiser-print-link work) and belongs in Task 5's own scope — completing claimBomoh/dropBomohSeri's lifecycle wiring symmetrically with Dato is what "wire Bomoh's claim into the live game" actually requires end-to-end, not a separate task. Sending into the fix loop: wire 'bomoh' into create's eager-assignment block, start, the state-poll recheck, and setMode's both branches (entering/leaving Full), mirroring each Dato call exactly. Cost if wrong: if this ruling is mistaken and it should have been a separate task instead, the fix is still correct code either way — only the bookkeeping (which task "owns" the commit) would be off, not the behavior.
Task 5: fix round 1/5 dispatched — Important findings: (1) wire 'bomoh' into create/start/state-poll/setMode per the ruling above; (2) setMode's leaving-Full branch must also releaseCard(ctx, loaded, 'bomoh').
Task 5: minor (deferred): claimBomoh's test suite doesn't exercise judgeBomohClaim's not-chasing rejection as miss-exempt (claimDato's suite has this as a combined test) — low risk, shared code path with Dato.
Task 5: minor (deferred, reporting only): implementer's report said 12 new tests; reviewer counted 11. No code issue.
Task 5: fix round 1/5 (2 addressed, 0 open — both Important findings fixed and independently re-verified against live code; commits 39c6171..c1f00a6)
Task 5: complete (commits d059938..c1f00a6, 1 fix round, review clean)

Task 6 (first pass): reveal-timing/tie-break game logic verified correct by the reviewer via hand-tracing two scenarios (general off-by-one, exact-claim-timestamp boundary) — no gameplay bug. One Important finding: the bomohZoneFor "distinct offset from Dato's zone" test uses only negative assertions (.not.toBeNull()/.not.toEqual()) that pass vacuously when bomohZone is undefined (pre-implementation), so it never actually went RED — 3 of 8 new tests passed trivially pre-implementation, not 2 as the implementer's report claimed.
Task 6: fix round 1/5 dispatched — Important: strengthen the zone-distinctness test to a positive assertion that would actually fail without bomohZoneFor; correct the report's RED-count claim.
Task 6: fix round 1/5 (1 addressed, 0 open — zone test now genuinely fails without implementation, re-verified; production views.ts byte-identical, test-only fix; commits a26b344..c83618d)
Task 6: complete (commits c1f00a6..c83618d, 1 fix round, review clean)
Task 6: minor (deferred): report's earlier Testing/TDD sections still cite pre-fix 125/1191 counts; the Fix round 1 section (128/1194) supersedes them — doc-only.

## PAUSED for device handoff (2026-11-10)

User asked to pause here, push to GitHub, and continue the remainder on a separate device — no merge to main (push the branch only; merge happens at the end, after the final whole-branch review, per the normal finish).

Task 7 (Map rendering) was dispatched and had reached GREEN (implementer's own message: "GREEN. Now run typecheck and the full test suite.") with uncommitted changes to `app/src/game/ChaseLayout.tsx`, `Map.test.tsx`, `Map.tsx`, `app/src/styles/tokens.css` — but per the user's explicit choice, it was stopped (TaskStop) and its uncommitted diff discarded (`git checkout --`) rather than letting it finish, to hand off a clean, fully-reviewed state instead of an in-flight one. **Task 7 has NOT been attempted from the next session's perspective — re-dispatch it fresh from its brief** (`.superpowers/sdd/2026-11-10-kejar-bomoh/task-7-brief.md` already exists and is unchanged/reusable).

Branch pushed to GitHub: `worktree-kejar-bomoh`, HEAD at `c83618d` (Task 6 complete, reviewed clean).

**Resuming on the other device:** checkout `worktree-kejar-bomoh` (or create a fresh worktree from it), re-read this ledger (first line names the plan), confirm Tasks 1-6 show `complete` lines (they do — do not re-dispatch them), and continue at Task 7 using `bash scripts/task-brief docs/superpowers/plans/2026-11-10-kejar-bomoh.md 7` (brief already written, reusable) through Task 10, then the final whole-branch review and `superpowers:finishing-a-development-branch`.
