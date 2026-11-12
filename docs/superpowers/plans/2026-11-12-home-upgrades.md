# Home Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add to the home screen:
- scan from home;
- a remembered name on the join form;
- a reconnect card that says where and what;
- a tip under the logo;
- the j's triple-tap backflip;
- a countdown in the owner's hand-drawn digits, counting to a planned start time that organisers set in the lobby.

**Architecture:**
- **Server:** the planned start lives in the game's jsonb `settings` as `startsAt`, set by a new organiser-only `setStartTime` action.
- **Home:** makes one `state` request for the reconnect game and derives a small status (park, phase, time left, start time) in a pure module.
- **Screens:** a `ReconnectCard` and a `DrawnNumber` render it. The tip and scan button sit in `Home`, and the backflip goes in the existing `HomeLogo` engine.

**Tech Stack:** React/TS + Vite, motion/react, Vitest + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-home-upgrades-design.md`, including its section "Calls made after the builder check". Mockup: `docs/superpowers/mockups/2026-11-12-home-upgrades/index.html`. The mockup still shows the bouncing power-up, the iPhone line on home and hold-to-sprint, which are cut: do not build them.

## Global Constraints

- **No new dependencies.** No em-dashes in player-facing copy.
- **Copy, exactly:**
  - the reconnect card's first line: `reconnect`, `back to the lobby` (lobby) or `see results` (ended);
  - statuses: `lobby`, `lobby · N players`, `hiding`, `chasing · N min left`, `ended`, `paused`;
  - countdown eyebrow: `GAME <CODE> STARTS IN`; at zero: `starting soon`;
  - the name hint: `✓ remembered from your last game`, and the link `not you?`;
  - the scan error: `That QR is not a kejar game.`;
  - the scan button's label: `scan qr`.
- **The production build must pass:** `cd app && npm run build`. This is the typecheck. `npx tsc --noEmit -p .` checks nothing here.
- **Wrap every storage read and write.** Home must work with storage blocked.
- **Reduced motion:** no backflip, and digits appear without drawing.
- **Numbers:**
  - triple tap within 600 ms;
  - backflip about 0.7 s;
  - digit draw about 0.55 s;
  - refresh every 30 s while the countdown shows, paused while the tab is hidden;
  - start time accepted from now up to 24 h ahead.

## Review Focus

1. **A phone clock several minutes off:** the countdown still shows the right time, because it is corrected by `view.now`. *Test in Task 4 (`homeStatus` with a skewed clock).*
2. **A `state` reply that is slow or fails with a 500:** the plain reconnect shows at once and stays. *Test in Task 5.*
3. **A start time that passes while you watch:** the countdown reads `starting soon` and stops ticking, without negative numbers. *Test in Task 3 (`formatLeft` at and below 0) and Task 6.*
4. **Tapping the tip or the countdown:** this never makes the j jump. *Test in Task 6.*
5. **An organiser picking 00:10 at 23:50:** that means tomorrow, and the server accepts it. *Test in Task 7 (`nextOccurrence`) and Task 1 (a time 20 min ahead across midnight).*

---

### Task 1: Planned start time on the server

**Files:**
- Modify: `app/shared/types.ts` (`Settings`, `DEFAULT_SETTINGS`)
- Modify: `app/api/_lib/actions.ts` (`settingsFrom`, `create`, new `setStartTime`, the `actions` map)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- **Produces:**
  - `Settings.startsAt?: string | null`. It is an ISO time; `DEFAULT_SETTINGS.startsAt = null`.
  - **Action `setStartTime`** with body `{ code, organiserToken, startsAt: string | null }`.
    - It returns `{ ok: true }`.
    - Errors: 403/401 from `requireOrganiser`, 409 `Game already started` from `requireLobby`, and 400 `Pick a start time in the next 24 hours`.

- [ ] **Step 1: Write the failing tests** in a new `describe('planned start time (home upgrades)')`, using `readyGame()`:
  - `setStartTime sets and clears the planned start`:
    - set `startsAt = new Date(now + 20 * MIN).toISOString()` and expect `{ ok: true }`;
    - the organiser's `state` view has `settings.startsAt` equal to it;
    - then `null` clears it.
  - `setStartTime rejects a past time and one more than 24 hours ahead`: `rejects(..., 400, 'next 24 hours')` for `now - MIN` and `now + 24 * 60 * MIN + MIN`.
  - `setStartTime is organiser-only and lobby-only`:
    - a player token gets a rejection with the same status `setMode` uses for non-organisers;
    - after `start`, it gets `rejects(..., 409)`.
  - `create never stores a start time and settingsFrom drops junk`:
    - create with `settings: { startsAt: 'banana' }`, and the view has `settings.startsAt` null;
    - `setMode` keeps a valid `startsAt` already set.
  - `a player sees the planned start in their view`: the runner's `state` has `settings.startsAt` set.
- [ ] **Step 2: Run them and watch them fail.** Run `cd app && npx vitest run api/_lib/actions.test.ts -t "planned start"`. Expected: FAIL (unknown action).
- [ ] **Step 3: Implement.**
  - **`settingsFrom`:** after the existing checks, set `s.startsAt` to `null` unless it is a string that parses with `Date.parse` to a finite number.
  - **`create`:** force `startsAt: null` before storing.
  - **`setStartTime`:**
    - follow `setMode`'s shape: `loadGame`, `requireOrganiser`, `requireLobby`;
    - validate `null`, or an ISO string with `now <= t <= now + 24h`;
    - store `settingsFrom({ ...loaded.settings, startsAt })`.

  Add it to the `actions` map.
- [ ] **Step 4: Run the tests.** Run `npx vitest run api/_lib/actions.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: organisers can set a planned start time`.

### Task 2: Remember my name

**Files:**
- Create: `app/src/game/nameMemory.ts`
- Create: `app/src/game/nameMemory.test.ts`
- Modify: `app/src/screens/Join.tsx`
- Modify: `app/src/screens/Join.test.tsx`
- Modify: `app/src/screens/MarshalRedeem.tsx`
- Modify: `app/src/screens/MarshalRedeem.test.tsx`

**Interfaces:**
- **Produces:** `loadName(storage: Storage): string`, `saveName(storage: Storage, name: string): void` and `forgetName(storage: Storage): void`.
  - The key is `kejar.name`.
  - All three are safe if storage throws: they return `''` or do nothing.

- [ ] **Step 1: Write the failing tests:**
  - **`nameMemory.test.ts`:** it round-trips a name; it trims; it returns `''` when storage throws; `forgetName` clears.
  - **`Join.test.tsx`:**
    - `prefills the name from the last game and says so`: seed `kejar.name = 'Aina'`. Expect the name input value `Aina`, and the text `✓ remembered from your last game`.
    - `not you? clears it`: the input becomes empty and `kejar.name` is gone.
    - `a successful join remembers the name`: mock `call` to resolve `{ token: 't' }`. After joining as `Zara`, `kejar.name` is `Zara`.
    - `the agreements still start unticked`.
  - **`MarshalRedeem.test.tsx`:** a successful redeem saves the name, and the form prefills it.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/game/nameMemory.test.ts src/screens/Join.test.tsx src/screens/MarshalRedeem.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Both screens start `name` from `loadName(localStorage)` and call `saveName` after a successful call, before navigating.
  - `Join` shows the hint and a `not you?` text button inside or beside the field, only while the name equals the remembered one.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: the join form remembers your name`.

### Task 3: Hand-drawn digits that draw themselves

**Files:**
- Create: `app/public/digits/digit-0.png` … `digit-9.png` and `app/public/digits/digit-paths.json`. Copy these from `docs/superpowers/mockups/2026-11-12-home-upgrades/`.
- Create: `app/src/game/drawn/DrawnNumber.tsx`
- Create: `app/src/game/drawn/DrawnNumber.test.tsx`
- Create: `app/src/game/drawn/formatLeft.ts`
- Create: `app/src/game/drawn/formatLeft.test.ts`
- Modify: `app/src/styles/tokens.css`

**Interfaces:**
- **Produces:**
  - **`formatLeft(ms: number): string`:**
    - `m:ss` under an hour and `h:mm:ss` from an hour;
    - rounds up to the next whole second, so `1` ms shows `0:01`;
    - `0` and below give `0:00`.
  - **`DrawnNumber({ text, height = 40 }: { text: string; height?: number })`:**
    - renders each character of `text`: the digits as hand-drawn SVGs, and `:` as two hand-drawn dots;
    - `role="img"` with `aria-label={text}`;
    - each digit is `data-testid="dg"`, with `data-digit` and the class `draw` while drawing in.

- [ ] **Step 1: Write the failing tests:**
  - **`formatLeft`:**
    - `270_000` gives `4:30`;
    - `59_001` gives `1:00`;
    - `3_725_000` gives `1:02:05`;
    - `1` gives `0:01`;
    - `0` and `-5000` give `0:00`.
  - **`DrawnNumber`:**
    - `renders each digit and names the whole number`: with `text="4:30"`, expect `getByRole('img', { name: '4:30' })` and three `dg` elements;
    - `only the digits that changed draw in`: rerender `4:29` from `4:30`. The `dg` for `4` has no `draw` class, while the `2` and `9` have it;
    - `the first render draws every digit`;
    - `with reduced motion nothing has the draw class`: mock `useReducedMotion` as in the `HomeLogo` tests.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/game/drawn`. Expected: FAIL.
- [ ] **Step 3: Copy the assets and implement.**
  - **Loading the paths.** Fetch `/digits/digit-paths.json` once (module-level promise). Until it arrives, show the plain digit images with no mask. In tests, mock `fetch` to return the JSON read from the public file. Or import it: moving the JSON to `app/src/game/drawn/digitPaths.json` and importing it is fine, and simpler.
  - **Each digit.** An SVG with a `<mask>` holding `<path class="pen" d=… pathLength="1" stroke-width={sw}>` over an `<image href="/digits/digit-N.png">`. This is the technique of the mockup's `digitSvg()`. Give the masks unique ids with `useId`.
  - **CSS.**
    - `.pen { fill:none; stroke:#fff; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1 }`;
    - `.dg.draw .pen { stroke-dashoffset:1; animation: pen .55s cubic-bezier(.45,.05,.4,1) forwards }`;
    - reduced motion: no animation.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: hand-drawn digits that draw themselves in`.

### Task 4: What home knows about your game

**Files:**
- Create: `app/src/game/homeStatus.ts`
- Create: `app/src/game/homeStatus.test.ts`

**Interfaces:**
- **Consumes:** `View` from `app/shared/views.ts`.
- **Produces:**
  - **The status type:**
    ```ts
    interface HomeStatus { code: string; park: string; phase: 'lobby' | 'hiding' | 'chasing' | 'ended'; paused: boolean; players: number | null; endsAt: number | null; startsAt: number | null; skewMs: number }
    ```
  - **`statusFrom(code: string, view: View, deviceNow: number): HomeStatus`:**
    - `skewMs = view.now - deviceNow`;
    - `players` is `view.roster.length` when the roster is non-empty, else null;
    - `startsAt` is parsed from `view.settings.startsAt`;
    - phase comes from `view.phase`, mapping any non-lobby, non-ended phase that isn't hiding to `chasing`. Check `View['phase']` for the exact values.
  - **`statusLine(s: HomeStatus, deviceNow: number): { title: string; detail: string; live: boolean }`:**
    - `title` is `back to the lobby`, `see results` or `reconnect`;
    - `detail` is ``${code} · ${park} · ${status}``, with the status from the Global Constraints;
    - minutes left are `ceil((endsAt - (deviceNow + skewMs)) / 60000)`;
    - `paused` wins over the phase;
    - `live` is true for hiding or chasing when not paused.
  - **`startsIn(s: HomeStatus, deviceNow: number): number | null`:** the ms to the start, using the skew. It is null unless the phase is lobby and `startsAt` is set.

- [ ] **Step 1: Write the failing tests:**
  - `a lobby game with a start time: back to the lobby, and the time to start corrected for a fast phone clock`: the phone is 3 min ahead of `view.now`, and `startsIn` still equals `startsAt - view.now`.
  - `chasing shows minutes left and is live`, giving `chasing · 12 min left`.
  - `paused wins over the phase and is not live`.
  - `ended reads see results`.
  - `hiding shows no time`.
  - `players only when the roster is non-empty`.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/game/homeStatus.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (pure functions).
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: home works out where your game is at`.

### Task 5: Reconnect card

**Files:**
- Create: `app/src/screens/ReconnectCard.tsx`
- Create: `app/src/screens/ReconnectCard.test.tsx`
- Modify: `app/src/styles/tokens.css`

**Interfaces:**
- **Consumes:** `statusFrom` and `statusLine` (Task 4); `credentials(code)` from `app/src/game/auth.ts`; `call` and `ApiError` from `app/src/game/api.ts`.
- **Produces:** `ReconnectCard({ href, code, onStatus }: { href: string; code: string; onStatus?: (s: HomeStatus | null) => void })`.
  - It fetches `state` once on mount, then every 30 s while `onStatus`'s latest status has a future start. Pause while `document.visibilityState !== 'visible'`, and refetch on `visibilitychange` to visible.
  - It calls `onStatus(status)` after each good reply, and `onStatus(null)` when it hides.
  - It renders `<a className="rc" href={href}>`: the title and an arrow, then the detail line in mono with a pulsing dot when `live`.
  - Before any reply, it shows `reconnect` and the code only.
  - On a 404, 401 or 403 it renders nothing.

- [ ] **Step 1: Write the failing tests**, mocking `../game/api`:
  - `shows the plain card at once, then the details`:
    - first, a link named `/reconnect/` with the text `ABC234`;
    - after the mocked `state` resolves with a chasing view, the text `ABC234 · Taman Tasik · chasing · 12 min left`.
  - `hides when the game is gone or you are not in it`, for 404, 401 and 403.
  - `stays plain on a 500`.
  - `reads back to the lobby in a lobby and see results when ended`.
  - `refreshes every 30 s while a start is coming, not when hidden`. Use fake timers, `toFake: ['setInterval','clearInterval','setTimeout','clearTimeout']`.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/screens/ReconnectCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement it, plus the `.rc` styles from the mockup:** the paper card, mono detail, and the pulsing green dot.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: the reconnect card says where your game is at`.

### Task 6: Home: scan button, tip, countdown and backflip

**Files:**
- Create: `app/src/game/tips.ts`
- Create: `app/src/game/tips.test.ts`
- Modify: `app/src/game/homeLogo/HomeLogo.tsx`
- Modify: `app/src/game/homeLogo/HomeLogo.test.tsx`
- Modify: `app/src/game/homeLogo/stride.ts` (backflip constants)
- Modify: `app/src/screens/Home.tsx`
- Modify: `app/src/screens/Home.test.tsx`
- Modify: `app/src/styles/tokens.css`

**Interfaces:**
- **Consumes:**
  - `ReconnectCard` (Task 5) and `startsIn` (Task 4);
  - `DrawnNumber` and `formatLeft` (Task 3);
  - `joinCodeFrom` from `HomeJoin.tsx`, and `Scanner`.
- **Produces:**
  - **`TIPS: { name: string; rest: string }[]`:**
    - each rendered as **name** + rest;
    - each entry is 60 characters or fewer and has no em-dash;
    - built from `INFO` in `app/src/game/powerInfo.ts` (the power-up name plus a short form of its effect), plus at least two rule lines from `app/shared/howToPlay.ts`. One is the lime vest and white armband line.
  - **`pickTip(rand: () => number): number`:** returns an index.

- [ ] **Step 1: Write the failing tests:**
  - **`tips.test.ts`:** every tip is 60 characters or fewer, has no `—`, and its name appears in `INFO` names or is a rule line. There are at least 6 tips.
  - **`HomeLogo.test.tsx`:**
    - `three quick taps backflip, and taps during the flip are ignored`. Tap at 0, 150 and 300 ms (advance the frames between). Then expect:
      - the `.run` group's transform to contain a `rotate(` of magnitude above 90 degrees part-way through;
      - `navigator.vibrate` called for the flip;
      - a fourth tap at 400 ms not to vibrate again;
      - after 1 s, `lift` close to normal and the legs running.
    - `no backflip with reduced motion`.
  - **`Home.test.tsx`:**
    - `the camera button opens the scanner and a good scan joins`. Mock `../game/Scanner` as a component that calls `onResult('https://x/join/abc234')` on a button. Expect `location.assign('/join/ABC234')`.
    - `a bad scan says so`, giving `That QR is not a kejar game.`.
    - `a tip shows under the logo and tapping it shows another`: use a fixed `rand` via `vi.spyOn(Math, 'random')`.
    - `tapping the tip never makes the j jump`: `navigator.vibrate` is not called.
    - `with a lobby game that has a start time, the countdown shows instead of the tip`. Mock `call` so `state` returns a lobby view with `settings.startsAt` 270 s after `view.now`. Expect the text `GAME ABC234 STARTS IN`, `getByRole('img', { name: '4:30' })`, and no tip.
    - `at the start time it reads starting soon`.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/game/tips.test.ts src/game/homeLogo src/screens/Home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`HomeLogo`.** Count taps in a 600 ms window, including ones ignored mid-jump. A third tap starts the flip.
    - Add `flipAt` beside `jumpAt`.
    - Add a `flip(sinceFlip)` term to `pose()` in `stride.ts`: over `FLIP_MS = 700`, lift on a sine to about `JUMP_LIFT * 1.1`, and `tilt` from 0 to -360 with ease-in-out.
    - Keep `pose`'s existing tests green, and add one for the flip's mid-point.
  - **`Home`:**
    - The `join game` row becomes the button plus a round `scanbtn` (52 px, lime, with the corner-brackets icon from the mockup, labelled `scan qr`).
    - Scanning opens `Scanner` in an overlay, with HomeLogo in `loading` mode while it's open.
    - `ReconnectCard` replaces the reconnect link, and its `onStatus` feeds the countdown.
    - The tip sits under the logo, positioned like the mockup. It shows only after the opening has finished, and never with the countdown.
    - The countdown ticks once a second from `startsIn(status, Date.now())`. At or below 0 it shows `starting soon`.
  - **Layers.** The tip and countdown sit above the logo's tap area (z-index), so taps on them don't reach `HomeLogo`.
- [ ] **Step 4: Run the tests and the build.** Run `npx vitest run`, then `npm run build`. Expected: all PASS, and the build succeeds.
- [ ] **Step 5: Commit.** Message: `feat: home gets a scan button, a tip, a countdown and the j's backflip`.

### Task 7: Organiser sets the planned start in the lobby

**Files:**
- Create: `app/src/game/plannedStart.ts`
- Create: `app/src/game/plannedStart.test.ts`
- Modify: `app/src/screens/HostLobby.tsx`
- Modify: `app/src/screens/HostLobby.test.tsx`

**Interfaces:**
- **Consumes:** the action `setStartTime` (Task 1).
- **Produces:**
  - **`nextOccurrence(hhmm: string, now: number): number`:** today at that local time, or tomorrow if that has already passed.
  - **`startsLabel(startsAt: number, now: number): string`:** for example `starts 7:30 pm · in 12 min`, `in 1 h 5 min` from an hour, and `starting soon` once passed.

- [ ] **Step 1: Write the failing tests:**
  - **`plannedStart.test.ts`:**
    - `nextOccurrence('00:10', 23:50 today)` is tomorrow 00:10;
    - `nextOccurrence('19:30', 18:00)` is today;
    - `startsLabel` for 12 min and for 65 min, and once passed.
  - **`HostLobby.test.tsx`:**
    - `the organiser sets a planned start`. Change the `planned start` time input to `19:30`. Expect `call('setStartTime', { code, organiserToken, startsAt: <ISO of nextOccurrence> })`. With a view whose `settings.startsAt` is set, the label shows.
    - `clear removes it`, giving `startsAt: null`.
- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/game/plannedStart.test.ts src/screens/HostLobby.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - A `planned start` row in the organiser's lobby, near the mode badge: an `<input type="time">` labelled `planned start`, the label when set, and a `clear` text button.
  - It calls `setStartTime` and then `refresh()`.
  - Errors show in the existing `ErrorText`.
- [ ] **Step 4: Run the tests and the build.** Run `npx vitest run`, then `npm run build`. Expected: PASS.
- [ ] **Step 5: Check it in the browser, then commit.**
  - Run `kejar-dev` and use Playwright at 375 × 812 to check:
    - home: the tip, a scan button that opens the camera overlay, and the backflip on three quick taps;
    - the join form prefill.

    The live reconnect and countdown need a real game: test them with a routed `state` reply, as in the earlier live check.
  - Commit with the message `feat: organisers set a planned start in the lobby`.
