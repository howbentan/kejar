# Loader Exits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a full-screen loader finishes, the j clears the screen with one of three random exits before the screen shows. When a busy button finishes, its small j wipes its own label.

**Architecture:**
- The exit choreography lives in `homeLogo/exits.ts`:
  - the kick timelines as pure data and functions;
  - the per-frame DOM effects: wipe, shove, chase and kick strikes.
- `HomeLogo` takes an `exit` prop and runs it in `leaving` mode, driving its own j: no swapped drawing.
- `useLoaderGate` in `Runner.tsx` holds a screen back while its loader plays the exit. Each loader call site swaps its `if (loading) return <FullLoader/>` for the gate.
- `Busy` in `Runner.tsx` replaces `busy ? <BusyLabel/> : label` at every busy button.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), plain CSS in `src/styles/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-11-16-loader-exits-design.md`. The mockup source is `app/mockups/eat/main.tsx` and `kungfu.tsx`: the timelines, numbers and effects come from there.

## Global Constraints

- Full screens pick **wipe**, **bulldoze** or **kungfu** at random, once per load.
- Wipe: the j sprints off right. The a, the r and the caption chars ahead are cleared in a sharp line behind its mouth (`mouth = j.left + 0.62 * j.width`). The chars behind it **chase** it: each follows the j's own path 70 ms + 28 ms × rank later, hopping up to 6 px.
- Bulldoze: first a **back kick** (the mockup's BACK timeline, with the hit at 150 ms) sends the k, the e and the caption chars behind the j off the left edge. Then the sprint shoves the a, the r and the chars ahead along in front of the mouth, each tilted at random by ±18°.
- Kungfu: the mockup's FULL timeline drives the j: the left hit at 250 ms, the right hit at 570 ms, and the flying side kick off the right edge ending at 1250 ms. Each strike flies the letters on that side off that edge, nearest first, with a hit flash and a 140 ms jolt.
- Skip the exit (show the screen at once) when the loader was up under **400 ms**, with reduced motion, and on errors.
- Buttons: the wipe takes **650 ms**, then the button shows its normal label. No new words. Clicks are never delayed.
- The existing `leaving` sprint (no `exit`) behaves exactly as today.

## Review Focus

- Ready flips back to not-ready after the screen showed (a game reconnecting): the loader must come back, and the exit must play again next time.
- A busy button goes busy again during its 650 ms wipe: it must show busy at once, not finish the wipe first.
- The component unmounts mid-exit (you navigate away): no timers or frames should fire after unmount. Covered by the cleanup tests in Tasks 3 and 4.
- No animation frames are delivered (a background tab or a stalled browser): the gate must still show the screen. HomeLogo's safety timeout covers each exit's full length.
- A button whose label is a non-string node: the wipe clips the label box, so any node works.

---

### Task 1: Exit choreography module

**Files:**
- Create: `app/src/game/homeLogo/exits.ts`
- Test: `app/src/game/homeLogo/exits.test.ts`

**Interfaces:**
- Produces:
  - `type Exit = 'wipe' | 'bulldoze' | 'kungfu'`
  - `pickExit(rand?: () => number): Exit`: thirds, in that order.
  - `interface KickFrame { t: number; legL: number; legR: number; lift: number; tilt: number; x: number; sy: number }`
  - `type KickPlan = { frames: KickFrame[]; hits: { t: number; side: 'l' | 'r' }[] }`
  - `KICK_FULL: KickPlan`, `KICK_BACK: KickPlan`, copied from the mockup's FULL and BACK.
  - `kickFrame(plan: KickPlan, t: number, off: number): KickFrame`. The `OFF` sentinel x becomes `off`. A segment that moves x right by more than 50 eases in (k²); every other segment eases out (cubic).
  - `kickLength(plan: KickPlan): number`
  - `createExitFx(stage: HTMLElement, exit: Exit): ExitFx`, with
    `interface ExitFx { frame(now: number): void; strike(side: 'l' | 'r', foot: { x: number; y: number }): void; behindGone(): boolean }`.
    - The stage is the `.hl` root. The fx finds `.hl-logo`, `.hl-ltr` (k, e, a, r), `.hl-j` and `.hl-ch` (the caption chars) inside it.
    - On the first `frame` it records where the mouth starts and each char's resting rect.
    - Each frame then applies the wipe clip, the bulldoze shove or the chase.
    - `strike` flies the letters on that side using the Web Animations API (guard: skip when `el.animate` is undefined, as in jsdom), adds a `.kf-burst` and jolts `.home` (the stage's closest `main.home`, if any).
  - `LETTER_MID = [0.12, 0.3, 0.68, 0.88]`.

- [ ] **Step 1: Write failing tests**
  - `pickExit(() => 0)` → `'wipe'`; `() => 0.5` → `'bulldoze'`; `() => 0.99` → `'kungfu'`.
  - `kickFrame(KICK_FULL, 0, 400)` equals the first frame.
  - `kickFrame(KICK_FULL, 250, 400).legL` is `78`.
  - `kickFrame(KICK_FULL, 99999, 400).x` is `400`.
  - `kickLength(KICK_FULL)` is `1250`; `kickLength(KICK_BACK)` is `380`.
  - `KICK_FULL.hits` is `[{t:250,side:'l'},{t:570,side:'r'}]`; `KICK_BACK.hits` is `[{t:150,side:'l'}]`.
  - `kickFrame(KICK_BACK, 380, 0)` stands at x 0.
  - `createExitFx` on a bare `div` doesn't throw on `frame` or `strike`.
- [ ] **Step 2:** `npx vitest run src/game/homeLogo/exits.test.ts`. Expect FAIL (no module).
- [ ] **Step 3:** Implement, porting from the mockup's `kungfu.tsx` (the timelines, `strike`) and `useEater`/`hit` (wipe, shove, chase with velocity carry-on once the j stops being measured).
- [ ] **Step 4:** Run again. Expect PASS.

### Task 2: HomeLogo runs the exits

**Files:**
- Modify: `app/src/game/homeLogo/HomeLogo.tsx` (props, `draw`, the frame loop, the `leaving` branch)
- Modify: `app/src/styles/tokens.css` (`.hl-ch { display: inline-block; white-space: pre }`, `.kf-burst` with its keyframes; under reduced motion, none)
- Test: `app/src/game/homeLogo/HomeLogo.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: the `HomeLogo` prop `exit?: Exit`. Without it, `leaving` is unchanged.

**Behaviour in `leaving` when `exit` is set and motion is allowed:**
- `wipe`: `runTo(off, 700, easeInQuad, 1.5, …)`. The fx `frame` runs every tick. `onLeft` fires 900 ms after the run ends, so the chasers clear. Safety timeout: 2800 ms.
- `bulldoze`: the KICK_BACK timeline first. While a kick plays, `draw` uses the kick frame instead of `pose()`: x in px, plus legs, lift, tilt and sy. At its hit, call `fx.strike('l', foot)`. Then the run as in wipe, with the shove. `onLeft` fires at the end of the run. Safety: 2400 ms.
- `kungfu`: the KICK_FULL timeline with both strikes. `onLeft` fires at its end. Safety: 2000 ms.
- The foot's screen spot comes from the j's rect and the mockup's `FOOT` (`l: {x:3,y:242}`, `r: {x:339,y:218}` in the 326×519 drawing).

- [ ] **Step 1: Write failing tests** (with the existing `advance`/stubbed frames):
  - `exit="wipe"`: `onLeft` not called at 700 ms; called once by 1700 ms; the j's x is past the stage.
  - `exit="bulldoze"`: `onLeft` not called at 380 ms; called once by 1200 ms.
  - `exit="kungfu"`: the left leg's transform reads `rotate(78deg)` at about 300 ms; `onLeft` called once by 1300 ms; x ends past the stage.
  - Reduced motion: each exit calls `onLeft` at once.
  - No frames, fake timers: each exit still calls `onLeft` by its safety time.
- [ ] **Step 2:** `npx vitest run src/game/homeLogo/HomeLogo.test.tsx`. Expect the new tests to FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run again. Expect all PASS, the existing tests included.

### Task 3: The loader gate, on every full-screen loader

**Files:**
- Modify: `app/src/game/Runner.tsx` (`FullLoader`, plus the new `useLoaderGate`)
- Modify: `app/src/screens/GameLoading.tsx`, `GameScreen.tsx`, `HostLobby.tsx`, `HostNew.tsx`, `ArenaSetup.tsx`, `PhoneMove.tsx`, `WalkPark.tsx`, `YourKit.tsx`
- Test: `app/src/game/Runner.test.tsx`

**Interfaces:**
- Consumes: `Exit`, `pickExit` (Task 1); `HomeLogo`'s `exit` (Task 2).
- Produces:
  - `useLoaderGate(ready: boolean, instant?: boolean): { show: boolean; loader: { leaving: boolean; exit: Exit; onLeft: () => void } }`
  - `FullLoader` gains `exit?: Exit`. It splits its caption into `<span className="hl-ch">` per char and hides the dots while leaving.
  - `GameLoading` gains `exit?: Exit` and passes it through.

**Gate rules:**
- Not ready → `show` true, not leaving.
- Ready from the start → `show` false.
- Ready arrives:
  - Under 400 ms after the loader first showed, or when `instant` is set → `show` false at once.
  - Otherwise → leaving with a fresh `pickExit()` until `onLeft`, then `show` false.
- Ready goes away again → back to not ready, and the timer restarts.
- Decide in `useLayoutEffect`, so the screen never flashes for a frame.

**Call sites:**
- The pattern is `const gate = useLoaderGate(<ready>, <instant>)` placed with the other hooks, then `if (gate.show) return <FullLoader caption=… {...gate.loader} />`.
- Ready and instant per screen:
  - HostLobby: `!!view || !!loadError`, instant `!!loadError`.
  - HostNew: the negation of its current condition.
  - ArenaSetup: not mapping.
  - PhoneMove: `!!error` or its done state.
  - WalkPark: `!!view || !!error`, instant `!!error`.
  - YourKit: `cards !== null || !!error`, instant `!!error`.
  - GameScreen: replace `entering` with `useLoaderGate(!!current)`. Its error still shows inside `GameLoading` while not ready.

- [ ] **Step 1: Write failing tests** with a probe component and `vi.spyOn(performance, 'now')`:
  - It shows the loader while not ready.
  - Ready at 200 ms → content at once.
  - Ready at 1000 ms → the loader is still shown (status role present), and after `onLeft` the content shows.
  - `instant` → content at once.
  - Ready then not ready → the loader again.
  - `FullLoader` renders one `.hl-ch` per caption char and keeps the status name.
- [ ] **Step 2:** `npx vitest run src/game/Runner.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement the hook and FullLoader, then swap each call site.
- [ ] **Step 4:** `npx vitest run`. Expect all PASS (the screen tests included).

### Task 4: Busy buttons wipe their label

**Files:**
- Modify: `app/src/game/Runner.tsx` (the new `Busy`; `BusyLabel` gains `leaving`)
- Modify, every `busy ? <BusyLabel …/> : label` site: ChaseLayout, MarshalTools, PowerUpHand, SettlePanel, SetupMap, ui.tsx, ArenaSetup (2), HostLobby (3), HostNew, Join, MarshalRedeem, OrganiserRedeem, PostGameFeedback (2)
- Test: `app/src/game/Runner.test.tsx`

**Interfaces:**
- Produces: `Busy({ busy, label, colour?, height?, stack?, children }: { busy: boolean; label: ReactNode; colour?: string; height?: number; stack?: boolean; children: ReactNode })`.
  - Busy → `BusyLabel`.
  - On the change from busy to not busy → `BusyLabel leaving` for 650 ms (a timeout), then `children`.
  - Reduced motion → `children` at once.
  - Busy again → busy at once.
- `BusyLabel leaving`:
  - The MiniRunner moves right by `translateX` over 650 ms (k²) to past the closest button's right edge.
  - The label span is clipped from the left up to the runner's left edge.
  - The runner is clipped where it passes the button's edge.

- [ ] **Step 1: Write failing tests** (fake timers):
  - Busy shows the mini runner and the busy label.
  - Flip to not busy → the runner is still shown; after 650 ms the children show and the runner is gone.
  - Reduced motion → the children show at once.
  - Busy again at 300 ms → the busy label shows at once.
  - Unmount mid-wipe → no state update after unmount (no act warning).
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement, then swap every site. Keep each site's own `colour`, `height` and `stack`.
- [ ] **Step 4:** `npx vitest run`, `npx tsc -b`, `npm run lint`. Expect all clean.

### Task 5: Check it in the browser

- [ ] Run the dev server.
  - Open a game code and watch the loader exit a few times: each exit should appear over several loads.
  - Check a busy button that stays on screen (Search in park setup) wiping its label.
  - Check there are no console errors.
