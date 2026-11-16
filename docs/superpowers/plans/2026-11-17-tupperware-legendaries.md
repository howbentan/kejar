# Tupperware Legendaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12 reusable secret colour cards with one red Tupperware per side holding a single-use QR slip, found through a "side quest" at a ping and opened with a full-screen unlock.

**Architecture:** The four existing stash fields (`dato_stash`, `ring_stash`, `bomoh_stash`, `hijau_stash`) stay as each side's box: a dropped spot plus who claimed it, now with no `code`/`card`. A new `slips` table holds each organisation's one-time tokens; a slip binds to the first game it's scanned in and is used up only by a claim. The side quest fires lazily when a player's location lands inside an open ping window near their side's unclaimed box, recorded once per player in `players.side_quest_at`. The existing atomic `claimDato/claimRing/claimBomoh/claimHijau` store calls still do the claim.

**Tech Stack:** React 19 + motion, Vite, Vitest/jsdom, Vercel API (`app/api/game.ts` → `handle.ts` → `actions.ts`), `MemoryStore` + `SupabaseStore`, Supabase SQL migrations, `qrcode` / `qr-scanner`.

**Spec:** `docs/superpowers/specs/2026-11-17-tupperware-legendaries-design.md`. Mockups: `app/mockups/tupperware/main.tsx` (the `Tupper`, `Decrypt`, `Takeover`, `BomohCard`, `SettleDoodle`, `SlipSheet`, `HidePanel` components are the visual reference; port them, don't import from `mockups/`).

## Global Constraints

- Full mode only. Each side's legendary is still picked at creation by `pickLegendaries` (Dikejar: `dato` or `ring`; Kejar: `bomoh` or `hijau`).
- Box colour is red `#E63946` for both sides. Legendary colours: Dato Seri `#FFD60A`, Super Ring `#FFA94D`, Mak Kau Hijau `#3FA86B`, Bomoh `#C9A4FF`.
- No wake-up rule: a dropped, unclaimed box can be discovered and claimed any time during the chase.
- Side quest radius: **50 m**. Claim reach: existing `CLAIM_RADIUS_M` = 30 plus up to 20 m accuracy slack, fix ≤ `CLAIM_FRESH_MS` old.
- One try per player per game; only a wrong slip uses it.
- Slip sheet: 20 slips, `Dikejar #01–#10` and `Kejar #01–#10` (numbers continue on later sheets: `#11–#20`, …). Footer: `Any unused slip of the right side works.`
- Exact copy: `SIDE QUEST`, `Find the Tupperware`, `Found`, `Scan the slip inside`, `Bukan ini. That was your try.`, `Not your Tupperware.`, `Dah kena ambil.`, `Keep it`, `It's working!`, `Tap to skip`, push `Side quest` / `Something's nearby…`, `Duit kopi sampai.`, `Bawa balik Tupperware Mak!`.
- A box's spot and a slip's token never reach a player's or marshal's view; only the organiser's.
- No server tick: everything is judged inside existing actions (`location`, `claim`, `state`).
- Both stores change together; Supabase migration **0024**, and new player columns go into `PLAYER_COLUMNS` in `api/_lib/supabaseStore.ts`. Preserve each file's line endings (some are CRLF).
- Tests: `npx vitest run <file>` from `app/`; whole suite `npm test`; also `npm run typecheck` and `npm run lint` before each commit.

## Review Focus

1. **Two players claim the same box at once with two different valid slips** → exactly one unlock; the loser sees `Dah kena ambil.`, and the loser's slip stays bound to this game but unused (not burnt). Test in Task 4.
2. **A slip scanned in game A, then taken to game B** → in B it's a wrong slip (`Bukan ini…`, try used), even if it was never claimed in A. Test in Task 4.
3. **A player whose try is used scans a correct slip at the box** → still refused (`Bukan ini…` is not repeated; they get the "used your try" answer), and nothing is bound or used. Test in Task 4.
4. **Side quest during a pause, or for a jailed / disqualified / removed player, or after the box is claimed** → never fires, never pushes. Test in Task 5.
5. **A player view never carries `side_quest_at` of anyone else, any box spot, or any slip token** (roster, feed, `me` of others). Test in Task 6.

---

## Phase 1 · Core

### Task 1: Slip tokens, QR format and storage

**Files:**
- Create: `supabase/migrations/0024_tupperware.sql`
- Modify: `app/shared/ids.ts`, `app/shared/types.ts`, `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/shared/ids.test.ts`, `app/api/_lib/store.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `export type TupperSide = 'dikejar' | 'kejar'`
  - `export interface Slip { id: string; organisation_id: string; side: TupperSide; number: number; token: string; bound_game_id: string | null; bound_at: string | null; used_at: string | null; used_by: string | null }`
  - `Player.side_quest_at?: string | null`
- Produces (ids.ts): `slipQr(token: string): string` → `KEJAR:SLIP:<token>`; `isSlipQr(text: string): boolean` (matches `/^KEJAR:SLIP(:|$)/` like the others); `slipTokenFromQr(text: string): string | null` (`[A-Za-z0-9_-]{1,64}`).
- Produces (Store interface + both stores):
  - `slips(organisationId: string): Promise<Slip[]>`
  - `slipByToken(token: string): Promise<Slip | null>` (lookup across organisations; the caller checks `organisation_id`)
  - `makeSlipSheet(organisationId: string): Promise<Slip[]>` → 10 `dikejar` + 10 `kejar`, `number` continuing from the side's current max, tokens from `newToken()` in `api/_lib/secrets.ts`
  - `bindSlip(slipId: string, gameId: string, at: string): Promise<string>` → atomically sets `bound_game_id`/`bound_at` only when null; returns the slip's `bound_game_id` after the call (this game, or the game it was already bound to)
  - `useSlip(slipId: string, playerId: string, at: string): Promise<boolean>` → sets `used_at`/`used_by` only when `used_at` is null; true for the caller that set it
  - `setSideQuest(playerId: string, at: string): Promise<boolean>` → sets `side_quest_at` only when null; true when newly set

**Ruling (spec §5.1, "stored so the same sheet can be downloaded again"):** tokens are stored as-is (like `secret_cards.code` today), so the print page can redraw any sheet. Comparison still goes through `hashToken` on both sides where a game holds one; here the lookup is by token.

- [ ] **Step 1: Write failing tests**
  - `ids.test.ts`: `slipTokenFromQr(slipQr('abc_DEF-123')) === 'abc_DEF-123'`; `isSlipQr('KEJAR:SLIP')` true; `slipTokenFromQr('KEJAR:SLIP')` null; `slipTokenFromQr('KEJAR:SLIP:has space')` null; `isSlipQr('KEJAR:DATO:x')` false.
  - `store.test.ts` (MemoryStore, the file's existing pattern):
    - `makeSlipSheet('org1')` twice → 40 slips; `dikejar` numbers `1..20`, `kejar` numbers `1..20`; all tokens distinct; `slips('org2')` empty.
    - `bindSlip(id, 'g1', t)` → `'g1'`; then `bindSlip(id, 'g2', t)` → `'g1'`.
    - `useSlip(id, 'p1', t)` true, then `useSlip(id, 'p2', t)` false, and `used_by === 'p1'`.
    - `setSideQuest(pid, t)` true then false; the player row's `side_quest_at === t`.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run shared/ids.test.ts api/_lib/store.test.ts` → missing exports/methods.
- [ ] **Step 3: Implement** ids helpers, types, MemoryStore methods, SupabaseStore methods (`bindSlip`/`useSlip` as `update … .is('bound_game_id', null)` / `.is('used_at', null)` then re-read; `setSideQuest` like `setFlag`), add `side_quest_at` to `PLAYER_COLUMNS`.
- [ ] **Step 4: Write `0024_tupperware.sql`**, in the house style (header comment: what, "Safe to run again. Run it before the code that reads this goes live."):
  ```sql
  create table if not exists slips (
    id uuid primary key default gen_random_uuid(),
    organisation_id uuid not null references organisations (id) on delete cascade,
    side text not null check (side in ('dikejar', 'kejar')),
    number int not null,
    token text not null unique,
    bound_game_id uuid references games (id) on delete set null,
    bound_at timestamptz,
    used_at timestamptz,
    used_by uuid,
    unique (organisation_id, side, number)
  );
  alter table slips enable row level security;
  alter table players add column if not exists side_quest_at timestamptz;
  ```
- [ ] **Step 5: Run, expect PASS**; `npm run typecheck`.
- [ ] **Step 6: Commit** — `feat: single-use Tupperware slips: tokens, QR format, storage (migration 0024)`

### Task 2: Tupperware rules (pure)

**Files:**
- Create: `app/shared/tupperware.ts`, `app/shared/tupperware.test.ts`

**Interfaces:**
- Consumes: `SIDE_PAIRS` (legendaries.ts), `placedStash`, `Game`, `Arena`, `LatLng`, `Player`, `Position`, `TupperSide`, `Slip`; `inPlayArea` (playArea.ts), `distanceM`, `offset`, `hash` (geo.ts).
- Produces:
  - `export const SIDE_QUEST_RADIUS_M = 50`
  - `export function sideOf(role: Player['role']): TupperSide | null` → runner→`dikejar`, chaser→`kejar`, else null
  - `export function boxFor(game: Game, side: TupperSide): { legendary: LegendaryKind; spot: PlacedStash } | null` → the side's legendary that is `'stash'` in `game.settings.legendaries` (Full mode only), with its dropped stash; null if off, not dropped
  - `export function mirroredSpots(arena: Pick<Arena, 'start' | 'boundary' | 'holes'>, seed: string): Record<TupperSide, LatLng>`
  - `export type SlipVerdict = { ok: true } | { ok: false; reason: 'wrong' | 'no-try' | 'not-yours' | 'taken' | 'no-box' }`
  - `export function judgeSlip(i: { slip: Slip | null; organisationId: string; gameId: string; side: TupperSide; triedBefore: boolean; box: ReturnType<typeof boxFor> }): SlipVerdict`

**`judgeSlip` order (the spec's table, fixed here):**
1. `triedBefore` → `no-try`
2. slip null, other organisation, `used_at` set, or `bound_game_id` set and ≠ `gameId` → `wrong`
3. `slip.side !== side` → `not-yours`
4. `box` null → `no-box`
5. `box.spot.claimedBy !== null` → `taken`
6. `{ ok: true }`

Distance, phase, jail, hand and freeze checks stay in the existing `judgeDatoClaim`/`judgeBomohClaim` family (Task 4).

**`mirroredSpots` algorithm:** a direction θ from `hash(seed)`; for k = 0..11 try θ + kπ/6: walk out from `start` along that bearing and its opposite in 10 m steps while both points stay `inPlayArea`, to a max of 300 m; take r = 60% of the shorter reach (min 20 m); the first direction where r ≥ 20 m wins: `dikejar = offset(start, r, dir)`, `kejar = offset(start, r, dir + π)`. If none, both are `start`.

- [ ] **Step 1: Write failing tests**
  - `sideOf('runner') === 'dikejar'`, `sideOf('chaser') === 'kejar'`, `sideOf('marshal') === null`.
  - `boxFor`: Full + `ring: 'stash'` + dropped `ring_stash` → `{ legendary: 'ring', … }`; same with undropped `ring_stash` (lat null) → null; Core mode → null; `dikejar` side never returns `bomoh`.
  - `judgeSlip`: one test per numbered rule, each asserting that rule wins over the later ones (e.g. a wrong slip of the other side → `wrong`; a used-try player with a perfect slip → `no-try`).
  - `mirroredSpots` on the fixture arena (`shared/fixtures.ts`): both inside the play area; `|distanceM(start, d) − distanceM(start, k)| < 1`; same seed → same spots; different seed → usually different (assert for two fixed seeds).
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run shared/tupperware.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: Tupperware rules: sides, boxes, mirrored spots, slip judging`

### Task 3: Slip sheet and drop actions (server)

**Files:**
- Modify: `app/api/_lib/actions.ts` (new actions + registry), `app/api/_lib/handle.ts` if it lists actions
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: Task 1 store methods, Task 2 `boxFor`/`SIDE_PAIRS`.
- Produces actions:
  - `makeSlipSheet { organiserToken }` → `{ ok: true }` (organiser of any game in the org: `requireAnyOrganiser`)
  - `listSlips { organiserToken }` → `{ side, number, token, state: 'unused' | 'bound' | 'used' }[]` sorted by side (`dikejar` first) then number. Tokens are returned: this is the organiser-only print source.
  - `dropTupperware { code, organiserToken, side, lat, lng }` → `{ ok: true }`. Organiser only, Full only, lobby only, inside the play area (same errors as `dropLegendary`). Writes the side's on legendary's stash as `{ lat, lng, claimedBy: null, claimedAt: null }` with **no** `code`/`card`. 409 `That side has no legendary this game.` if the side is off.

- [ ] **Step 1: Write failing tests**
  - `makeSlipSheet` then `listSlips` → 20 rows, first `{ side: 'dikejar', number: 1, state: 'unused' }`; a second org's organiser sees none of them.
  - `dropTupperware side 'dikejar'` on a Full game picked `ring` → `ring_stash` has the spot and no `code`/`card`; on `kejar` with `hijau` picked → `hijau_stash`; Core game → 409; started game → 409; outside the play area → 400; a marshal token → 403.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** and register the three actions.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: slip sheets and dropping a Tupperware`

### Task 4: Claiming with a slip (server)

**Files:**
- Modify: `app/api/_lib/actions.ts` (`claim` routing + new `claimSlip`), `app/shared/types.ts` (event type `'slip-miss'`)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `judgeSlip`, `boxFor`, `sideOf`; the existing `judgeDatoClaim` / `judgeRingClaim` / `judgeBomohClaim` / `judgeHijauClaim` for reach, phase, jail, hand and freeze; the existing atomic `ctx.store.claimDato/claimRing/claimBomoh/claimHijau`; the Hijau start-time logic now inside `claimHijau` (extract it to `startHijauRun(ctx, game, me)` so both paths share it).
- Produces: `claim { qr: 'KEJAR:SLIP:<token>' }` answers:
  - `{ ok: true, kind: LegendaryKind, slip: true }`
  - `{ ok: false, reason: 'wrong' | 'no-try' | 'not-yours' | 'taken' | 'no-box' | 'too-far' | 'hand-full' | 'frozen' | 'cannot-claim' | 'not-chasing' | 'paused' }`

**Flow of `claimSlip(ctx, game, me, token)`:**
1. `organisationId` = `(await ctx.store.organiserById(game.organiser_id)).organisation_id`.
2. `slip = token ? await ctx.store.slipByToken(token) : null`.
3. `triedBefore` = any `'slip-miss'` event by `me` in this game. If true, answer `no-try` now: nothing is bound or used.
4. If the slip belongs to this organisation, is unused and unbound: `bindSlip(slip.id, game.id, now)` **before judging** (spec: any scan binds), and use the returned game id as `bound_game_id`.
5. `judgeSlip(...)` (its rule 1 is then always false, kept so the pure function stays complete); on `wrong` record a `'slip-miss'` event (`data: {}`, never in feeds or alerts) and return it; other refusals record nothing.
6. Run the legendary's existing judge with `stash` = the box; refusals pass through, nothing recorded.
7. Claim atomically with the legendary's store call; a lost race → `taken`.
8. `useSlip(slip.id, me.id, now)`; add the existing `'legendary'` event (no name, as today); for `hijau` call `startHijauRun`.

**Ruling:** `no-box` (side off or not dropped) is answered `Nothing here.` on the client and uses no try: the player can't have done anything wrong.

- [ ] **Step 1: Write failing tests** (a Full game with `ring` + `hijau` picked, both dropped, a fresh slip sheet; runner and chaser fixes placed with the file's existing position helpers):
  - Runner at the box with an unused `dikejar` slip → `{ ok: true, kind: 'ring', slip: true }`; the runner holds an unused `ring` power-up; slip `used_by` is the runner; `ring_stash.claimedBy` is the runner.
  - Chaser with a `kejar` slip → `kind: 'hijau'` and `game.hijau` is set.
  - Runner with a `kejar` slip → `not-yours`; slip now bound to this game; a later correct `dikejar` scan by the same runner still succeeds (no try used).
  - Runner with an unknown token → `wrong`; then the same runner with a good slip at the box → `no-try`; the good slip is **not** bound or used. (Review Focus 3)
  - Runner 100 m away with a good slip → `too-far`; slip bound to this game, not used; then at the box → ok.
  - Slip bound to game A (scanned there, never claimed), scanned in game B → `wrong`. (Review Focus 2)
  - Two runners, two different good `dikejar` slips, claims in sequence at the box → first ok, second `taken`; second slip bound, `used_at` null. (Review Focus 1)
  - Paused game → `paused`; Core game → `no-box`; another organisation's slip → `wrong`.
  - The feed after a claim has the `legendary` line and nothing naming the player or the card.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run api/_lib/actions.test.ts -t "slip"`.
- [ ] **Step 3: Implement** (route `isSlipQr(qr)` in `claim` before the station branch).
- [ ] **Step 4: Run, expect PASS**, then the whole actions file.
- [ ] **Step 5: Commit** — `feat: claim a legendary by scanning the slip in your side's Tupperware`

### Task 5: The side quest (server)

**Files:**
- Modify: `app/api/_lib/actions.ts` (`location`), `app/shared/views.ts` (`View.sideQuest`)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `boxFor`, `sideOf`, `SIDE_QUEST_RADIUS_M`, `openWindowAlert(pingTimes(game, now), now)`, `notify(ctx, game, p, title, body)`, `ctx.store.setSideQuest`.
- Produces:
  - `async function sideQuestFix(ctx: Ctx, game: Game, me: Player, fix: { lat: number; lng: number; accuracy_m: number })`, called at the end of `location`.
  - `View.sideQuest: boolean` — true for the viewer only when `me.side_quest_at` is set, phase is `chasing`, and `boxFor(game, sideOf(me.role))` exists and is unclaimed.

**Rules:** fires when all hold: phase `chasing`; not paused; `me` is a runner or chaser, not jailed, not disqualified, not removed, `side_quest_at` null; a scheduled ping window is open (`openWindowAlert` returns a value); the side's box exists and is unclaimed; `distanceM(fix, box.spot) <= SIDE_QUEST_RADIUS_M + min(accuracy, 20)`. Then `setSideQuest`; only if it returns true, `notify(ctx, game, me, 'Side quest', "Something's nearby…")`.

**Ruling (spec §5.4 chasers):** "latest location from the last 60 s" is implemented as "a fix that lands while a ping window is open". Chasers send fixes every 5 s while Kejar is open (`locationMode` `'always'`), runners send theirs at the check-in; a window lasts 60 s, so this is the same rule with no extra polling. Only scheduled pings count, not Mat Rempit bonus windows.

- [ ] **Step 1: Write failing tests**
  - Runner fix 30 m from the dropped Dikejar box inside an open window → `side_quest_at` set, exactly one push to that runner with title `Side quest`; a second fix → no second push.
  - Same fix outside any window → nothing. 80 m away → nothing.
  - Chaser near the Dikejar box → nothing (wrong side); near the Kejar box → fires.
  - Paused, jailed, disqualified, box claimed, box not dropped → nothing. (Review Focus 4)
  - `views.test.ts`: `sideQuest` true for that runner while unclaimed; false for others; false once claimed; false in `ended`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: side quest: a ping near your side's Tupperware tells you something's nearby`

### Task 6: Views and the kit lists

**Files:**
- Modify: `app/shared/views.ts`, `app/shared/kit.ts`
- Test: `app/shared/views.test.ts`, `app/shared/kit.test.ts`

**Interfaces:**
- Consumes: `boxFor`, `mirroredSpots`, `sideOf`.
- Produces:
  - Players' `legendaryZone`, `bomohZone`, `ringZone`, `hijauZone` are always `null` (fields kept so the client compiles until Task 11 removes their drawing).
  - Organiser view only: `tupperware: Record<TupperSide, { legendary: LegendaryKind; suggested: LatLng; dropped: LatLng | null; claimed: boolean }> | null` (null outside Full; a side that's off is left out). `suggested` = `mirroredSpots(game.arena, game.id)`.
  - `View.me` and every roster entry never include `side_quest_at` (strip it from `me` too; the client reads `sideQuest`).
  - `kit.ts`: `TupperTone = 'red'` added to `SecretTone`; `placeItems(game, true, …)` lists `tupper-dikejar` / `tupper-kejar` (label `Dikejar Tupperware` / `Kejar Tupperware`, tone `red`, at the dropped spot or else the suggested spot) for each side that's on and unclaimed, instead of the colour cards; `packItems` replaces the per-card lines with `{ id: 'tupperware', label: '2 red Tupperwares, 1 slip of each side' }` (only the sides that are on: `1 red Tupperware, 1 Dikejar slip` when one side) and adds `{ id: 'bring-home', group: 'day', label: 'Bawa balik Tupperware Mak!' }`. `SECRET_PLACE_IDS` becomes `['tupper-dikejar', 'tupper-kejar']`. `secretLetters` parameters go (callers updated).

- [ ] **Step 1: Write failing tests**
  - A runner's view of a Full game with a dropped box: all four zones null; JSON of the view contains neither the box's lat nor any slip token; `me` has no `side_quest_at` key. (Review Focus 5)
  - Organiser's view: `tupperware.dikejar.legendary` matches the pick, `dropped` null before the drop and set after, `suggested` inside the play area.
  - `placeItems` organiser: two red Tupperware steps; marshal: none. `packItems` labels as above for one and two sides.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS**; `npm run typecheck`.
- [ ] **Step 5: Commit** — `feat: Tupperware in the organiser's view and kit lists; players lose the ? zones`

### Task 7: Your Kit slip sheet and print page

**Files:**
- Create: `app/src/screens/PrintSlips.tsx`, `app/src/screens/PrintSlips.test.tsx`
- Modify: `app/src/screens/YourKit.tsx`, `app/src/screens/YourKit.test.tsx`, `app/src/App.tsx` (route `/print/slips`)

**Interfaces:**
- Consumes: `listSlips`, `makeSlipSheet`, `slipQr`, `loadOrganiserSession`, `qrcode`.
- Produces: Your Kit's card-set section is replaced by **Tupperware slips**: counts `Dikejar: N unused · Kejar: N unused`, a `Print slips` button opening `/print/slips`, a `Make a new sheet` button; when either side has ≤ 2 unused, the line `Print a new slip sheet` shows. `/print/slips` renders every **unused** slip as an A4 grid (mockup `SlipSheet`): QR of `slipQr(token)`, label `Dikejar #04`, cut lines, footer `Any unused slip of the right side works.`; prints with the browser's print.

- [ ] **Step 1: Write failing tests** (mock `call` as the files already do): Your Kit shows `Dikejar: 10 unused` after load; `≤ 2` shows `Print a new slip sheet`; `Make a new sheet` calls `makeSlipSheet` then reloads; PrintSlips renders 20 labels and the footer, and no used slip.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: Your Kit prints Tupperware slip sheets`

### Task 8: Walk the Park hides the Tupperwares

**Files:**
- Modify: `app/src/screens/WalkPark.tsx`, `app/src/screens/WalkPark.test.tsx`; `app/src/game/PackList.tsx` (labels only, if it hard-codes card tones)

**Interfaces:**
- Consumes: `view.kit.places` (`tupper-*` steps from Task 6), `view.tupperware`, `dropTupperware`.
- Produces: the `SECRET` table's four colour entries become one `red` entry; the step card shows `Hide the Dikejar Tupperware` / `Kejar`, `SECRET · n OF N`, the hide panel copy from the mockup (`Any unused Dikejar slip inside`, good spots: wakaf, angsana roots, map board, outdoor gym; avoid: surau or places of worship, drains, private property, bins), the suggested spot on the map as the step's pin, and a `Drop it here` button calling `dropTupperware { side, lat, lng }` with the phone's current fix.

- [ ] **Step 1: Write failing tests**: an organiser walk with both sides on shows two red steps in order D then K; tapping `Drop it here` calls `dropTupperware` with `side: 'dikejar'` and the fix; a marshal's walk shows no Tupperware step.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: Walk the Park hides each side's Tupperware`

### Task 9: Side quest and slip scans on the phone

**Files:**
- Create: `app/src/game/SideQuest.tsx`, `app/src/game/SideQuest.test.tsx`, `app/src/game/Decrypt.tsx`
- Modify: `app/src/game/scan.ts`, `app/src/game/PowerUpHand.tsx` (`slipMessage`), `app/src/game/ChaseLayout.tsx` (an `openScanner(hint?: string)` path), `app/src/screens/RunnerChase.tsx`, `app/src/screens/ChaserChase.tsx`, their tests

**Interfaces:**
- Consumes: `View.sideQuest`, `isSlipQr`.
- Produces:
  - `scanTarget`: `isSlipQr(text)` → `{ action: 'claim', body: { qr: text } }` for both roles.
  - `slipMessage(r: SlipClaimResult): string`: `wrong` → `Bukan ini. That was your try.`; `no-try` → `You've used your try this game.`; `not-yours` → `Not your Tupperware.`; `taken` → `Dah kena ambil.`; `too-far` → `Get closer.`; `no-box` → `Nothing here.`; others via `stashMessage`.
  - `<SideQuest gameCode onFound onClose />`: full-screen card, red badge `SIDE QUEST`, title `Find the Tupperware`, both through `<Decrypt text />` (scrambled glyphs settling left to right over ~900 ms; reduced motion shows the text at once), a buzzing dot, one `Found` button, a close ×. While mounted on Android (`'vibrate' in navigator`), `navigator.vibrate([300, 200, 300])` every 2 s; stops on unmount.
  - Chase screens show `SideQuest` when `view.sideQuest` and not dismissed (`localStorage` key `sidequest-closed:<code>`, wrapped in try/catch); a small `Side quest` chip in the header reopens it. `Found` opens the scanner with hint `Scan the slip inside`.

- [ ] **Step 1: Write failing tests**
  - `scan.test` (or the file's existing test): slip QR → claim for runner and chaser.
  - `slipMessage` each reason → the exact copy above.
  - `SideQuest`: renders `Find the Tupperware` (after timers), calls `onFound` on `Found`; calls `navigator.vibrate` while mounted when present, and clears the interval on unmount.
  - RunnerChase: `view.sideQuest` true → side quest shown; close → hidden and chip shown; reload with the key set → hidden.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: side quest card on the phone, and slip scans with their answers`

### Task 10: The unlock takeover, with the Bomoh card

**Files:**
- Create: `app/src/game/TupperwareTakeover.tsx`, `app/src/game/TupperwareTakeover.test.tsx`, `app/src/game/doodles/Tupper.tsx`
- Modify: `app/src/game/PowerCard.tsx` (add `bomoh` front), `app/src/game/LuckyDip.tsx` (`dipFor`), `app/src/index.css` (or wherever `.power-card` lives: takeover + flip styles from the mockup's `index.html`)

**Interfaces:**
- Consumes: `ClaimResult` with `slip: true`; `PowerCard`.
- Produces:
  - `PowerCard kind="bomoh"`: purple (`--bomoh-*`), coconut sticker, line `Every Dikejar shows at the next 2 pings`. **Ruling:** moved from the spec's polish phase into core, because the unlock needs a card front for Bomoh.
  - `<TupperwareTakeover kind={LegendaryKind} onDone />`: ~7 s; the `Tupper` sticker shakes, lid flies; a card back (`PowerCard faceDown`, recoloured to the legendary's colour, scribbles around) rises, then flips to the front with scribbles in its colour; ends with a button `Keep it` (`dato`, `ring`) or `It's working!` (`bomoh`, `hijau`) that calls `onDone`; `Tap to skip` anywhere jumps to the end state. One `navigator.vibrate?.([400, 80, 400])` at the flip. Reduced motion: no shake/flip, the front shows at once.
  - `dipFor`: `c.ok && c.slip` → `<TupperwareTakeover kind={c.kind} onDone={done} />` for all four kinds (before the existing branches).

- [ ] **Step 1: Write failing tests**: `dipFor('KEJAR:SLIP:x', { ok: true, kind: 'ring', slip: true }, …)` renders the takeover; after fake timers the button reads `Keep it` for `ring` and `It's working!` for `hijau`; a tap before the end shows the end state at once; `PowerCard kind="bomoh"` renders its line.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, porting from `mockups/tupperware/main.tsx` (`Tupper`, `Takeover`, `LegScribbles`, `BomohCard`).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: the Tupperware unlock: the box opens, the card flips, and Bomoh gets a card`

### Task 11: Retire the secret colour cards

**Files:**
- Modify: `app/api/_lib/actions.ts`, `app/src/screens/HostLobby.tsx`, `app/src/game/cardNotice.ts`, `app/src/game/Map.tsx`, `app/src/game/ChaseLayout.tsx`, `app/src/App.tsx`, `app/src/screens/HostNew.tsx` (notices only), the matching tests
- Delete: `app/src/screens/PrintCard.tsx`, `app/src/screens/PrintCard.test.tsx`, `app/src/game/printLinks.ts` (if only PrintCard uses it)

**What goes:**
- Server: the card lifecycle — `settleLobbyCard`, `settleAllLobbyCards`, `assignFreeCard`, `reassignCard`, `recheckExpiredLobby`, `cardOrFallback`, `freeCard`, `cardHolders`, `releaseCard`, `needsRecheck`, the `NO_FREE_*` notices, and the actions `listSecretCards`, `retireSecretCard`, `reprintSecretCard`, `confirmSecretCardPrinted`, `secretCardCode`, `dropDatoSeri`, `dropBomoh`, `dropRing`, `dropHijau`; their calls in `create`, `setMode`, `start`, `state`. `create`/`setMode` no longer return a card notice.
- Client: the lobby's card notices (`NO_CARD_LINE`, `PICK_UP_LINE`, `STARTED_NO_CARD_LINE`), `cardNotice.ts`, the `#print-card` route, the map's `?` zone layers and props.

**What stays (spec §6, release ruling):** `claimDato`/`claimBomoh`/`claimRing`/`claimHijau` and the `KEJAR:DATO|BOMOH|RING|HIJAU` scan routes, so a game started on a card finishes on it. The `secret_cards` table and its store methods stay (rows hidden, not deleted). A follow-up removes these once no game holds a card.

- [ ] **Step 1: Update tests first**: delete tests of the removed actions and notices; add: `create` Full with both sides on → no stash on any legendary and no `notice`; a legacy started game with `dato_stash.code` still claims by `KEJAR:DATO:<code>`.
- [ ] **Step 2: Run, expect FAIL** (the create assertion: a stash is still assigned).
- [ ] **Step 3: Remove** the code listed above.
- [ ] **Step 4: Run the whole suite, typecheck, lint** — `npm test && npm run typecheck && npm run lint` → all pass.
- [ ] **Step 5: Commit** — `refactor: retire the secret colour cards; games already started finish on theirs`

---

## Phase 2 · Polish

### Task 12: Dato Seri's Settle doodle

**Files:**
- Create: `app/src/game/doodles/SettleDoodle.tsx`
- Modify: `app/src/game/SettlePanel.tsx` (doodle on top), the settled moment (where `settle` success shows today), tests

**Produces:** the mockup's `SettleDoodle` (identity card, wrinkly purple RM100 note tucked under it, black doodled `100` as paths, no real emblem); on a successful settle a moment: the card slides in, the note slips away, `Duit kopi sampai.` fades in as plain text, then the existing freed line and `Okay`. Reduced motion: still image, text shown.

- [ ] **Step 1: Failing test**: a successful settle renders `Duit kopi sampai.` and the freed names; `SettlePanel` renders the doodle (`aria-hidden` svg present).
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: Dato Seri's Settle gets its duit kopi doodle`

### Task 13: Organiser safeguards

**Files:**
- Modify: `app/src/game/BeforeYouStart.tsx` (lobby checklist), `app/src/screens/MarshalLive.tsx` or `Results.tsx` (organiser's ended view; whichever renders the organiser's results), tests

**Produces:**
- Lobby: for each side on with `view.tupperware[side].dropped === null`: `Kejar Tupperware not dropped yet` with a `Drop it` link to the walk. Start stays allowed.
- After the game, organiser only: for each side whose box was dropped and not claimed: `Kejar's Tupperware wasn't opened. Bawa balik!` with a small map pin at `dropped`.

- [ ] **Step 1: Failing tests**: lobby view with Kejar undropped shows the line and link; ended organiser view with an unclaimed Dikejar box shows the bring-home line; players never see either.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** (the ended organiser view needs `tupperware` kept in `ended`; check Task 6 leaves it). **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat: lobby reminder for an undropped Tupperware, and bawa balik after the game`

---

## Release notes for the organiser

- Run `supabase/migrations/0024_tupperware.sql` before deploying Task 1's code.
- Print one slip sheet from Your Kit before the first Tupperware game.
