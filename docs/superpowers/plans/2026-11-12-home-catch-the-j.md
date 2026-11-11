# Home Screen: Catch the j Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home screen at `/` with the logo as a toy: the j spins and bounces, a tap in time snaps it home and it briefly becomes a random power-up. Below it sit `reconnect` / `join game` / `organise game` and a how-to-play link.

**Architecture:**
- **The toy:** a pure physics module (`catchJ/physics.ts`, no DOM) drives a component (`catchJ/CatchTheJ.tsx`). The component owns one `requestAnimationFrame` loop and moves the j by style transform, with no React render per frame.
- **Reconnect:** reads a new "last game" record (`game/lastGame.ts`). `saveSession` writes it for players, and `HostLobby` writes it for organisers.
- **Home:** composes the toy, the buttons, a join step (local state, no new URL) and the existing `HowToPlay`.

**Tech Stack:** React/TS + Vite, motion/react (already a dependency), Vitest + Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-home-catch-the-j-design.md`. Reference mockup: `docs/superpowers/mockups/2026-11-12-splash-and-home/index.html` (launch config `home-mockups`, port 5179).

## Global Constraints

- **No new dependencies.**
- **No em-dashes** in any player-facing copy.
- **Copy, exactly:**
  - buttons: `reconnect`, `join game`, `organise game`;
  - link: `if dk how to play click here :)`;
  - join step: `JOIN GAME`, `code?`, `join`, `scan qr`, `back`.
- **No tagline.** "Real-life chase, refereed by your phone." is removed.
- **Colours** come only from the existing tokens in `app/src/styles/tokens.css` (volt, black/ink, white/paper, hair). Flat colours, no textures.
- **Toy numbers, at 290 px stage width; scale everything by `stageWidth / 290`:**

  | What | Value |
  |---|---|
  | logo width | 240 px |
  | catch distance | 14 px |
  | DVD self-catch | 3 px |
  | starting speed | 1.6 px/frame at 60 fps |
  | speed-up per catch | ×1.07 |
  | top speed | 4.2 px/frame |
  | sticker size | 84 px |
  | catch beat | 500 ms |
  | tap buzz | 25 ms |
  | self-catch buzz | `[30, 40, 60]` |

- **The j's box** is 190,12 to 516,531 inside the 900 × 543 logo frame.
- **Never animate** while the tab is hidden, while the toy is paused, or with reduced motion.
- **Commit only on the user's go-ahead per task** (standing rule). Commit steps below are the points at which to commit once approved.

## Review Focus

1. **A tap on a button or the link is never a catch:** the pointer handler lives only on the play area, which ends at the top of the button block. *Test in Task 4.*
2. **Rotating or resizing the phone mid-flight:** the j clamps back inside the new play area on the next frame, instead of flying off-screen. *Test in Task 2 (`step` clamps a j that starts outside the bounds).*
3. **Corrupt or old storage:** a malformed `kejar.lastGame` value, or a missing token, shows no `reconnect` and never throws. *Test in Task 1.*
4. **Tapping again during the 500 ms beat** does nothing: no second sticker and no double speed-up. *Test in Task 3.*
5. **A hidden tab or long frames:** a huge `dt`, such as returning after minutes away, must not teleport the j through a wall. Cap `dt` at 40 ms. *Test in Task 2.*

---

### Task 1: Last game record and reconnect

**Files:**
- Create: `app/src/game/lastGame.ts`
- Create: `app/src/game/lastGame.test.ts`
- Modify: `app/src/game/session.ts` (`saveSession`)
- Modify: `app/src/game/session.test.ts`
- Modify: `app/src/screens/HostLobby.tsx` (a mount effect near line 38)
- Modify: `app/src/screens/HostLobby.test.tsx`

**Interfaces:**
- Produces:
  - `type LastGameRole = 'player' | 'organiser'`
  - `saveLastGame(storage: Storage, code: string, role: LastGameRole, now?: number): void`. The key is `kejar.lastGame`, and the value is JSON `{ code, role, at }`, with the code uppercased.
  - `reconnectHref(storage: Storage, now?: number): string | null`. It returns `/g/<CODE>` or `/host/<CODE>`, or `null`.
  - `RECONNECT_MS = 24 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing tests** in `lastGame.test.ts`, using an in-memory `Storage` like `session.test.ts` does:
  - `returns /g/CODE for a recent player game with a token`: call `saveSession(s, 'abc234', { token: 't' })`, then `reconnectHref(s, Date.now())`. Expect `'/g/ABC234'`.
  - `returns /host/CODE for a recent organiser game with an organiser session`: call `saveOrganiserSession` and `saveLastGame(s, 'ABC234', 'organiser', 1000)`. Expect `reconnectHref(s, 1000 + 60_000)` to be `'/host/ABC234'`.
  - `null once older than 24 hours`: expect `reconnectHref(s, at + RECONNECT_MS + 1)` to be `null`.
  - `null for a player record with no token for that code`.
  - `null for an organiser record with no organiser session`.
  - `null and no throw for malformed storage`: set `kejar.lastGame` to `'{oops'`, and separately to `'{"code":5}'`.
  - `newest record wins`: save a player game, then an organiser game; expect the `/host/...` path.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/game/lastGame.test.ts` from `app/`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lastGame.ts`.** `reconnectHref` validates the shape (a 6-character code, a role from the two above, a number for `at`), checks the age, then checks `loadSession(storage, code).token` for a player or `loadOrganiserSession(storage)` for an organiser.
- [ ] **Step 4: Make `saveSession` record the last game.** In `saveSession(storage, code, s)`, when `s.token` is truthy, also call `saveLastGame(storage, code, 'player')`. This covers Join, MarshalRedeem and PhoneMove in one place. Add a `session.test.ts` case: `saving a token records the last game`.
- [ ] **Step 5: Make `HostLobby` record it.** Add a mount effect: if `loadOrganiserSession(localStorage)` is truthy, call `saveLastGame(localStorage, code, 'organiser')`. Add a `HostLobby.test.tsx` case: `opening the lobby with an organiser session records the last game`. Assert that `localStorage.getItem('kejar.lastGame')` contains `"organiser"`.
- [ ] **Step 6: Run the tests.** Run `npx vitest run src/game src/screens/HostLobby.test.tsx`. Expected: PASS.
- [ ] **Step 7: Commit.** Message: `feat: remember the last game on this phone for reconnect`.

### Task 2: Toy physics

**Files:**
- Create: `app/src/game/catchJ/physics.ts`
- Create: `app/src/game/catchJ/physics.test.ts`

**Interfaces:**
- Produces:
  - **`TOY`**: the constants from Global Constraints, at 290 px scale:
    `{ STAGE: 290, LOGO_W: 240, CATCH_PX: 14, SELF_PX: 3, START: 1.6, SPEEDUP: 1.07, MAX: 4.2, BEAT_MS: 500, STICKER: 84, J_BOX: { x0: 190, y0: 12, x1: 516, y1: 531 }, FRAME: { w: 900, h: 543 } }`
  - **`interface Geometry`** `{ scale: number; jw: number; jh: number; home: { x: number; y: number }; bounds: { w: number; h: number } }`
  - **`geometry(stageW: number, playH: number, logoTop: number): Geometry`**
    - `scale = stageW / 290`;
    - the logo is `240 * scale` wide, centred horizontally, with its top at `logoTop`;
    - `jw` and `jh` are the j box times `logoW / 900`;
    - `home` is the j box's top-left mapped into the logo;
    - `bounds = { w: stageW, h: playH }`.
  - **`interface ToyState`** `{ x: number; y: number; vx: number; vy: number; rot: number; spin: number; beatLeft: number }`
  - **`startState(g: Geometry): ToyState`**: starts at `(30 * g.scale, 40 * g.scale)`, with velocity `(START, START * 0.8)` times `g.scale`, `rot: 0`, `spin: 2.4`, `beatLeft: 0`.
  - **`step(s: ToyState, dtMs: number, g: Geometry): { s: ToyState; selfCatch: boolean }`**: pure.
    - **During a beat** (`beatLeft > 0`), only count `beatLeft` down; there is no motion.
    - **Otherwise:**
      - Cap `dtMs` at 40 and let `f = dtMs / 16`.
      - Move by `v * f`, and add `spin * f` to `rot`.
      - Clamp to `[0, bounds - j size]` on each axis, reflecting the velocity on that axis.
      - Negate `spin` when any axis reflected.
      - Set `selfCatch` when the distance to `home` goes from `>= SELF_PX * scale` to `< SELF_PX * scale`.
  - **`canCatch(s: ToyState, g: Geometry): boolean`**: true when `beatLeft <= 0` and the distance from `(x, y)` to `home` is `<= CATCH_PX * g.scale`.
  - **`caught(s: ToyState, g: Geometry): ToyState`**: snaps to `home`, with `rot: 0` and `beatLeft: BEAT_MS`.
  - **`relaunch(s: ToyState, g: Geometry, rand: () => number): ToyState`**:
    - the new speed is `min(MAX * scale, |v| * SPEEDUP)`;
    - the angle is the mockup's: `(rand() * 0.6 + 0.2) * PI/2 + floor(rand() * 4) * PI/2`;
    - the spin is `(rand() < 0.5 ? -1 : 1) * (1.8 + speedPerFrameUnscaled * 0.7)`.
  - **`pickSticker(prev: StickerKind | null, rand: () => number): StickerKind`**: picks uniformly from `Object.keys(ART)`, re-rolling while it equals `prev`.

- [ ] **Step 1: Write the failing tests:**
  - `geometry centres a 240px logo on a 290px stage and maps the j box`: call `geometry(290, 430, 150)`. Expect `home.x` close to `25 + 190 * 240/900` and `home.y` close to `150 + 12 * 240/900`.
  - `geometry scales with stage width`: at a stage width of 580, expect `jw` to be twice the value at 290.
  - `step moves and spins`: after `step(s, 16, g)`, expect `x` to have grown by `vx` and `rot` by `spin`.
  - `step bounces off the right wall and flips spin`: start at `x = bounds.w - jw - 0.5` with `vx > 0`. Expect `vx < 0`, `spin` negated, and `x <= bounds.w - jw`.
  - `step clamps a j that starts outside shrunken bounds`: start at `x = 1000`. Expect `x <= bounds.w - jw` after one step.
  - `step caps dt at 40ms`: expect `step(s, 60_000, g)` to move exactly as far as `step(s, 40, g)`.
  - `step does not move during a beat and counts it down`: start with `beatLeft: 500`. After a 100 ms step, expect `beatLeft` 400 and the same `x` and `y`.
  - `selfCatch fires when gliding through home`: start 4 px left of home, moving right at 2 px/frame. Expect `selfCatch` true within two 16 ms steps.
  - `canCatch is true within 14px and false at 15px` (`scale` 1), and false during a beat.
  - `caught snaps home upright with a 500ms beat`.
  - `relaunch speeds up by 7% and caps at 4.2`.
  - `pickSticker never repeats prev`: run 200 draws with `Math.random`, each never equal to the previous. Also, with a `rand` that always returns 0, the draw comes back different from `prev = keys[0]`, because it re-rolls with a fallback that steps to the next key.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/game/catchJ/physics.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `physics.ts`.** `pickSticker` re-rolls up to 5 times. If it still equals `prev`, it takes the next key in the list, so a stuck `rand` cannot loop forever.
- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat: catch-the-j toy physics`.

### Task 3: The toy component

**Files:**
- Create: `app/public/home/letter-k.png`, `letter-e.png`, `letter-a.png`, `letter-r.png` and `j.png`. Copy these from the mockup folder's `letter-{k,e,a,r}-volt.png` and `j-volt.png`.
- Create: `app/src/game/catchJ/CatchTheJ.tsx`
- Create: `app/src/game/catchJ/CatchTheJ.test.tsx`
- Modify: `app/src/styles/tokens.css` (append a `/* catch the j */` block)

**Interfaces:**
- Consumes: everything from `physics.ts` (Task 2); `Sticker` from `app/src/game/Sticker.tsx` (`kind`, `size`).
- Produces: `CatchTheJ({ paused?: boolean, rand?: () => number, testStart?: Partial<ToyState> }): JSX.Element`.
  - It fills its parent, which must be `position: relative` with a definite height: the play area.
  - `testStart` lets tests place the j.
  - DOM hooks for tests: the play area `data-testid="toy"`, the j `data-testid="toy-j"`, and the sticker `data-testid="toy-sticker"` with `data-kind`.

**Behaviour to build** (port the mockup's script, from `const phone` to the end, onto `physics.ts`):
- **Layout:**
  - Measure the component's own box with a `ResizeObserver`; when it's missing, as in jsdom, measure once with `getBoundingClientRect`. Recompute `geometry(width, height, logoTop)`, where `logoTop` centres the logo vertically in the play area.
  - The logo is four absolutely stacked `<img>` (`letter-k`, `letter-e`, `letter-a`, `letter-r`), each the full logo size at the same origin, with `alt=""`. Put an `aria-label="kejar."` and `role="img"` on their wrapper.
  - The j is one `<img src="/home/j.png" alt="">`, sized `jw × jh` and moved with `style.transform = translate(x, y) rotate(rot deg)`.
- **The loop:**
  - One `requestAnimationFrame` loop, started in an effect and cancelled on unmount.
  - It skips stepping when `paused`, when `document.visibilityState !== 'visible'`, or when reduced motion is on. Reset `last` when resuming, so `dt` doesn't jump.
- **On a catch** (a pointerdown on the play area when `canCatch`, or a `selfCatch` from `step`):
  - Apply `caught`.
  - Restart the CSS classes for the wobble on the logo wrapper and the flash overlay.
  - Call `navigator.vibrate?.(25)`, or `[30, 40, 60]` for a self-catch.
  - Hide the j and render `<Sticker kind={pickSticker(prev, rand)} size={84 * scale}>` centred on the j's home box, inside a span with the spin-in/spin-out keyframes over 500 ms (the mockup's `morph`).
  - When `beatLeft` reaches 0 in the loop: remove the sticker, show the j with the springy `jback` class, and apply `relaunch`.
  - Hold the sticker in React state; that is the only re-render per catch.
- **Taps:** a pointerdown when `!canCatch` does nothing, and so does any pointerdown during a beat.
- **The home-spot outline:** a lime dashed outline shows while `canCatch` and motion is allowed. Toggle it from the loop through a ref, not state.
- **Reduced motion** (`useReducedMotion()` from motion/react): the j sits at `home`, there is no loop stepping, taps do nothing, and the outline is never shown.
- **CSS, from the mockup:**
  - `@keyframes` `wob` (0.5 s), `flash` (0.35 s, volt at 0.35 opacity fading to 0), `morph` (0.5 s, `cubic-bezier(.2,.8,.3,1)`, the mockup's four keyframes) and `jback` (0.16 s, `cubic-bezier(.3,1.6,.5,1)`).
  - Under `prefers-reduced-motion: reduce`, set `animation: none` on all of them.

- [ ] **Step 1: Write the failing tests**, with `vi.useFakeTimers()` and a stubbed `requestAnimationFrame` that the test advances by hand. The parent div is 290 × 430, and `getBoundingClientRect` is stubbed to return that:
  - `renders the logo letters and the j`: expect `getByRole('img', { name: 'kejar.' })` and `getByTestId('toy-j')`.
  - `a tap with the j at home catches and shows a sticker`: use `testStart` at the home position, then `fireEvent.pointerDown(getByTestId('toy'))`. Expect `getByTestId('toy-sticker')`, and the j hidden.
  - `the j comes back after 500ms`: advance the frames by 520 ms. Expect no `toy-sticker`, and the j visible.
  - `a tap 15px from home does nothing`: expect `queryByTestId('toy-sticker')` to be null.
  - `tapping again during the beat shows no second sticker`: tap twice. Expect `data-kind` unchanged and still one sticker.
  - `two catches in a row never show the same sticker`: use a `rand` sequence that would pick the same kind twice. Expect the two `data-kind` values to differ.
  - `reduced motion leaves the j home and taps do nothing`: mock `useReducedMotion` to return true. Expect the j's transform to be at home, with rotate(0), and no sticker after a tap.
  - `paused does not move the j`: with `paused`, the transform is unchanged after 200 ms of frames.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/game/catchJ/CatchTheJ.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Copy the five PNGs** into `app/public/home/`.
- [ ] **Step 4: Implement `CatchTheJ.tsx` and the CSS block.**
- [ ] **Step 5: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 6: Commit.** Message: `feat: catch-the-j toy component`.

### Task 4: New home screen, join step and how to play

**Files:**
- Modify (rewrite): `app/src/screens/Home.tsx`
- Modify (rewrite): `app/src/screens/Home.test.tsx`
- Create: `app/src/screens/HomeJoin.tsx`
- Modify: `app/src/styles/tokens.css` (home layout classes)

**Interfaces:**
- Consumes:
  - `CatchTheJ` (Task 3);
  - `reconnectHref` (Task 1);
  - `HowToPlay` from `app/src/game/HowToPlay.tsx`, with props `side`, `mode`, `snapshot` and `onClose`;
  - `Scanner` from `app/src/game/Scanner.tsx` (`onResult(text)`, `onCancel()`).
- Produces:
  - `Home(): JSX.Element`, still the default export used by `App.tsx`.
  - `HomeJoin({ onBack }: { onBack: () => void }): JSX.Element`.

**Behaviour:**
- **Layout.** `Home` is a full-height column:
  - the play area (`flex: 1; position: relative`) holds `<CatchTheJ paused={joining || story} />`;
  - then the button block, then the link.
  - The button block is outside the play area, so taps on it never reach the toy.
- **Buttons**, in this order, all `className="btn"`:
  - `reconnect`: only when `reconnectHref(localStorage)` is non-null. It's an `<a>` with that `href`, white (paper) with ink text.
  - `join game`: lime. It sets `joining`.
  - `organise game`: `btn btn-ghost`, an `<a href="/host/new">`.
- **The link:** `if dk how to play click here :)` is a text button that sets `story`. While `story` is set, render `<HowToPlay side="runner" mode="core" snapshot={false} onClose={() => setStory(false)} />`.
- **The join step.** When `joining`, `HomeJoin` replaces the button block and the link, and the toy stays visible but paused. `HomeJoin` contains:
  - an eyebrow, `JOIN GAME`, and a heading, `code?`, with the `?` in volt;
  - the code box, kept exactly as today's `Home.tsx` has it: the `id="code"` input labelled `Game code` (visually hidden is fine), with the same `/^[A-Za-z0-9]{6}$/` validation and `window.location.assign('/join/<UPPER>')`, inside a `<form>` so Enter or Go submits;
  - `join` (submit, disabled until valid) and `scan qr` (`btn btn-ghost`, opens `Scanner`);
  - a `back` text button that calls `onBack`.
- **Scanning.** Scanner results are parsed by `joinCodeFrom(text: string): string | null`, defined in `HomeJoin.tsx` and exported for the test. It accepts a URL whose path matches `/join/<6 alphanumeric characters>`, or a bare 6-character code, and returns it uppercased. On a hit, assign `/join/<CODE>`. On a miss, show an `ErrorText`: `That QR is not a kejar game.`

- [ ] **Step 1: Write the failing tests** in `Home.test.tsx`. Keep the `location.assign` stub, and clear `localStorage` in `beforeEach`:
  - `shows the logo, join game, organise game and the how-to-play link, and no tagline`. Expect no text matching `/refereed/`.
  - `no reconnect without a last game`.
  - `reconnect goes to the game for a recent player game`: seed with `saveSession(localStorage, 'ABC234', { token: 't' })`. Expect `getByRole('link', { name: 'reconnect' })` to have `href` `/g/ABC234`.
  - `reconnect goes to the lobby for a recent organiser game`: expect `href` `/host/ABC234`.
  - `organise game links to /host/new`.
  - `join game opens the join step and back returns`.
  - Today's three cases, moved under `describe('join step')` after clicking `join game`:
    - `joins when Enter is pressed in the code box`;
    - `does nothing on Enter until the code is 6 characters`;
    - `still joins from the join button` (the button name is now `join`).
  - `a tap on join game is never a catch`: click `join game`. Expect no `toy-sticker`, even with the toy's `testStart` at home. Home does not expose `testStart`, so assert structurally instead: the `toy` element does not contain the `join game` button.
  - `the how-to-play link opens the runner story and closing returns`. Expect the HowToPlay dialog's close button (find it the way `HowToPlay.test.tsx` does), click it, and expect it gone.
  - `joinCodeFrom accepts a join link or a bare code and rejects others`: `https://x.app/join/abc234` gives `ABC234`, `abc234` gives `ABC234`, and `https://x.app/g/ABC234` and `hello` give `null`.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/screens/Home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement `HomeJoin.tsx`, rewrite `Home.tsx`, and add the layout CSS.**
- [ ] **Step 4: Run the whole suite and the typecheck.** From `app/`, run `npx vitest run`, then `npx tsc --noEmit -p .`. Expected: all tests PASS and no type errors.
- [ ] **Step 5: Check it in the browser.** Use the `kejar-dev` launch config (port 5173), open `/` at the mobile size, and confirm:
  - the j spins and bounces;
  - a tap in the gap gives the flash, then a sticker, then the j;
  - `join game` opens the step and `back` returns;
  - how to play opens and closes;
  - there are no console errors.

  Take a screenshot.
- [ ] **Step 6: Commit.** Message: `feat: home screen with catch the j, join step and reconnect`.
