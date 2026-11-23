# Playtest Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner's playtest batch:
- a real pick from five rarity-backed cards, with a Sike empty card
- rarity colours
- the Penjara reel gated by distance and time, with words on its slots
- the slip numbers named in setup
- rejoin and add-back for players
- the Tupperware notification renamed, recoloured and auto-fading
- the middle-path legendary colours
- the setup map's doodle markers and number badges
- buttons kept on screen
- a home guide for both sides, a power-up FAQ, and iPhone alert steps

**Architecture:**
- **The pick.** It's server-authoritative, like the existing claim. A scan reserves the station by inserting the
  power-up row at once (so the lock and the once-per-station rule are unchanged), with a provisional kind. It also
  stores a 5-card **deal** beside the row. The client gets only the back colours.
- **Resolving a deal.** `pickCard` resolves the deal by setting the row's kind to the picked card. A Sike resolves to
  kind `sike`, already used. An unanswered deal is resolved at its provisional index after 60 s.
- **The view.** It hides a card while its deal is open.

**Tech Stack:**
- React 19 + motion
- Vercel functions (`app/api/_lib/actions.ts`)
- MemoryStore and SupabaseStore, and a Supabase migration
- MapLibre v5
- Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-11-24-playtest-batch-design.md` (mockup: `app/mockups/pick/`, launch config `pick-mockup`)

## Global Constraints

- Rarity colours: common volt `#C6FF3D`, rare blue `#3D9BFF`, epic purple `#B47CFF`. Sike grey `#8A8A8E`.
- Rarity table:
  - common: shield, cloak, decoy, flare, focus
  - rare: cheese, grab, toll
  - epic: toyol, along, combo
- **2 Sike cards per deck set.** A Sike's back is one of the three rarity colours, chosen at random for each deal.
- **Pick timing:** 10 s to pick on the client. The server auto-resolves a deal 60 s after the scan.
- **Penjara reel:** shown only within 30 m of Penjara (the existing `atJail` reach). Locked until
  `caught_at + 60 000 ms`.
- Reel words, verbatim: HAILAT, ALMOST, NEARLY, ALAMAK, ADUH, NOPE, TRY LAH, HAMPIR, NEXT TIME. The lime slot reads
  SETTLED with `SettleDoodle`.
- **Legendaries, middle path:**
  - frame, crown, scribbles, eyebrow and name in `--legendary-1/2/3`
  - the art circle in each card's own colour: Dato `#FFD60A`, Ring `#FFA94D`, Hijau `#3FA86B`, Bomoh `#F5F0E6`
  - the Hijau takeover stays full-screen green
- Tupperware markers and notification boxes are yellow on both sides. The Tupperware doodle stays red.
- **Copy:**
  - "Side quest" → "Tupperware"
  - "SIDE QUEST COMPLETE" → "TUPPERWARE OPENED"
  - Join, game already started: "The game has started. Ask the organiser for a rejoin link."
  - Marshal button: "Rejoin link", with the hint "Lost their tab? Send them this."
  - Removed list button: "Add back"
  - Feed line: "{name} is back in"
- Info notifications fade after 8 000 ms. Action notifications (check-in, SOS, catch) never fade.
- All new text is in Kejar Hand. Keep each file's existing line endings (some are CRLF). MapLibre stays on v5. No new
  runtime dependencies.

## Review Focus

1. **The deal leaking cards:** no response, view field or feed line names a dealt card before `pickCard` answers.
   Tested in Task 7.
2. **Picking twice or racing:** a second `pickCard` on the same deal, or one after auto-resolve, returns the same
   card and never adds a second power-up. Tested in Task 7.
3. **A Sike and the slot:** a Sike never occupies the slot, so the player can claim at another station straight away.
   Tested in Task 7.
4. **The reel on the border:** a runner walks from 31 m to 29 m with the reel lock over. The reel appears without a
   reload. Tested in Task 4.
5. **No unused slip on a side:** the setup step says so and links to printing, and never shows "slip null". Tested
   in Task 5.

---

### Task 1: Buttons always on screen

**Files:**
- Modify: `app/src/styles/tokens.css` (`.btn`, `.btn-pair`, `.home-join-row`, any rule a check finds overflowing)
- Modify: any screen with inline widths that push past 100%

- [ ] **Step 1:** Start `kejar-local-test`. At 320×640 and 375×812, visit Home, Join, HostNew (every step), HostLobby,
  ArenaSetup, Lobby, RunnerChase, ChaserChase, Jail, Paused and Results. On each screen run
  `document.documentElement.scrollWidth > innerWidth` and list every `.btn` whose `getBoundingClientRect()` goes
  past 0 or `innerWidth`.
- [ ] **Step 2:** Fix each overflow at its source. Rules: `max-width: calc(100% - 32px)`, `box-sizing: border-box`, and
  no fixed widths above 288 px. A button stays centred (auto margins), the same as everywhere else.
- [ ] **Step 3:** Re-run Step 1. Expected: no screen scrolls sideways, and every button is inside the screen and within
  3 px of centre.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `fix: buttons stay on screen and centred on every phone width`.

### Task 2: Legendary middle path and yellow Tupperware markers

**Files:**
- Modify: `app/src/styles/tokens.css` (legendary card, slot and takeover rules; new `--hijau-screen` token)
- Modify: `app/src/game/PowerCard.tsx`, `app/src/screens/HostNew.tsx` (`SIDE_LEGENDARIES`)
- Modify: `app/src/game/Map.tsx` (`DIAMOND`, `FLOAT_GEM`, the `pins` icon expressions, `pins-pulse`), `app/src/game/SideQuest.tsx`
- Test: `PowerCard.test.tsx`, `Map.test.tsx`, `HostNew.test.tsx`

**Interfaces:**
- Produces: `export const LEGENDARY_OWN: Record<LegendaryKind, string>` in `app/src/game/PowerCard.tsx`, holding the
  four own colours from Global Constraints.

- [ ] **Step 1: Failing tests:**
  - `PowerCard` with `kind="bomoh"` renders `.pc-art` with an inline `--own: #F5F0E6`, and its class doesn't include
    `bomoh` in a way that sets a purple frame. Assert that `LEGENDARY_OWN.bomoh === '#F5F0E6'`.
  - `Map.test`: a pin with `side: 'kejar'` uses `dia-gold` (flat) and `gem-gold-float` (3D).
  - `HostNew`: each legendary row has a yellow border and a dot with its own colour.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - All legendary frames use `--legendary-*`.
  - `.pc-art` takes `background: color-mix(in srgb, var(--own) 38%, transparent)`, ringed as in the mockup.
  - Add `--hijau-screen: #3FA86B`, and point `.hijau-takeover` and its panel colours at it.
  - Map pins use the gold images for both sides. `pins-pulse` uses `#FFD60A` for both.
  - Leave `dia-purple` and `gem-purple-float` unused, but keep the files.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit
  `feat: legendaries share Dato Seri's yellow frame, own colour inside; Tupperware markers yellow`.

### Task 3: The Tupperware notification

**Files:**
- Modify: `app/src/game/ChaseLayout.tsx:132`, `app/src/game/SideQuest.tsx`, `app/src/game/TupperwareTakeover.tsx:104`, `tokens.css` (`.sq-*`)
- Create: `app/src/game/useAutoHide.ts`
- Test: `SideQuest.test.tsx`, `TupperwareTakeover.test.tsx`, `app/src/game/useAutoHide.test.ts`

**Interfaces:**
- Produces: `useAutoHide(key: string | null, ms = 8000): boolean`. It returns `true` while the notice named by `key`
  is still showing, flips to `false` after `ms`, and starts again when `key` changes.

- [ ] **Step 1: Failing tests:**
  - The chip text is `Tupperware`, and the card's `aria-label` and decrypt text are `Tupperware`.
  - The takeover eyebrow is `TUPPERWARE OPENED`.
  - With fake timers, the side quest card is gone after 8 000 ms, and the chip stays so it can be reopened.
  - `useAutoHide` flips at 8 000 ms and resets on a new key.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The card's box and eyebrow use `--legendary-2`, with black text on both sides. The Tupper doodle keeps its red.
  - Apply `useAutoHide` to the side quest card and to info banners. List each banner you touched in the commit body.
    Never apply it to CheckinBanner, SOS or catch screens.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: Tupperware notification, yellow, fades by itself`.

### Task 4: The Penjara reel

**Files:**
- Modify: `app/api/_lib/actions.ts` (`pullReel`, about line 1505), `app/shared/penjara.ts`
- Modify: `app/src/game/PenjaraReel.tsx`, `app/src/screens/Jail.tsx:187-200`, `app/shared/views.ts` (the `reel` field)
- Test: `actions` tests for `pullReel`, `PenjaraReel.test.tsx`, `Jail.test.tsx`

**Interfaces:**
- Produces:
  - `export const REEL_OPEN_AFTER_MS = 60_000` and `export const REEL_WORDS = ['HAILAT', 'ALMOST', 'NEARLY', 'ALAMAK', 'ADUH', 'NOPE', 'TRY LAH', 'HAMPIR', 'NEXT TIME'] as const`, both in `shared/penjara.ts`
  - `View['reel']` gains `opensAt: string`: the ISO time of `caught_at + REEL_OPEN_AFTER_MS`

- [ ] **Step 1: Failing tests:**
  - `pullReel` at `caught_at + 59 s` returns `{ ok: false, reason: 'reel-too-soon', readyInMs: 1000 }` and doesn't spend
    the pull. At `+60 s`, it pulls.
  - `PenjaraReel` shows a countdown (`opens in 0:42`) before `opensAt`, and the lever after.
  - The nine black slots render the nine words, in order, in a `.reel-word` element. The lime slot renders `SETTLED`
    and the settle doodle. With `freedOnce`, all ten slots are words (the first word repeats).
  - **Review Focus 4:** in `Jail`, the reel hides when the live distance goes above 30 m and shows again at 29 m,
    with no remount of the page.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Show the reel while `distance <= 30` (from the WalkGuide's `onDistance`), not when the sticky `arrived` is set.
  - Add `'reel-too-soon': 'The reel opens a minute after you're caught.'` to `REFUSALS`.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit
  `feat: Penjara reel only at Penjara, a minute after the tag, with words on every slot`.

### Task 5: Name the slips in setup

**Files:**
- Modify: `app/api/_lib/actions.ts` (new action `nextSlips`, registered in the actions map)
- Modify: `app/src/screens/WalkPark.tsx:210`, `app/src/game/PackList.tsx`, the Tupperware step in `HostNew.tsx`
- Test: actions tests, `WalkPark.test.tsx`, `PackList.test.tsx`

**Interfaces:**
- Produces: action `nextSlips { organiserToken } → { dikejar: number | null; kejar: number | null }`. For each side it
  returns the lowest `number` among this organisation's slips with `used_at === null && bound_game_id === null`.

- [ ] **Step 1: Failing tests:**
  - With slips dikejar 1 (used), 2 and 3, and kejar 1 (bound) and 2, `nextSlips` returns `{ dikejar: 2, kejar: 2 }`.
  - The walk card reads `Put Dikejar slip 2 inside.`
  - The pack list shows `Dikejar slip 2 · Kejar slip 2`.
  - **Review Focus 5:** with no kejar slip, the step reads `No Kejar slip left. Print more.` with a link to the print
    page, and the text `null` never appears.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** The HostNew Tupperware step names both numbers in one line: `This game: Dikejar slip 2 ·
  Kejar slip 2`.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: setup names this game's Tupperware slips`.

### Task 6: Rejoin link and Add back

**Files:**
- Modify: `app/api/_lib/actions.ts` (new action `restorePlayer`; the `join` refusal at about line 243)
- Modify: `app/api/_lib/store.ts`, `supabaseStore.ts` (`restorePlayer(playerId): Promise<boolean>`)
- Modify: `app/src/game/MarshalTools.tsx:360-390`
- Test: actions tests, `MarshalTools.test.tsx`, `Join.test.tsx`

**Interfaces:**
- Produces: action `restorePlayer { code, …marshal credentials, playerId } → { ok: true; inviteToken: string }`. It
  clears `removed_at`, adds a `restored` event whose feed text is `{name} is back in`, and makes a phone-move invite
  (the same as `createPhoneMove`).

- [ ] **Step 1: Failing tests:**
  - `restorePlayer` on a removed runner clears `removed_at`, returns an `inviteToken`, and `redeemPhoneMove` with it
    works.
  - On a player who isn't removed, it returns 400.
  - The feed shows `Ana is back in`.
  - `join` after the start answers 409 `The game has started. Ask the organiser for a rejoin link.`
  - MarshalTools shows `Rejoin link` with the hint line, and a `Removed` section with `Add back`. Tapping it calls
    `restorePlayer`, then shows the share button for the link.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** In SupabaseStore, `update players set removed_at = null where id = $1 and removed_at is not null`.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: rejoin links and adding a removed player back`.

### Task 7: Deals, rarities and Sike on the server

**Files:**
- Create: `supabase/migrations/0027_deals_and_sike.sql`
- Modify: `app/shared/types.ts` (`PowerUpKind` gains `'sike'`; new `Deal`, `Rarity`), `app/shared/deck.ts`, `app/shared/powerups.ts`
- Modify: `app/api/_lib/actions.ts` (`claim`; new action `pickCard`; auto-resolve in `advance`), `store.ts`, `supabaseStore.ts`
- Modify: `app/shared/views.ts` (`hand`, `deckLeft`, new `deal`)
- Test: `app/shared/deck.test.ts`, the actions tests, `app/shared/views.test.ts`

**Interfaces:**
- Produces, in `shared/deck.ts`:
  - `export type Rarity = 'common' | 'rare' | 'epic'`
  - `export const RARITY: Record<Exclude<PowerUpKind, 'sike' | LegendaryKind>, Rarity>`
  - `export const SIKE_PER_SET = 2`
  - `deckFor(mode, side, sets)`: now includes `SIKE_PER_SET` × `'sike'` per set
  - `export function dealFrom(deck: PowerUpKind[], takenThisRound: PowerUpKind[], rng: () => number, n = 5): PowerUpKind[]`:
    picks `n` cards at random from the deck minus this round's taken cards. Start a new round when fewer than `n` are
    left.
  - `export function backOf(card: PowerUpKind, rng: () => number): Rarity`
- Produces, in `shared/types.ts`:
  `export interface Deal { id: string; game_id: string; player_id: string; powerup_id: string; cards: PowerUpKind[]; backs: Rarity[]; auto_index: number; picked_index: number | null; picked_at: string | null; created_at: string }`
- Produces, in the store:
  - `createDeal(d: Omit<Deal, 'id' | 'picked_index' | 'picked_at'>): Promise<Deal>`
  - `deals(gameId): Promise<Deal[]>`
  - `resolveDeal(dealId, index, at): Promise<{ deal: Deal; powerUp: PowerUp } | null>`: atomic, and only the first
    call changes anything. It sets the power-up's kind to `cards[index]`. For a Sike it also sets `used_at` and
    `consumed_at` to `at`.
- Produces, as actions:
  - `claim` on a station returns `{ ok: true, deal: { id: string; backs: Rarity[] } }` and no kind
  - `pickCard { code, token, dealId, index } → { ok: true; kind: PowerUpKind; double?: true } | { ok: false; reason: 'no-deal' }`
- Produces, in the view:
  - `View['deal']: { id: string; backs: Rarity[]; endsAt: string } | null` for `me`'s open deal
  - `hand` leaves out any power-up whose deal is open
- The migration:
  - adds `'sike'` to `powerups_kind_check`
  - creates the `deals` table: columns as in `Deal`, an FK to powerups, a unique `powerup_id`, an index on `game_id`
  - adds `resolve_deal(p_deal uuid, p_index int, p_at timestamptz)`, which does the atomic update in one statement
    and is granted to service_role only, like `claim_station`

- [ ] **Step 1: Failing tests:**
  - `deck.test`: `deckFor('full','runner',1)` has 12 cards, 2 of them `sike`. `dealFrom` never returns a taken card;
    with a seeded rng it gives 5 cards from the remainder; past the end of a round it reshuffles.
  - `RARITY.toyol === 'epic'` and `RARITY.grab === 'rare'`.
  - **Review Focus 1:** a station `claim` response's JSON has no `kind`. `view.hand` doesn't include the reserved
    card. `view.deal.backs` has length 5. No feed line names the card.
  - `pickCard` index 3 sets the power-up kind to `cards[3]`, and only then does the `powerup` feed event appear.
  - **Review Focus 2:** a second `pickCard` returns the same `kind`, and the game still has one power-up row for it.
  - Auto-resolve: at `created_at + 60 s`, the next action resolves the deal at `auto_index`.
  - **Review Focus 3:** picking a `sike` leaves `hand` empty, and the same player can claim another station at once
    (no `hand-full`). The station is still locked for 60 s, and the once-per-player rule holds.
  - Combo: a combo-ready player who picks a Sike stays combo ready. PKP twins and combo apply at the pick, not the
    scan.
  - `deckLeft` counts Sikes.
- [ ] **Step 2:** Run `npx vitest run shared api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `claim`:
    - judge as today
    - draw the count with `drawCard` as today
    - `cards = dealFrom(deck, takenThisRound, ctx.rng)`
    - `auto = floor(rng*5)`
    - `claimStation` with `kind = cards[auto]` when it isn't a Sike, otherwise the first non-Sike card in `cards`,
      or the deck's first non-Sike card if all 5 are Sikes (the row's kind must be a real card until it's resolved)
    - `createDeal`
  - `takenThisRound` is this side's station power-ups after resolution, ordered by `claimed_at`: the last
    `(draws - 1) % deck.length` of them.
  - Abang Grab keeps its seeded offer and never offers `sike`.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: station scans deal five cards; the pick decides; Sike is empty`.

### Task 8: The pick screen and rarity cards

**Files:**
- Modify: `app/src/game/LuckyDip.tsx` (rewrite the stages), `app/src/game/PowerCard.tsx`, `app/src/game/PowerUpHand.tsx` (`ClaimResult`, `CardPop`, slot frame)
- Modify: `app/src/styles/tokens.css` (rarity backs, rarity fronts, `.power-card.sike`), `app/src/game/powerInfo.ts` (Sike name and line)
- Test: `LuckyDip.test.tsx`, `PowerCard.test.tsx`, `PowerUpHand.test.tsx`

**Interfaces:**
- Consumes: Task 7's `claim` → `{ deal }`, `pickCard`, `View['deal']`, `RARITY`, `Rarity`.
- Produces:
  - `PowerCard` takes `rarity?: Rarity` for a back
  - a front takes its rarity from `RARITY[kind]`
  - `kind="sike"` renders the grey Sike face: `sike!` and `you got an empty power up`
  - `LuckyDip({ deal, station, deckLeft, onPick, onDone })`, where `onPick(index): Promise<{ kind: PowerUpKind; double?: true }>`

- [ ] **Step 1: Failing tests:**
  - The fan renders 5 backs, with classes `r-common`, `r-rare` or `r-epic` from `deal.backs`.
  - Tapping card 2 calls `onPick(2)`, flips it to the returned kind, and shows `Got {name}!`.
  - The hand's slot stays empty until `onDone`.
  - With no tap, after 10 000 ms `onPick` is called with an index. The text `too slow, the deck picked for you`
    shows, and there's no `.dip-spotlight` element anywhere.
  - A Sike result shows `sike!` and `your scan is used, station locks 60s`, and the slot stays empty.
  - A rare front has a blue frame, and an epic one purple.
  - Reopening the game with an open `view.deal` shows the fan again.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Port the mockup's motion (`app/mockups/pick/main.tsx`): the pick flips in place, the rest
  slide down, and the timeout card rises from below and flips. Respect `useReducedMotion()`.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: pick screen with rarity backs, real picks and Sike`.

### Task 9: Setup map: doodle markers and number badges in 3D

**Files:**
- Modify: `app/src/game/PlaceMap.tsx` (layers around lines 60-210), `app/src/game/mapMarkers.ts`
- Create: `app/public/map/num-1.png` … `num-20.png` with the existing `app/scripts/build-map-markers.py` (black circle,
  volt 2 px edge, Kejar Hand digit, 2x pixels)
- Test: `PlaceMap.test.tsx`, `mapIcons.test.ts`

- [ ] **Step 1: Failing tests:**
  - In 3D, the jail point draws a `float-jail` symbol layer with `penjara` and the start point a `float-start` layer
    with `start`. Both have stems and shadows, like the gems.
  - Stations in setup draw a `station-badge` layer with `icon-image` `['concat', 'num-', ['to-string', ['get', 'n']]]`
    above the gem, in 3D and in flat.
  - The game map (`Map.tsx`) has no `station-badge` layer.
  - `mapIcons` finds `num-1.png`…`num-20.png`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement, and generate the images.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: setup map shows Penjara, start and station numbers in 3D`.

### Task 10: Home guide for both sides, the FAQ, iPhone alerts

**Files:**
- Modify: `app/src/screens/Home.tsx:154`, `app/src/game/HowToPlay.tsx`
- Create: `app/src/game/faq.ts`, `app/src/game/PowerFaq.tsx`
- Modify: `PowerUpHand.tsx` (`CardPop` gets a `?` that opens the FAQ for that kind), `app/src/game/AlertsCard.tsx`
- Test: `Home.test.tsx`, `app/src/game/PowerFaq.test.tsx`, `AlertsCard.test.tsx`

**Interfaces:**
- Produces: `export const FAQ: Record<Exclude<PowerUpKind, 'sike' | LegendaryKind>, { q: string; a: string }[]>`, with
  2–3 entries for each kind.

- [ ] **Step 1: Failing tests:**
  - Home's guide has a `Dikejar` / `Kejar` toggle, and picking Kejar renders HowToPlay with `side="chaser"`.
  - Every non-legendary kind has 2–3 FAQ entries.
  - `CardPop`'s `?` opens the entries for that kind.
  - How to Play links to the FAQ list.
  - `needs-install` shows the four steps: `Tap Share`, `Add to Home Screen`, `Open kejar. from the icon`,
    `Tap Turn on`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Write the FAQ text in short plain sentences, from `powerInfo.ts`, `shared/powerups.ts`
  and the rules doc. The owner reviews it.
- [ ] **Step 4:** Run `npx vitest run`, expect PASS. Commit `feat: home guide for both sides, power-up FAQ, iPhone alert steps`.

### Task 11: Check it in the app

- [ ] **Step 1:** Run `npx tsc -b` and `npx vitest run`. Expected: no errors, all PASS.
- [ ] **Step 2:** Start `kejar-local-test` and play a local game. Take screenshots of:
  - a scan → the pick → the slot
  - a Sike
  - the timeout pick
  - the reel away from Penjara, then at Penjara with its countdown, then with the words and SETTLED
  - the slips named in setup
  - Add back with its rejoin link
  - the Tupperware notification fading
  - the legendary cards
  - setup map badges in 3D
  - the home guide for Kejar
  - the FAQ
- [ ] **Step 3:** Add an entry to `docs/HANDOFF.md`: migration 0027 to run, plus what changed. Commit
  `docs: HANDOFF entry for the playtest batch`.
