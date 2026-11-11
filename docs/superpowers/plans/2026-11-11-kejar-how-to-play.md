# How to Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the how-to-play briefing story. When the organiser starts it from the lobby, every player's phone opens full-screen story cards with self-drawing doodle scenes, one story per side and mode. Players tap `I'm ready`, and the lobby shows who's ready. This replaces the manual `Brief the players` tick.

**Architecture:**
- **Server:** one migration, `supabase/migrations/0018_how_to_play.sql`, adds `games.briefed_at`, `players.brief_opened_at` and `players.brief_ready_at`, plus three actions.
- **Content:** card content is plain data in `app/shared/howToPlay.ts`, chosen by side, mode and the snapshot switch.
- **Story player:** `app/src/game/HowToPlay.tsx` plays the cards.
- **Scenes:** each scene is an SVG component in `app/src/game/doodles/`, ported from the agreed mockup, with the sketchy double line, line boil and a 1.5 s draw-on.

**Tech Stack:** TypeScript, React, Vitest/jsdom, Supabase/Postgres, Vercel, and the Motion library (reduced motion respected).

**Spec:**
- `docs/superpowers/specs/2026-11-11-kejar-gameplay-audit-fixes-design.md`, Plan 3 (§3.1): full drawn scenes, replaces the manual tick, never names Dato Seri or Bomoh, honest about Luar Garisan, reflects the new Durian and the 10-second rescue.
- `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §8.8: the format, the cards, the doodle style.
- The mockup `docs/superpowers/mockups/2026-10-30-motion/18-how-to-play.html` holds the scenes and the card copy.

## Global Constraints

- **Copy:** English with a light Malaysian twist, and no em-dashes in any player- or organiser-facing string.
- **Platform:**
  - The server is the authority.
  - Free tiers only; keep the single `api/game.ts` function.
  - Both stores implement every new method, and the game and player selects include the new columns.
- **Migration `0018_how_to_play.sql`:**
  - idempotent, with one `begin; … commit;`;
  - any new functions revoked from `public, anon, authenticated` and granted to `service_role`;
  - the owner runs it before merge.
- **Secrecy:** no card, scene or line names Dato Seri or Bomoh (rules doc §9b, the Bomoh spec §2c). Marshals get no story.
- **Format (motion §8.8):**
  - full-screen story cards, with a segmented progress bar at the top and a `CORE` or `FULL` badge;
  - tapping the right half goes forward and the left half goes back;
  - each card moves on by itself after `7_000` ms;
  - each card has one doodle scene, one headline (Geist 800, ending in a lime full stop) and one line;
  - the last card has `I'm ready`;
  - it can be reopened during the game from a `How to play` link;
  - it never blocks Start.
- **Doodle style (motion §8.8):**
  - stick-figure scenes; Dikejar wear a white armband and Kejar a lime vest;
  - every stroke is drawn twice, the second faint and slightly offset;
  - line boil: the wobble filter's seed changes about 7 times a second, off with reduced motion;
  - each scene draws itself in about 1.5 s, then stays still;
  - apply the wobble filter to the whole `<svg>`, never to an inner `<g>` (an inner group hid the strokes in Chrome).
- **Exact card copy:** headlines as written, each rendered with a lime full stop. Lines are verbatim, with the bold parts in `<b>`.
  - **Dikejar, Core (7 cards):**
    1. `You're Dikejar` / `Hide, keep moving, and <b>stay free until time runs out</b>. Kejar get released after the hide time.`
    2. `When it buzzes, check in` / `Phone in your pocket. When it buzzes, <b>open Kejar within 45 s</b>. Kejar then see roughly where you were.`
    3. `Miss two, you're out` / `One missed check-in is free. <b>Miss two in a row and you go to Penjara</b> automatically. Outside the play area at two check-ins in a row? You're out too.`
    4. `Tag ripped? Stop` / `If a Kejar rips your armband tag, stop and <b>walk to Penjara</b>. No running, no arguing: use SOS. At Penjara you get <b>one pull of the reel</b>. One slot sets you free.`
    5. `Break them out` / `Scan the Penjara card, then <b>stay within 30 m for 10 seconds</b>. Kejar get warned, so be quick. Each person can only be freed once.`
    6. `Grab power-ups` / `Scan a <b>station</b> to draw a power-up. You hold <b>one at a time</b>, so use it before you grab another.` The scene shows this mode's runner stickers.
    7. `Anything wrong? SOS` / `Hurt, lost, or a dispute? <b>Tap the ! in the corner, then hold for 1 second.</b> A marshal comes to you.`
  - **Kejar, Core (6 cards, 7 with the snapshot switch on):**
    1. `You're Kejar` / `<b>Wait at the start</b> until you're released. Then catch every Dikejar before time runs out.`
    2. `Pings show circles` / `Every few minutes, Dikejar show as <b>fuzzy circles</b> where they checked in. Dashed means they missed.`
    3. `Rip, then scan` / `<b>One hand, upper arm, tag only.</b> No grabbing or tackling. Then scan the tag to make it count.`
    4. *(only when `settings.chaserSnapshot` is on)* `They can see you too` / `When their phone buzzes, Dikejar see <b>where you were at that moment</b>. Move after the buzz.`
    5. `Stop the rescue` / `When a Dikejar starts a rescue, <b>you get 10 seconds</b>. Catch them at Penjara and nobody gets out.`
    6. `Grab power-ups` / `Scan a <b>station</b> to draw a power-up. You hold <b>one at a time</b>. Hit a Durian? <b>You can't catch that Dikejar again.</b>` The scene shows this mode's chaser stickers.
    7. `Anything wrong? SOS` / `Hurt, or a dispute? <b>Tap the ! in the corner, then hold for 1 second.</b> Never sort it out physically.`
  - **Full mode:** the same cards. The power-up scene shows the Full deck's stickers for that side, taken from the existing sticker list (`FULL_STICKERS` and the runner and chaser decks), but never the legendaries.
  - **The ready button:** `I'm ready`. The lobby status reads `{n} of {total} ready`, with each player shown as `reading`, `ready` or `not opened`.
  - **The organiser's button** replaces the manual tick: `Brief the players` with the note `Opens how to play on every phone`. Once started, the note becomes `{n} of {total} ready`.

## Review Focus

1. **A player who joins after the briefing has started.**
   - Expected: the story opens for them on joining.
   - Pinned in Task 1 (the view says the briefing is open for them) and Task 2.
2. **A player whose role changes after they read the story.**
   - Expected: if the organiser swaps a player's side after they tapped ready, the player sees the new side's story the next time they open it, and their ready status stays.
   - Pinned in Task 2.
3. **The organiser taps `Brief the players` twice, or after Start.**
   - Expected: it's idempotent (the first `briefed_at` stays). After Start the button is gone, but `How to play` still reopens the story for players.
   - Pinned in Task 1.
4. **Marshals and the organiser.**
   - Expected: they never get the story pushed to their screen. The organiser can preview each side's story from the lobby.
   - Pinned in Task 1 (the views) and Task 2.
5. **Reduced motion.**
   - Expected: there's no line boil, and the scenes appear fully drawn. The cards still advance and can still be tapped.
   - Pinned in Task 3.

---

### Task 1: Briefing state, actions and the lobby button

**Files:**
- Modify:
  - `supabase/migrations/0018_how_to_play.sql` (create it):
    - `alter table games add column if not exists briefed_at timestamptz`;
    - `alter table players add column if not exists brief_opened_at timestamptz`;
    - `alter table players add column if not exists brief_ready_at timestamptz`.
  - `app/shared/types.ts`: the new fields.
  - Both stores: the new columns in the selects and the create defaults; `setBriefedAt(gameId, atIso): Promise<boolean>`, which sets it only if null; and `markBrief(playerId, field: 'brief_opened_at' | 'brief_ready_at', atIso): Promise<void>`, which only sets a null field.
  - `app/api/_lib/actions.ts`:
    - `startBriefing({ code, organiserToken })` is organiser only and lobby only;
    - `briefOpened({ code, token })` and `briefReady({ code, token })` are for runners and chasers, in any phase.
  - `app/shared/views.ts`:
    - for players with a side, `briefing: { open: boolean; ready: boolean } | null`, where `open` is `briefed_at` set and the player not ready;
    - for the organiser's view, `briefing: { started: boolean; ready: number; total: number; status: Record<string, 'reading' | 'ready' | 'not opened'> }`;
    - marshals get `null`.
  - `app/shared/kit.ts` and `app/src/game/BeforeYouStart.tsx`:
    - the `brief-players` check is done when `briefed_at` is set (no longer a manual kit tick);
    - the check becomes the `Brief the players` button with the notes from Global Constraints.
- Test: `app/api/_lib/actions.test.ts`, `app/api/_lib/store.test.ts`, `app/shared/views.test.ts`, `app/src/game/BeforeYouStart.test.tsx`.

**Interfaces:**
- **Produces:**
  - the actions `startBriefing`, `briefOpened` and `briefReady`, each returning `{ ok: true }`;
  - the `briefing` view field as above, which Task 2 consumes;
  - a status of `ready` when `brief_ready_at` is set, `reading` when only `brief_opened_at` is set, and `not opened` otherwise.

- [ ] **Step 1: Write the failing tests.**
  - **`actions.test.ts`:**
    - `startBriefing` sets `briefed_at` once (a second call keeps the first time) and is refused for a player or a marshal and after Start;
    - `briefOpened` and `briefReady` set their fields once;
    - a marshal can't call them.
  - **`views.test.ts`:**
    - after `startBriefing`, a runner who joined later has `briefing.open === true` (Review Focus 1);
    - after `briefReady`, `open` is false;
    - the organiser sees `ready: 1, total: 3` and the statuses;
    - a marshal gets `briefing: null` (Review Focus 4).
  - **`store.test.ts`:** `setBriefedAt` returns true only once.
  - **`BeforeYouStart.test.tsx`:**
    - the button reads `Brief the players` with `Opens how to play on every phone`;
    - tapping it calls `startBriefing`;
    - once started, it shows `1 of 3 ready` and counts as done.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite and typecheck.
- [ ] **Step 5: Commit.** `feat: Brief the players opens how to play on every phone, with who's ready`

---

### Task 2: The story player and its content

**Files:**
- Create:
  - `app/shared/howToPlay.ts`: the card data from Global Constraints.
  - `app/src/game/HowToPlay.tsx`: the story player.
  - `app/src/game/doodles/index.tsx`: a placeholder `Scene` component keyed by scene id, returning a simple framed box until Task 3 fills it.
- Modify:
  - `app/src/screens/Lobby.tsx`: open the story when `view.briefing?.open` is true.
  - `app/src/screens/GameScreen.tsx` (or the chase screens' menu, wherever the existing in-game links live): a `How to play` link that reopens the story.
  - `app/src/game/BeforeYouStart.tsx`: a small `Preview: Dikejar · Kejar` link for the organiser.
- Test: `app/shared/howToPlay.test.ts`, `app/src/game/HowToPlay.test.tsx`, `app/src/screens/Lobby.test.tsx`.

**Interfaces:**
- **Consumes:** Task 1's `briefing` view field and the actions.
- **Produces:**
  - `export type SceneId = 'runner-free' | 'checkin' | 'miss-two' | 'tag-ripped' | 'break-out' | 'runner-powerups' | 'sos' | 'chaser-start' | 'ping-circles' | 'rip-scan' | 'snapshot' | 'stop-rescue' | 'chaser-powerups'`.
  - `export interface Card { scene: SceneId; headline: string; line: string }`. `line` holds the `<b>` markup, rendered with safe parsing of only `<b>`, never raw HTML.
  - `export function cardsFor(side: 'runner' | 'chaser', mode: 'core' | 'full', snapshot: boolean): Card[]`.
  - `export function stickersFor(side, mode): PowerUpKind[]`, which never includes `dato` or `bomoh`.
  - `<HowToPlay side mode snapshot onClose onReady? onOpened? />`:
    - it calls `onOpened` once on mount and `onReady` from `I'm ready`, then closes;
    - it has tap zones and the progress bar, and advances every 7 s;
    - its `CORE` or `FULL` badge reuses the existing `ModeBadge`.

- [ ] **Step 1: Write the failing tests.**
  - **`howToPlay.test.ts`:**
    - runner Core gives 7 cards with the exact headlines in order;
    - chaser Core gives 6 cards without the snapshot card, and 7 with it;
    - no card text matches `/dato|seri|bomoh|legend/i`;
    - no em-dashes;
    - `stickersFor` never includes `dato` or `bomoh`.
  - **`HowToPlay.test.tsx`:**
    - a right-half tap goes forward and a left-half tap goes back;
    - with fake timers, 7 s advances a card;
    - the progress bar has one segment per card;
    - the last card shows `I'm ready`, which calls `onReady` and `onClose`;
    - `onOpened` is called once;
    - `<b>` renders bold and other tags render as text.
  - **`Lobby.test.tsx`:**
    - with `briefing.open` true, the story opens and calls `briefOpened`, and `I'm ready` calls `briefReady`;
    - with the player's side swapped, the next open shows the new side's first headline (Review Focus 2).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass,** then run the full suite, typecheck and build.
- [ ] **Step 5: Commit.** `feat: the how-to-play story player and cards`

---

### Task 3: The doodle scenes

**Files:**
- Modify:
  - `app/src/game/doodles/index.tsx`: one SVG scene per `SceneId`, ported from the mockup `18-how-to-play.html` (read its scene SVG and helpers), plus the shared stroke helpers.
  - `app/src/styles/` (wherever the app's CSS lives): the draw-on keyframes.
  - `docs/HANDOFF.md`: a How to play entry with a bold **Before merging: run `supabase/migrations/0018_how_to_play.sql` in Supabase first.** line, and why (the game and player selects read the new columns). It also says that Brief the players now opens the story, and that marshals get none.
  - `docs/superpowers/specs/2026-10-30-kejar-rules.md`: mark the how-to-play card as built.
- Test: `app/src/game/doodles/doodles.test.tsx`.

**Interfaces:**
- **Consumes:** `SceneId` from Task 2.
- **Produces:** `<Scene id={SceneId} stickers?={PowerUpKind[]} />`, used by `HowToPlay.tsx`.
  - **The double line:** each path is rendered twice, the second at about 35% opacity and offset by about 1.5 px.
  - **Line boil:** one `<filter>` with `feTurbulence` plus `feDisplacementMap` on the root `<svg>`, whose `seed` changes about every 140 ms through a single interval that's cleared on unmount. There's no interval at all with reduced motion.
  - **Draw-on:** a `stroke-dasharray`/`stroke-dashoffset` animation of about 1.5 s. With reduced motion, the scene is fully drawn at once.
  - **The cast:** Dikejar have a white armband stroke and Kejar a lime (`var(--volt)`) vest.
  - **Power-up scenes** draw the given stickers using the existing sticker art (`app/src/game/stickerArt.ts`) where possible.

- [ ] **Step 1: Write the failing tests.**
  - every `SceneId` renders an `<svg>` with paths;
  - the filter sits on the root `<svg>`, not an inner `<g>`;
  - each drawn path has a faint twin;
  - with mocked reduced motion, no interval is set and no draw-on class is applied;
  - otherwise the seed changes after 140 ms with fake timers;
  - the runner power-up scene renders one sticker per given kind;
  - unmounting clears the interval.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement, and update both docs.**
- [ ] **Step 4: Run the full suite, typecheck and build.**
- [ ] **Step 5: Commit.** `feat: self-drawing doodle scenes for how to play; HANDOFF`
