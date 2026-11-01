# Plan C1: motion foundation, the one-screen chase layout, the SOS icon and sheet, the two-part feed, and the check-in banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the runner and chaser chase screens into the agreed one-screen layout: a top bar, a status row with the SOS icon, the map as the hero, and a dock with the slot, one Scan button and a one-line ticker. Replace the SOS/Report bar with the small SOS icon and its hold-to-send sheet, including the "What's happening?" follow-up. Make every feed line plain English with a "what it means for you" line. Show the check-in banner's states.

**This is the first of three motion plans:**
- **C1** (this plan): foundation, chase screen, SOS, feed and check-in banner.
- **C2:** the catch moments (stamp, bars, walk guide, the `2× MISSED` plate), the lucky dip and station claim, the slot screens, doodle stickers, the marker scribble component, and the ripple ping.
- **C3:** how-to-play, results (victory lap, scribble, share ticket, rating, post-game report), the lobby ticket and role scramble, the marshal SOS takeover, phase changes, the logo loader, hold-to-confirm, and the lock-screen status notification.

**Architecture:**
- **Motion for React** (`motion` on npm) is added once, at the app root: `LazyMotion` with `domAnimation`, `MotionConfig reducedMotion="user"`, and the `m` components from `motion/react-m`.
- **New screen pieces** live in `app/src/game/`: `ChaseLayout.tsx`, `SosIcon.tsx` (with its sheet), `Ticker.tsx` and `CheckinBanner.tsx`.
- **The view (`app/shared/views.ts`) gains** `FeedItem.means`, `FeedItem.act` and `FeedItem.label` (the two-part feed), plus `View.checkin` (the banner's state).
- **The server gains** an `sosDetails` action. SOS details are stored as a new `sos-details` event and merged into the marshal's alert text.

**Tech Stack:** Vite 8, React 19, TypeScript, Vitest, Testing Library, Motion for React (`motion`, latest stable at install time; import from `motion/react` and `motion/react-m`).

**Spec:**
- `docs/superpowers/specs/2026-10-30-kejar-motion-design.md`:
  - §3 library and ground rules;
  - §6 SOS: §6.0 the icon, §6.1 the bar inside the sheet, §6.2 "What's happening?", §6.3 accessibility;
  - §7a the check-in moment;
  - §8.2 the two-part feed, and its table of lines;
  - §8.6 the chase screen.
- `docs/superpowers/specs/2026-10-30-kejar-rules.md` wins conflicts.
- Mockups: `docs/superpowers/mockups/2026-10-30-motion/17-chase-screen.html`, `22-sos-icon.html`, `6-checkin.html` (option B), `7-checkin-states.html`, `3-sos.html`.

**Out of scope (C2/C3/D):**
- stickers in the ticker (C1 shows the mono label for every line; C2 swaps power-up lines to stickers);
- the chaser snapshot on the check-in banner (Full switch, Plan D);
- Toyol, Ah Long and Dato Seri feed lines (Plan D);
- `5 minutes left` (C3 phase changes);
- the post-game report (C3).

**Until C3 lands,** the SOS sheet keeps a small `Report a player` link (see Task 5).

## Global Constraints

- **Ground rules (motion §3):**
  - animate **transform and opacity only**;
  - **no looping animation** on screens a pocketed phone shows, except the brief two-pulse "sent" on your own dot;
  - brand colours only (Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3`); Geist and Geist Mono;
  - `navigator.vibrate` where available, and nothing depends on it;
  - every animation tells the player something.
- **Reduced motion:** `MotionConfig reducedMotion="user"` at the root; everything must still be readable and usable with motion off.
- **Layout numbers (motion §6.0, §8.6):**
  - a **44 px top bar**;
  - a **status row** 8 px below it, with 28 px chips stacking on the left and the **28 px SOS icon** alone on the right;
  - **12 px side margins** everywhere;
  - **no scrolling** during the chase on a 360 × 640 screen;
  - **the map is at least half the screen**;
  - **nothing covers the SOS icon.**
- **One loud thing at a time** (rules §7): don't play two big animations together.
- **Plain English on screen**, with the exact copy given in the tasks. Local names stay (Kejar, Dikejar, Penjara and the power-up names).
- **SOS sends immediately** at the end of the 1 s hold. Details are optional and come after.
- **No database migration** in this plan.
- Preserve each file's line endings. `npm test` and `npm run typecheck` green before every commit, plus `npm run build` at the end of each UI task. Never commit `New Text Document.txt`, `app/.env.local` or `graphify-out/`.

## Review Focus

1. **A pocket bump or a stray tap must never send an SOS.** Tapping the icon only opens the sheet; a hold shorter than 1 s sends nothing. (Task 5.)
2. **SOS details for someone else's SOS, or an old one,** must be refused: only the sender's own SOS from the last 5 minutes. (Task 4.)
3. **The check-in banner never says "Checked in" when the server would count a miss.** It uses the same window (alert to reveal, stretched by pauses) and the same "since last release" rule as auto-jail. (Task 3.)
4. **The feed's "→ what it means" lines never reveal secrets:** no runner power-up use (Gostan, Ponteng), and no "who" for Mat Rempit and Pak Guard. (Task 2.)
5. **The single Scan button** sends a station code to `claim`, the Penjara code to `jailbreak` (runners) and a tag to `catch` (chasers). Anything else shows a clear error and calls nothing. (Task 6.)

---

### Task 1: Motion at the root

**Files:**
- Modify: `app/package.json` (`npm install motion`)
- Modify: `app/src/App.tsx`: wrap the app in `<LazyMotion features={domAnimation}><MotionConfig reducedMotion="user">…</MotionConfig></LazyMotion>` (import from `motion/react`)
- Test: `app/src/App.test.tsx`

- [ ] **Step 1:** Write a failing test: `App` renders a child that uses `m.div` from `motion/react-m` without error. Use a tiny test-only component inside the test file, rendered through the same provider export.
  - Export the wrapper from `app/src/game/motion.tsx` as `MotionRoot({ children })`, so the test and `App` share it.
- [ ] **Step 2:** Run: `cd app && npx vitest run src/App.test.tsx`. Expected: FAIL (`./game/motion` missing).
- [ ] **Step 3:** `npm install motion`, create `app/src/game/motion.tsx` with `MotionRoot`, and use it in `App`.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck && npm run build`. Expected: all pass. The build's JS size grows by less than 40 KB gzip; note the number in the ledger.
- [ ] **Step 5:** Commit: `feat: Motion for React at the app root, honouring reduced motion`.

### Task 2: The two-part feed: what happened, and what it means for you

**Files:**
- Modify: `app/shared/views.ts`: the feed item shape and `feedText`; the reveal's ping event gains a `missed` count (`app/api/_lib/actions.ts`)
- Test: `app/shared/views.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `FeedItem = { at: string; text: string; means: string | null; act: boolean; label: string | null }`.
  - `means` is for the **viewer's side**: a runner sees the Dikejar line, a chaser the Kejar line. Marshals and the organiser get `null`.
  - `act` is true when the line needs the viewer to act now.
  - `label` is a short mono tag for the ticker: `PING`, `CATCH`, `FREE`, `2×`, or the power-up's display name.
- **The ping event's data gains `missed`:** the number of free runners not seen at the reveal (cloaked runners count as missed, matching what chasers see).

**Exact lines** (motion §8.2; Toyol, Ah Long and legendary come in Plan D):

| Event | `text` | Dikejar `means` | Kejar `means` | `act` for | `label` |
|---|---|---|---|---|---|
| `ping` | `Ping: {seen} Dikejar seen, {missed} missed check-in(s).` (omit `, … missed …` when 0; singular "check-in" for 1) | `Kejar now know roughly where you were.` | `Fresh circles are on your map.` | — | `PING` |
| `used` flare | `A Kejar used Mat Rempit.` | `Check in now. An extra ping lands in 30 s.` | `Extra ping in 30 s. Get close to the circles.` | Dikejar | `Mat Rempit` |
| `used` focus | `A Kejar used Pak Guard.` | `At the next ping, anyone within 75 m of that Kejar shows exactly. Move away.` | `Next ping shows Dikejar near them exactly.` | Dikejar | `Pak Guard` |
| `caught` | `{chaser} caught {tag}.` | `{tag} is walking to Penjara. {free} Dikejar still free.` | `Nice. {free} Dikejar left to find.` | — | `CATCH` |
| `shielded` | `{tag} blocked a catch with Durian.` | `{tag} is still free. Their Durian is used up.` | `That catch didn't count. {tag} has no Durian now.` | — | `Durian` |
| `jailbreak` | `{name} freed {n} Dikejar from Penjara.` | `Penjara is empty again.` (or `{left} still inside.` when some remain) | `{n} more Dikejar are loose near Penjara.` | — | `FREE` |
| `auto-jailed` | `{tag} missed 2 check-ins in a row.` | `{tag} went to Penjara. Check in when your phone buzzes, or you're next.` | `One less to find. {tag} is in Penjara.` | — | `2×` |

- `{free}` and `{left}` are counted **as of now** (the view's counts), not at the event. Record this as a ruling.
- Other events keep today's single line with `means: null`, `act: false`, `label: null`.
- **The marshal feed** keeps `text` only.
- **Secrecy:** runner power-up uses (`decoy`, `cloak`, `shield` switched on) never produce a line, as today.

- [ ] **Step 1:** Write failing tests in `views.test.ts`:
  - each row above for a runner viewer and a chaser viewer (`text`, `means`, `act`, `label`);
  - a marshal gets `means: null`;
  - a `used` `cloak` still produces nothing.

  In `actions.test.ts`: the ping event at a reveal carries `missed`.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/views.test.ts api/_lib/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update older tests asserting the old single-line texts to the new `text`.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: every feed line says what it means for your side`.

### Task 3: The check-in state in the view

**Files:**
- Modify: `app/shared/views.ts`: `View.checkin`
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Consumes: `checkedIn` (`app/shared/checkins.ts`), `pingTimes` and `nextReveal` (`clock.ts`), `Player.freed_at`.
- Produces: `View.checkin: { state: 'early' | 'open' | 'in' | 'missed'; alertAt: number; revealAt: number; missedInRow: 0 | 1 } | null`.
  - It's **only for a free runner during the chase**; otherwise `null`. `alertAt` and `revealAt` are for the **next scheduled** ping.
  - **`early`:** `now < alertAt`, and the last scheduled ping was not missed (or there wasn't one).
  - **`open`:** `now >= alertAt`, but my latest location isn't inside the window yet.
  - **`in`:** my latest location is inside `[alertAt, revealAt]`.
  - **`missed`:** before the next window opens, if the **last revealed scheduled ping** counted for me (its alert was at or after `max(chaseStart, freed_at)`) and my latest location at its reveal wasn't inside its window. `missedInRow` is then 1. A second miss would have auto-jailed me, so it never reaches 2 here.
- Uses the same window and the same since-release rule as `autoJailDue`. **Don't re-derive them;** reuse `checkedIn` and `pingTimes`.

- [ ] **Step 1:** Write failing tests:
  - `early` at reveal − 2 min;
  - `open` at reveal − 30 s with no fresh location;
  - `in` with a location at reveal − 20 s;
  - `missed` after a revealed ping with no check-in, before the next window;
  - **not `missed`** if that ping's alert came before `freed_at`;
  - `null` for a chaser, a jailed runner, and during hiding;
  - **a pause inside a window** keeps `in` for a check-in sent before the pause.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/views.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: the view says whether you're checked in for the next ping`.

### Task 4: SOS details ("What's happening?")

**Files:**
- Modify: `app/shared/types.ts`: `EventType` adds `'sos-details'`
- Modify: `app/shared/alerts.ts`: merge details into the SOS alert's text
- Modify: `app/api/_lib/actions.ts`: `sos` returns `sosId`; new `sosDetails` action
- Test: `app/shared/alerts.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces:
  - **`sos`** returns `{ ok: true, notified, sosId }`, where `sosId` is the new event's id. A repeat within `SOS_REPEAT_MS` returns the earlier `sosId`.
  - **`sosDetails({ code, token, sosId, reason, withId? })`** → `{ ok: true }`, or `{ ok: false, reason: 'not-yours' }` when the SOS isn't the caller's or is older than 5 minutes.
    - `reason` is one of `'hurt' | 'lost' | 'unsafe' | 'dispute' | 'other'`, with labels `Hurt`, `Lost`, `Unsafe player`, `Catch dispute`, `Something else`.
    - `withId` is only used for `unsafe` and `dispute`, and must be a player in the game.
  - It writes an event `{ type: 'sos-details', actor_id: me, target_id: withId ?? null, data: { sosId, reason, withName } }` and a safety record `{ type: 'sos', player_id: me, target_id: withId ?? null, data: { game_code, follows: sosId, reason, with_name } }`. **No new push.**
- **Alert text:** `alertsFrom` folds the latest `sos-details` for an SOS into its text:
  - `SOS from Aina #07: Catch dispute with Ben`;
  - `SOS from Aina #07: Hurt` (no `with` part).

- [ ] **Step 1:** Write failing tests:
  - the alert text with and without `with`;
  - `sos` returns `sosId` (and the same one on a repeat);
  - `sosDetails` on your own recent SOS updates the alert text and adds one safety record;
  - someone else's SOS → `not-yours`; an SOS 6 minutes old → `not-yours`;
  - an unknown `reason` → 400.
- [ ] **Step 2:** Run: `cd app && npx vitest run shared/alerts.test.ts api/_lib/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: SOS details say what's happening and who it's with`.

### Task 5: The SOS icon and its sheet

**Files:**
- Create: `app/src/game/SosIcon.tsx` and `app/src/game/SosIcon.test.tsx`
- Modify: `app/src/screens/GameScreen.tsx`: replace `SafetyBar` with `SosIcon` on **every player screen** (chase, Penjara, hide, paused)
- Delete: `app/src/game/SafetyBar.tsx` and its test, once nothing imports them
- Modify: `app/src/styles/*.css` as needed

**Interfaces:**
- Consumes: the `sos` (returns `sosId`) and `sosDetails` actions (Task 4); `report` (unchanged); `view.reportable`.
- **The icon:**
  - a `<button aria-label="Help and SOS">`, a 28 px Volt circle with a black "!" (21 px glyph, bold stroke), and a 3 px dark ring;
  - **fixed** at `top: 52px; right: 12px` of the screen, above everything (z-index over map, banners and sheets).
- **The sheet** slides up from the bottom (`m.div`, transform only) over a dimmed screen. Tapping the dimmed area or `Cancel` closes it.
  - **Asking:**
    - `Need help?` / `Hurt, lost, or something unsafe? Hold the bar for 1 second and every marshal is alerted with where you are.`;
    - the hint `HOLD 1 S · MARSHALS COME TO YOU`;
    - a 52 px Volt bar labelled `sos` (lowercase);
    - `Cancel`.
  - **Holding:**
    - the bar empties to dark and a lime fill grows left to right over **1000 ms** (scaleX), with lime ripple rings;
    - `navigator.vibrate(30)` at the start;
    - letting go **before 250 ms** shows `HOLD FOR 1 SECOND TO SEND SOS`, and later than that shows `LET GO TOO EARLY · HOLD 1 S`. **Nothing is sent.**
  - **Keyboard:** Space or Enter held on the focused bar behaves the same (motion §6.3; the app-setting fallback is left for later, recorded as a ruling).
  - **Sent** (at 1000 ms, call `sos` with the current coordinates, waiting up to 1.5 s for GPS as today):
    - `sos sent` (lowercase), then `Marshals alerted. What's happening? (optional, helps the marshal)`;
    - reason chips `Hurt · Lost · Unsafe player · Catch dispute · Something else`;
    - after `Unsafe player` or `Catch dispute`, `With who?` with a chip per `view.reportable` player;
    - each tap calls `sosDetails`;
    - a lime line drains over **20 s**, then the sheet closes itself;
    - `navigator.vibrate([200, 100, 400])`.
    - If `notified === 0`: `SOS saved, but no marshal has alerts on. Find a marshal or call for help.` in place of `Marshals alerted.`
  - **`Report a player`** (small link under Cancel, only until C3's post-game report): opens today's report form inside the sheet.

- [ ] **Step 1: Write failing tests** with fake timers:
  - the icon has its accessible name;
  - **tap → sheet, with no `sos` call** (`call` not called);
  - **a hold of 600 ms** → no call, and the `LET GO TOO EARLY` hint;
  - **a quick tap of the bar** → the `HOLD FOR 1 SECOND` hint;
  - **a hold of 1000 ms** → `sos` called once, and the `sos sent` state;
  - **chips:** `Catch dispute` → `With who?` → a player chip calls `sosDetails` with `{ sosId, reason: 'dispute', withId }`;
  - **auto-close** after 20 s;
  - **keyboard:** holding Space for 1000 ms sends;
  - the `notified: 0` copy;
  - `GameScreen` shows the icon on the chase, Penjara, hide and paused screens, and no longer renders `SafetyBar`.
- [ ] **Step 2:** Run: `cd app && npx vitest run src/game/SosIcon.test.tsx src/screens/GameScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: SOS becomes a corner icon with a hold-to-send sheet and what's-happening chips`.

### Task 6: The one-screen chase layout, the ticker, one Scan, and the check-in banner

**Files:**
- Create:
  - `app/src/game/ChaseLayout.tsx`: the top bar, status row, map and dock;
  - `app/src/game/Ticker.tsx`: the one line, plus the full feed sheet;
  - `app/src/game/CheckinBanner.tsx`: the runner's banner states;
  - `app/src/game/scan.ts`: `scanTarget(text: string, role: 'runner' | 'chaser'): { action: 'claim' | 'jailbreak' | 'catch'; body: object } | { error: string }`;
  - tests for each.
- Modify: `app/public/sw.js` (check-in notification copy and URL) and `app/api/_lib/actions.ts` (the check-in push payload gains `revealAt`)
- Modify: `app/src/screens/RunnerChase.tsx` and `app/src/screens/ChaserChase.tsx` to use `ChaseLayout`; `app/src/game/PowerUpHand.tsx` becomes the slot only (no scan button), and the `BreakOut` scanner in `Jail.tsx` is no longer used on the chase screen.
- Test: the new test files, plus the updated `RunnerChase.test.tsx`, `ChaserChase.test.tsx` and `PowerUpHand.test.tsx`.

**Interfaces:**
- Consumes: `FeedItem` (Task 2), `View.checkin` (Task 3), the SOS icon from GameScreen (Task 5), `stationFromQr`, `tagIdFromQr` and `JAIL_QR` (`app/shared/ids.ts`).
- **`scanTarget`:**
  - a station code → `claim`;
  - for runners, `KEJAR:JAIL` → `jailbreak`;
  - for chasers, a tag → `catch`;
  - anything else → `{ error: "That's not a station or Penjara code" }` (runners) or `{ error: "That's not a tag or station code" }` (chasers).

**The layout:**
1. **Top bar (44 px):** `DIKEJAR #07` or `KEJAR · BEN` on the left, the game clock centred, the free count (`9 free`) on the right.
2. **Status row:** left-aligned chips that stack downwards:
   - runners: `Check in in 2:14` (from `checkin.alertAt`), or nothing while the banner is showing;
   - chasers: `Next ping 1:42 · last 3:18 ago`;
   - runners: `● Kejar within 100 m` (lime outline) when `chaserNearby`.
   The SOS icon stays at the right of this row; it's rendered by GameScreen and isn't part of `ChaseLayout`.
3. **The map** fills the space between the status row and the dock.
4. **The dock** (bottom, 12 px margins):
   - row 1: the slot (`PowerUpHand`, flex 1) and a 78 px **`Scan`** button (runners, white) or a big lime **`Scan tag`** (chasers);
   - row 2: the **ticker**.

**The ticker:**
- One 30 px line: the newest feed item's `label` in a small mono box, then `text`, then `→ {means}` in lime, truncated with an ellipsis.
- A `+N` count of items since the sheet was last opened.
- Items with `act` get a lime outline and **one** `navigator.vibrate(60)` when they first appear.
- **Tapping it opens the feed sheet:** every item with its `means`. The sheet stops at the dock's top edge.

**The check-in banner** (runners only; it drops over the top of the map below the status row, `m.div` sliding in, and the map stays visible underneath):

| State | Banner |
|---|---|
| `in` | Lime, with a black tick: `Checked in` · `Kejar see you in m:ss`. Your dot pulses twice. Footer `You can pocket your phone now.` One `navigator.vibrate(80)` on entering `in`. |
| `open` | Lime: `Check in now` · `Kejar see you in m:ss` (sending is automatic while the page is open). |
| `early` | Not shown (the chip carries it). If the phone was opened by the check-in push before the window, a dark banner with a lime outline: `Check-in opens in m:ss` · `Keep Kejar open and it checks you in by itself`. |
| `missed` | White: `Missed this check-in` · `Kejar saw your last spot, marked "missed"`. Then `MISSED IN A ROW` with two bars (one filled) · `Miss the next one too and you're sent to Penjara.` |

**Opened by the push** means the page was opened from the check-in notification. Task 6 makes the notification link to `/g/{code}?checkin=1`; the banner shows `early` only when that query flag is present, and then removes it from the URL with `history.replaceState`.

**The check-in push itself** (motion §7a) is still the old 30 s copy:
- **`public/sw.js`:** the notification becomes title `Ping in 45s — check in!` and body `Tap to check in. Kejar see you at {h:mm}.`. The time is formatted on the phone from `data.revealAt`, and the URL is `/g/{code}?checkin=1`.
- **Server:** the check-in push payload (`pushTo(..., { type: 'checkin', code, seq })` in `advance`) gains `revealAt` (ms).
- **Test:** `actions.test.ts` asserts the captured check-in push payload includes `revealAt` equal to the ping's reveal time. `sw.js` has no test harness; record that as a ruling and check the notification by hand on a phone at the next playtest.

- [ ] **Step 1: Write failing tests**
  - **`scanTarget`:** every row above.
  - **`Ticker`:** the newest line with its label and `→ means`, `+2` after two more, a lime outline for `act`, and tapping opens the sheet with all items.
  - **`CheckinBanner`:** each state's copy.
  - **`RunnerChase`:**
    - the layout has the top bar text, the chip, the map, the slot, `Scan` and the ticker, with no `Break them out` button;
    - scanning the Penjara code calls `jailbreak`, and a station code calls `claim`.
  - **`ChaserChase`:** `Scan tag` with a tag calls `catch`, and with a station code calls `claim`.
  - **Layout:** a render at 360 × 640 has no element taller than the viewport inside the chase screen (`document.scrollingElement.scrollHeight <= 640` in jsdom with the container sized; skip it if jsdom can't measure, and record the skip as a ruling).
- [ ] **Step 2:** Run: `cd app && npx vitest run src/game src/screens`. Expected: FAIL.
- [ ] **Step 3:** Implement. Update older tests that relied on today's stacked layout, the separate break-out button or the station scan button inside `PowerUpHand`.
- [ ] **Step 4:** Run: `cd app && npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 5:** Check it in the browser:
  - start the dev server via `.claude/launch.json` with `preview_start`;
  - open a runner and a chaser chase screen with mocked state, if there's a dev route, or the deployed preview;
  - at 360 × 640, check there's no scroll, the SOS icon sits on the status row, the banner states look right, and the ticker opens the sheet;
  - take a screenshot for the ledger.
- [ ] **Step 6:** Commit: `feat: one-screen chase layout with a ticker, one Scan, and the check-in banner`.

### Task 7: Hand-off

- [ ] Add a short "Plan C1" status block to `docs/HANDOFF.md`: what shipped, and that **no migration is needed**. Commit (`docs: Plan C1 hand-off`).
