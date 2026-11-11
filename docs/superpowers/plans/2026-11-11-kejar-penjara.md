# Penjara Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three missing Core rules around Penjara and the end of the game: the 10-second rescue, the Penjara reel (one lime free slot among nine black ones, owner's decision 2026-11-11, replacing the dares), and `5 minutes left`.

**Architecture:**
- **Server-owned state:** each feature keeps its state on the server, in one new migration, `supabase/migrations/0017_penjara.sql`:
  - a live rescue is one jsonb column, `games.rescue`;
  - a jail stay's pull is `players.reel_pulled_at`;
  - the warning is `games.five_warned_at`.
- **Atomic claims:** each piece has an atomic SQL claim function, following the existing `claim_*` pattern.
- **Where it settles:** `advance` settles a rescue and the warning, so they need no server tick. Pure rules live in `app/shared/penjara.ts`, and the screens build on the existing Jail, RunnerChase, ChaserChase and MarshalLive.

**Tech Stack:** TypeScript, React, Vitest/jsdom, Supabase/Postgres (plpgsql), Vercel. The Motion library is used for the reel, with reduced motion respected.

**Spec:**
- `docs/superpowers/specs/2026-11-11-kejar-gameplay-audit-fixes-design.md`, Plan 2 (§2.1–§2.3). It points to:
  - `docs/superpowers/specs/2026-10-30-kejar-rules.md` §9a (the rescue) and §2.7 (`5 minutes left`);
  - `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md` §3 and §3a (the dare reel);
  - the mockup `docs/superpowers/mockups/2026-10-30-motion/9-penjara-dare-reel.html`.

## Global Constraints

- **Copy:** English with a light Malaysian twist, and no em-dashes in any player- or organiser-facing string.
- **Platform:**
  - The server is the authority.
  - Free tiers only; keep the single `api/game.ts` function.
  - Both `MemoryStore` and `SupabaseStore` implement every new `GameStore` method, and `GAME_COLUMNS` includes the new game columns.
- **Migration `0017_penjara.sql`:**
  - idempotent (`if not exists`, `create or replace`), wrapped in one `begin; … commit;`;
  - new functions revoked from `public, anon, authenticated` and granted to `service_role`;
  - each task appends its own section, and the owner runs it before merge.
- **Never use `sed -i`.** Check `git diff --stat` before each commit, and stage files by name.
- **Exact values:**
  - `RESCUE_HOLD_MS = 10_000`
  - `RESCUE_RADIUS_M = 30` (the existing `JAIL_RADIUS_M`)
  - `RESCUE_PING_MS = 1_500` (how often the rescuer's phone sends its location during the hold)
  - `FIVE_LEFT_MS = 5 * 60_000`
  - Penjara reel: 10 slots (9 black + 1 lime free slot); one pull per jail stay.
- **Exact copy, rescue:**
  - Rescuer: `Stay close · {s} s`
  - Chasers' ticker: `Rescue starting at Penjara!` then `Catch them in 10 s and nobody gets out.`
  - Jailed runners and the marshal: `{name} is breaking you out · {s} s`
  - Success feed: `Jailbreak! {n} Dikejar free.`
  - Fail feed: `Rescue failed. Nobody gets out.`
- **Exact copy, Penjara reel** (owner's decision 2026-11-11: no dares, no marshal confirm):
  - Screen: `PENJARA`, `Your pull.`, `One pull. One slot sets you free.`
  - After the pull: `ONE PULL PER STAY`
  - Black slot: `Not this time. Wait for a rescue.`
  - Free slot: `YOU'RE FREE` / `Keluar penjara! Walk away from Penjara and hide. This uses your one escape.`
  - Feed, when a runner lands on the free slot: `{name} pulled the free slot. Keluar penjara!`
- **Exact copy, warning:**
  - Push and feed: `5 minutes left!`
  - The clock turns lime (`var(--volt)` or the project's lime token) for the rest of the game.
- **Sound:** the black slot plays the owner's clip, copied from `C:/Users/User/Downloads/bomboclattt.mp3` to `app/public/sounds/black-slot.mp3` (52 KB; check its licence before paid events, a HANDOFF to-do). Everything else is generated with Web Audio: clicks, ratchet, clunk, and a short fanfare for the free slot in place of the vine boom until its licence is checked. There is a mute toggle, saved in localStorage per viewer, and nothing plays when it's muted.
- **Secrecy:** nothing new names Dato Seri or Bomoh. Dato Seri's Settle and the reel's free slot still free at once (rules §9a).

## Review Focus

1. **The rescuer is caught during the hold.**
   - Expected: the rescue fails, nobody gets out, and the catch counts as normal.
   - Pinned in Task 1 (`catchAction` cancels a live rescue whose rescuer it catches).
2. **The game is paused, or the clock runs out, during a hold.**
   - Expected: a pause freezes the hold, the same as the final whistle; the clock running out ends the game with no jailbreak.
   - Pinned in Task 1.
3. **A second runner scans the Penjara code during a hold.**
   - Expected: they join it and the hold continues (no new timer). If the first rescuer is caught, the rescue fails even though a joiner is still near.
   - Pinned in Task 1.
4. **A jailed runner who has already used their escape pulls the reel.**
   - Expected: their reel is all black, so they can pull but never win.
   - Pinned in Task 2.
5. **`5 minutes left` with the final whistle or a pause in play, or a game shorter than 5 minutes of chase left at start.**
   - Expected: the warning fires once per game, never during a pause, and never for a game already in its final whistle.
   - Pinned in Task 3.

---

### Task 1: The 10-second rescue (§2.1, rules §9a)

**Files:**
- Modify:
  - `supabase/migrations/0017_penjara.sql` (create it), section 1:
    - `alter table games add column if not exists rescue jsonb`;
    - `start_rescue(p_game uuid, p_by uuid, p_at timestamptz) returns boolean`, which sets `{ by, startedAt, joiners: [] }` only if `rescue is null`;
    - `end_rescue(p_game uuid, p_started text) returns boolean`, which clears it only if `rescue->>'startedAt' = p_started`;
    - also re-create `resume_game` from `0016` so it shifts `rescue.startedAt` by the pause length when a rescue is live.
  - `app/shared/penjara.ts` (create): the pure rescue rules.
  - `app/shared/types.ts`: `Game.rescue: { by: string; startedAt: string; joiners: string[] } | null`; the new event types `'rescue-started' | 'rescue-failed'`.
  - `app/api/_lib/store.ts` and `supabaseStore.ts`: `startRescue`, `endRescue`, `joinRescue`; `rescue` in `GAME_COLUMNS` and the `createGame` defaults.
  - `app/api/_lib/actions.ts`:
    - `jailbreak` starts or joins a rescue instead of freeing at once;
    - `advance` settles a due rescue;
    - `catchAction` fails a rescue whose rescuer it catches;
    - the existing `location` action is the hold's heartbeat (no new action).
  - `app/shared/views.ts`: a `rescue` view field and feed lines.
  - `app/src/screens/RunnerChase.tsx`: the hold ring for the rescuer and joiners, sending location every `RESCUE_PING_MS` while holding.
  - `app/src/screens/Jail.tsx`: the jailed runners' banner.
  - `app/src/screens/ChaserChase.tsx`: the ticker and a buzz (`navigator.vibrate`).
  - `app/src/screens/MarshalLive.tsx`: the marshal's line.
- Test: `app/shared/penjara.test.ts`, `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/shared/views.test.ts`, and the four screens' tests.

**Interfaces:**
- **Produces, in `penjara.ts`:**
  - `RESCUE_HOLD_MS`, `RESCUE_PING_MS`.
  - `export function rescueVerdict(i: { rescue: { by: string; startedAt: number }; rescuer: Player; fixes: Position[]; jail: LatLng; now: number }): 'holding' | 'success' | 'failed'`:
    - `failed` if the rescuer is out (`isOut`);
    - `failed` if any fix the rescuer sent after `startedAt` is clearly outside `JAIL_RADIUS_M + slack` (capped accuracy, as `atJail` uses). A fix with poor accuracy (over 20 m) is ignored, not counted against them;
    - `success` once `now >= startedAt + RESCUE_HOLD_MS`;
    - otherwise `holding`.
- **The store** gains the methods `startRescue(gameId, by, atIso): Promise<boolean>`, `endRescue(gameId, startedAtIso): Promise<boolean>` and `joinRescue(gameId, playerId): Promise<void>`.
- **`jailbreak`, after today's checks** (fresh fix within 30 m, free runner, someone to free):
  - with no live rescue, `startRescue` adds a `rescue-started` event `{ who }` and returns `{ ok: true, rescue: 'started', endsAt }`;
  - with a live rescue, it joins it and returns `{ ok: true, rescue: 'joined', endsAt }`.
- **`advance`**, when `game.rescue` is set and the game isn't paused:
  - on `success` (and `end_rescue` won), it frees as today's jailbreak does (everyone jailed who hasn't been freed once), then adds `jailbreak { freed }`;
  - on `failed` (and `end_rescue` won), it adds `rescue-failed`;
  - if the game has ended, it clears the rescue without freeing anyone.
- **`catchAction`:** when the caught runner is `game.rescue.by`, it ends the rescue with `rescue-failed`.
- **View field** for every role: `rescue: { by: string; byName: string; endsAt: number } | null`.

- [ ] **Step 1: Write the failing tests.**
  - **`penjara.test.ts`:**
    - holding at +5 s;
    - success at +10 s;
    - failed when the rescuer is jailed;
    - failed with a fix 60 m away at accuracy 5;
    - not failed by one fix 60 m away at accuracy 50.
  - **`actions.test.ts`:**
    - a scan at Penjara starts a rescue and frees nobody yet;
    - a poll at +10 s frees everyone eligible and posts `Jailbreak! 2 Dikejar free.`;
    - catching the rescuer at +5 s fails it, and nobody gets out (Review Focus 1);
    - a second runner's scan at +3 s joins, and success still comes at +10 s from the first scan (Review Focus 3);
    - a pause of 2 min at +4 s, then resuming, still needs 6 s more (Review Focus 2);
    - the clock running out during the hold frees nobody;
    - Settle during a hold still frees at once.
  - **`store.test.ts`:** two `startRescue` calls give only one `true`; `endRescue` with the wrong `startedAt` returns false.
  - **`views.test.ts`:** the four exact lines.
  - **The screens:**
    - RunnerChase shows `Stay close · 7 s` and sends `location` about every 1.5 s while holding;
    - Jail shows `Hafiz is breaking you out · 7 s`;
    - ChaserChase's ticker shows both chaser lines;
    - MarshalLive shows the marshal line.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.** `feat: the 10-second rescue at Penjara`

---

### Task 2: The Penjara reel (§2.2; jail design §3a for the look and feel; owner's 2026-11-11 change: black slots, no dares)

**Files:**
- Modify:
  - `supabase/migrations/0017_penjara.sql`, section 2:
    - `alter table players add column if not exists reel_pulled_at timestamptz`;
    - `pull_reel(p_player uuid, p_at timestamptz) returns boolean`, which sets it only if the player is jailed and (`reel_pulled_at is null` or `reel_pulled_at < caught_at`).
  - `app/shared/penjara.ts`: `REEL_SLOTS = 10` and `pickReel(rng: () => number, freedOnce: boolean): 'free' | 'black'`.
  - `app/shared/types.ts`: `Player.reel_pulled_at: string | null`.
  - Both stores: `pullReel(playerId, atIso): Promise<boolean>`.
  - `app/api/_lib/actions.ts`: the `pullReel` action (runner only).
  - `app/shared/views.ts`: `reel: { pulled: boolean; result: 'free' | 'black' | null }` for the jailed runner, and the feed line.
  - Create `app/src/game/PenjaraReel.tsx` and `app/src/game/sounds.ts`, and add `app/public/sounds/black-slot.mp3`.
  - `app/src/screens/Jail.tsx`: show the reel once arrived (the `arrived` state, about line 111).
- Test: `app/shared/penjara.test.ts`, `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/src/game/PenjaraReel.test.tsx`, `app/src/screens/Jail.test.tsx`.

**Interfaces:**
- **`pickReel(rng, freedOnce)`:**
  - returns `'free'` with probability 1/10, otherwise `'black'`;
  - always returns `'black'` when `freedOnce` is true (Review Focus 4);
  - the server picks, and the client only animates to the result.
- **`pullReel({ code, token, lat?, lng?, accuracy_m? })`:**
  - It is refused unless the runner is jailed, at Penjara (`atJail`, using the fix sent with the call) and hasn't pulled this stay.
  - On `free`, it frees the runner as a jailbreak would (`freed_once`, `freed_at`) and adds a `reel-free` event `{ who }`.
  - On `black`, it adds nothing to the feed.
  - It returns `{ ok: true, result }`.
- **The reel:**
  - A lime-bordered window with markers, holding 10 cards: one lime, nine black. The black cards have no text.
  - A lever underneath that can be dragged down or tapped.
  - It scrolls for about 2.8 s, eased, stops with a small shake on the server's result, then disables the lever with `ONE PULL PER STAY`.
  - With reduced motion it jumps straight to the result.
  - A runner whose escape is used sees ten black cards.
  - No casino styling or wording.
- **Sound:**
  - `sounds.ts` exports `playBlackSlot()` (the mp3, through an `Audio` element), `playFree()`, `playTick()` and `playClunk()`.
  - All of them do nothing when muted.
  - The mute toggle's state is kept in localStorage per viewer, wrapped in try/catch.

- [ ] **Step 1: Write the failing tests.**
  - **`penjara.test.ts`:** with a seeded rng, `free` comes up about 1 in 10 over 10,000 picks (within 0.08–0.12), and never when `freedOnce` is true.
  - **`actions.test.ts`:**
    - a pull away from Penjara is refused;
    - one pull per stay;
    - a fresh catch allows a new pull;
    - a free result frees, spends the escape and posts the feed line;
    - a black result posts nothing;
    - a runner who isn't jailed can't pull.
  - **`store.test.ts`:** two concurrent `pullReel` calls give only one `true`.
  - **`PenjaraReel.test.tsx`:**
    - it renders `PENJARA`, `Your pull.` and `One pull. One slot sets you free.`;
    - tapping the lever calls `pullReel` and shows `Not this time. Wait for a rescue.` (black) or the free copy;
    - the lever is then disabled with `ONE PULL PER STAY`;
    - a black result calls `playBlackSlot`;
    - with mute on, no sound function is called.
  - **`Jail.test.tsx`:** the reel shows only once the runner has arrived.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Copy the clip with `cp "/c/Users/User/Downloads/bomboclattt.mp3" app/public/sounds/black-slot.mp3`.
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite, typecheck and build.
- [ ] **Step 5: Commit.** `feat: the Penjara reel, one lime slot among nine black`

---

### Task 3: `5 minutes left` (§2.3, rules §2.7)

**Files:**
- Modify:
  - `supabase/migrations/0017_penjara.sql`, section 3:
    - `alter table games add column if not exists five_warned_at timestamptz`;
    - `claim_five_warning(p_game uuid, p_at timestamptz) returns boolean`, which sets it only if null.
  - Both stores: `claimFiveWarning`, plus `five_warned_at` in `GAME_COLUMNS` and the defaults.
  - `app/shared/penjara.ts`: `fiveLeftDue(game, now): boolean`.
  - `app/api/_lib/actions.ts` `advance`: on due and claimed, it adds a `five-left` event and pushes `{ type: 'notice', title: 'kejar.', body: '5 minutes left!' }` to every player with a subscription.
  - `app/shared/views.ts`: the feed line `5 minutes left!`, and a `fiveLeft: boolean` view field.
  - The clock component: `GameClock` in `app/src/game/ChaseLayout.tsx` and the marshal clock in `MarshalLive.tsx` turn lime when `fiveLeft`.
  - `docs/HANDOFF.md`: a Penjara entry with a bold **Before merging: run `supabase/migrations/0017_penjara.sql` in Supabase first.** line, and why (the game select reads `rescue` and `five_warned_at`). It also lists the three features and the licence to-dos for the black-slot clip and the vine boom.
  - `docs/superpowers/specs/2026-10-30-kejar-rules.md`: mark §9a as built, and record that the dare reel became a black-slot reel with no dares (owner, 2026-11-11).
- Test: `app/shared/penjara.test.ts`, `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`, `app/src/screens/ChaserChase.test.tsx`.

**Interfaces:**
- **`fiveLeftDue(game, now)`** is true when all of these hold:
  - the phase is `chasing`;
  - the game isn't paused;
  - no final whistle is pending;
  - `five_warned_at` is null;
  - the time left (from `phaseAt(...).endsAt`) is `<= FIVE_LEFT_MS`.
- A game that starts its chase with 5 minutes or less left also warns once, straight away.

- [ ] **Step 1: Write the failing tests.**
  - **`penjara.test.ts`:**
    - due at 4:59 left, not at 5:01;
    - not while paused;
    - not with a final whistle pending;
    - not once warned (Review Focus 5).
  - **`actions.test.ts`:**
    - polling at 4:59 left posts one `five-left` event and one push per subscribed player;
    - a second poll posts nothing more.
  - **`views.test.ts`:** the feed line.
  - **`ChaserChase.test.tsx`:** the clock has the lime class when `fiveLeft`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement, and update both docs.**
- [ ] **Step 4: Run the full suite, typecheck and build.**
- [ ] **Step 5: Commit.** `feat: 5 minutes left warning and lime clock; HANDOFF for Penjara`
