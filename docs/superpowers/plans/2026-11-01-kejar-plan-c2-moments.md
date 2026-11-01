# Kejar Plan C2: the big moments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the catch, the auto-jail, the station claim and the ping feel like moments: stamps, bars, the walk-to-Penjara guide, the lucky dip, doodle stickers on every power-up, the marker scribble, and the ripple ping on the map.

**Architecture:** Small presentational pieces (`Sticker`, `Marker`, `Stamp`, `Bars`) are built first and tested on their own; the moments (`CatchMoment`, `PenjaraArrival`, `LuckyDip`, `WalkGuide`) compose them and are wired into the existing screens (ChaseLayout, Jail, PowerUpHand, Map). The server only gains three small things: the catch result names the runner, the auto-jail event records the check-ins it was judged on, and the view carries the active power-up's end time and the Mat Rempit cooldown. No migration.

**Tech Stack:** React 19 + TS, Motion for React (`motion/react-m`, LazyMotion already at the root), MapLibre (existing `Map.tsx`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §3, §4, §5, §5a, §7, §7b, §7a (the banner tick), §8.1, §8.5. Mockups in `docs/superpowers/mockups/2026-10-30-motion/`: `1-catch-chaser`, `2-catch-runner`, `19-auto-jailed`, `21-station-claim`, `4-lucky-dip`, `8-power-up-slot`, `13-card-art`, `15-marker-scribble`, `5-later-moments` (ripple). Read the mockup for any visual value this plan doesn't pin.

## Global Constraints

- Animate **transform and opacity only** (plus SVG `pathLength` for marker strokes). No looping animation on a screen a pocketed phone shows (spec §3).
- **Brand colours only:** Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3`. Sticker art keeps each character's own colours (spec §7, power-ups design §5c). Yellow `#FFD60A` only for Dato Seri (Plan D, not here).
- **Stamps:** Geist 800, `letter-spacing: -0.06em`, lowercase `dikejar!`.
- **Haptics** through `navigator.vibrate?.(…)` only; nothing may depend on it (iPhone).
- **Reduced motion:** `MotionConfig reducedMotion="user"` already drops transforms. Marker strokes must appear already drawn (`useReducedMotion()` → initial `pathLength: 1`).
- **Marker rules (§8.5):** shapes only, never handwriting; one weight (3 px); lime on black, black on lime; **never on SOS, marshal, pause, removal or report screens**; one scribble moment per screen, under 2 s, each stroke ~0.4 s.
- **Timing constants are exported** so tests drive them with fake timers (spec §9).
- **The walk guide never sends a jailed runner's position to the server** (spec §5.3): it uses `navigator.geolocation.watchPosition` on the phone only.
- **The lucky dip never shows other cards' faces** (§7 rules); the server already decided the card at scan time.

## Review Focus

1. **A reload during a moment.** Reopening the page 5 s after being caught must not replay the bars forever or skip straight past the Penjara screen. Moments play once per `caught_at` (kept in `sessionStorage`), and only within 15 s of it. → Task 4 test.
2. **Reduced motion.** Every moment must still say what happened with no movement: stamps and plates appear in place, marker strokes appear drawn, the lucky dip still needs a tap (or auto-picks after 3 s) and still reveals. → Task 2 and Task 6 tests.
3. **No GPS in Penjara.** Location denied or unavailable: the walk guide shows `Walk to the PENJARA pin on the map.` without a distance, never an error loop. → Task 4 test.
4. **A claim refused mid-dip can't happen, but a slow claim can.** The dip opens only after the server said `ok: true`; a second scan while the dip is open is ignored. → Task 6 test.
5. **Ripple with no viewer position** (marshal without GPS, or none yet): the wave starts at the play area's centre and every circle still appears by 1.5 s. → Task 8 test.

---

### Task 1: Doodle stickers and the power-up card front

**Files:**
- Create: `app/src/game/powerInfo.ts` (move `INFO` out of `PowerUpHand.tsx`)
- Create: `app/src/game/Sticker.tsx`, `app/src/game/Sticker.test.tsx`
- Create: `app/src/game/PowerCard.tsx`, `app/src/game/PowerCard.test.tsx`
- Modify: `app/src/game/PowerUpHand.tsx` (import `INFO` from `powerInfo`)

**Interfaces:**
- Produces:
  - `export const INFO: Record<PowerUpKind, { name: string; effect: string; used: string }>` in `powerInfo.ts` (today's values, unchanged).
  - `export default function Sticker({ kind, size = 92, tilt = 0, wiggle = false }: { kind: PowerUpKind; size?: number; tilt?: number; wiggle?: boolean })` — an `<svg role="img" aria-label={INFO[kind].name}>` with the doodle from `13-card-art.html`, the `wob` (turbulence 0.035, 2 octaves, seed 7, displacement 3.2) and `stk` (white dilate 4.5, drop shadow dy 3.5, opacity .55) filters defined **inside each svg with `useId()`-based ids** (several stickers on one screen must not share ids). `wiggle` plays the mockup's 0.5 s `rotate(-6deg)→rotate(5deg)` once.
  - `export default function PowerCard({ kind, faceDown = false, label }: { kind?: PowerUpKind; faceDown?: boolean; label?: string })` — 96×150 card. Face: `POWER-UP` eyebrow, round art spot with `Sticker`, name (Geist 800), effect line, lime frame. Back (`faceDown`): black, lime outer border, thinner inner border, lime corner marks, faint lime lattice, round **kejar.** seal; `aria-label="Face-down card"`.
- Art: copy the five Core paths (`durian`, `ponteng`, `rempit`→`flare`, `guard`→`focus`) plus `gostan`→`decoy` from `13-card-art.html` (`ART`, `INK`, `spiky`, `star`). Toyol, Ah Long, Abang Grab and Dato Seri art comes with Plan D.

- [ ] **Step 1: failing tests**
  - `Sticker` renders an `img` named `Durian` for `shield`, `Mat Rempit` for `flare`.
  - Two `Sticker`s rendered together have different filter ids (`container.querySelectorAll('filter')` ids are unique).
  - `PowerCard kind="cloak"` shows `POWER-UP`, `Ponteng`, `You skip the next ping`; `faceDown` shows only the `Face-down card` label and no power-up name.
- [ ] **Step 2:** `cd app && npx vitest run src/game/Sticker.test.tsx src/game/PowerCard.test.tsx` → FAIL.
- [ ] **Step 3:** implement; move `INFO`.
- [ ] **Step 4:** `npm test && npm run typecheck` → pass.
- [ ] **Step 5:** commit `feat: doodle stickers and the power-up card front`.

### Task 2: The marker scribble

**Files:**
- Create: `app/src/game/Marker.tsx`, `app/src/game/Marker.test.tsx`
- Modify: `app/src/game/CheckinBanner.tsx` (black tick across the lime `Checked in` banner, §7a/§8.5)

**Interfaces:**
- Produces:
  - `export type Mark = { shape: 'circle' | 'underline' | 'star' | 'arrow' | 'x' | 'tick' | 'emphasis' | 'strike'; target?: RefObject<HTMLElement | null>; at?: { x: number; y: number }; to?: { x: number; y: number } }`
  - `export default function Marker({ marks, colour = 'lime', delayMs = 0 }: { marks: Mark[]; colour?: 'lime' | 'black'; delayMs?: number })` — an absolutely positioned `<svg aria-hidden="true" class="marker">` over its nearest positioned parent. Shapes measured from `target`'s box relative to that parent (`getBoundingClientRect`), with **10 px room on every side** for circles (owner's request: no letters outside the loop). Strokes drawn in sequence with `m.path` `pathLength 0→1`, `MARK_STROKE_MS = 400` each, starting `delayMs` after mount; total capped at 2 s. Wobble: one `feTurbulence`/`feDisplacementMap` filter applied to the **whole svg** (spec build note: on an inner group it hid strokes in Chrome). A sketchy double line: each path drawn twice, the second offset 1 px with opacity .5.
  - `export const MARK_STROKE_MS = 400`
  - With reduced motion (`useReducedMotion()`), every path renders with `pathLength: 1` and no transition.
- Paths are generated by pure helpers exported for tests: `markPath(mark, box: { x: number; y: number; w: number; h: number }): string` — e.g. circle → an ellipse-ish path that overshoots its start by ~20° like a hand loop.

- [ ] **Step 1: failing tests**
  - `markPath({ shape: 'circle' }, { x: 0, y: 0, w: 100, h: 20 })` stays outside the box padded by 10 px: every numeric point of the path parsed back is outside `{ -10, -10, 120, 40 }` or on its edge.
  - `Marker` renders one `path` pair per mark (2 marks → 4 paths) and is `aria-hidden`.
  - With `useReducedMotion` mocked to `true`, the paths render with `pathLength` 1 (assert the `style`/attribute Motion writes, or that no `initial` of 0 is set — test the prop passed through a tiny wrapper if Motion's output is opaque in jsdom).
  - `CheckinBanner` in `in` state renders a marker (`.marker`); `open`, `early` and `missed` don't.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test && npm run typecheck`. **Step 5:** commit `feat: the marker scribble, and its tick on Checked in`.

### Task 3: The chaser's catch moment

**Files:**
- Create: `app/src/game/Stamp.tsx`, `app/src/game/CatchMoment.tsx`, tests for each
- Modify: `app/shared/catch.ts` (`CatchJudgement` ok gains `label`), `app/api/_lib/actions.ts` (`catch` returns it), `app/src/game/ChaseLayout.tsx` (a `moment` slot), `app/src/screens/ChaserChase.tsx`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces:
  - `CatchJudgement` ok: `{ ok: true; flagged: boolean; runnerId: string; label: string }` where `label` is `#07 Aina` (tag then name; the name alone with no tag).
  - `export default function Stamp({ text, plate = false }: { text: string; plate?: boolean })` — lime text, lime border, transparent; `plate` puts it on a solid black plate with a black outline ring and no glow (§5). Slams from `scale: 3` to `1`, `rotate: -8`, overshoot ease (`[0.34, 1.56, 0.64, 1]`), 0.35 s.
  - `export default function CatchMoment({ label, onDone }: { label: string; onDone: () => void })` — fixed full-screen: lime flash (opacity 1→0 over `FLASH_MS = 450`), `Stamp text="dikejar!"`, screen shake (`x: [0,-6,6,-4,4,0]` over 350 ms), then `{label} → Penjara` fades in; `navigator.vibrate?.(200)`; calls `onDone` after `CATCH_MOMENT_MS = 2200`. Tapping anywhere dismisses early.
  - `ChaseLayout` gains `moment?: ReactNode` rendered above everything (below the SOS icon).
- Flagged catches still get the moment (the catch counted); the dock line keeps `— flagged for marshal`.

- [ ] **Step 1: failing tests**
  - actions.test: a good catch returns `label: '#07 Aina'`.
  - `CatchMoment` shows `dikejar!` and `#07 Aina → Penjara`, vibrates once, calls `onDone` at 2200 ms (fake timers) and not before; a tap calls it early.
  - `ChaserChase`: scanning a tag with an ok result shows `dikejar!`; a `too-far` result shows no stamp, only the message.
- [ ] **Steps 2–5:** run → FAIL; implement; `npm test && npm run typecheck`; commit `feat: the catch stamp on the chaser's phone`.

### Task 4: Caught: the bars, `Ben got you.`, and the walk to Penjara

**Files:**
- Create: `app/src/game/Bars.tsx`, `app/src/game/PenjaraArrival.tsx`, `app/src/game/WalkGuide.tsx`, `app/src/game/moments.ts`, tests for each
- Modify: `app/src/game/Map.tsx` (`route` prop), `app/src/screens/Jail.tsx`, `app/src/screens/Jail.test.tsx`

**Interfaces:**
- Consumes: `Stamp` (Task 3), `Marker` (Task 2).
- Produces:
  - `export default function Bars()` — five white vertical bars dropping from the top in quick succession (60 ms apart, 300 ms each).
  - `export default function PenjaraArrival({ plate, onDone }: { plate: ReactNode; onDone: () => void })` — `Bars` plus `plate` landing at the same moment, with a shake; fades out after `ARRIVAL_MS = 1500`.
  - `moments.ts`: `export function shouldPlay(key: string, at: string | null, now: number, store: Storage): boolean` — true only if `at` is within `MOMENT_WINDOW_MS = 15_000` of `now` and `key:at` isn't in `store`; marks it played.
  - `export function WalkGuide({ jail, onArrived }: { jail: LatLng; onArrived: () => void })` — `watchPosition` (high accuracy) on mount, cleared on unmount. Shows a `GameMap` with the runner's dot, the jail pin labelled `PENJARA` and a dashed lime `route` from dot to pin; `{n} M · WALK, DON'T RUN` (rounded to 10 m). Within `ARRIVED_M = 30` calls `onArrived`. With no fix (denied/error/none after 10 s): `Walk to the PENJARA pin on the map.` and the map without a route.
  - `GameMap` gains `route?: { from: LatLng; to: LatLng } | null` (a dashed lime `line` layer, `line-dasharray [2, 2]`, width 3) and labels the jail circle `PENJARA` (a `symbol` layer in Geist Mono-ish default font; MapLibre's default glyphs are fine).
- **Jail screen, caught by a chaser** (`jailReason === 'caught'`):
  1. If `shouldPlay('caught', me.caught_at, now, sessionStorage)`: `PenjaraArrival` with `<Stamp text="dikejar!" plate />` and `navigator.vibrate?.([100, 50, 300])`.
  2. Then: `PENJARA` eyebrow; `{caughtBy} got you.` with a lime full stop and the **marker underlining the name** (one marker moment); one line from exactly `Masuk penjara, bossku!` · `Lepak kat Penjara dulu, bro.` · `Habis la, boss.` · `Hailat bro.` · `Skill issue.` (picked by the same id hash as `MISSED_LINES`); `WalkGuide`; once arrived, today's spectator map and `Spectator view · N min delayed`. `freed_once` keeps today's line under the headline.
  3. With no `caughtBy` name: `Caught.` (no underline).

- [ ] **Step 1: failing tests**
  - `shouldPlay`: true at 5 s after `at`, false at 20 s, false the second time for the same `at`, true for a new `at`.
  - `WalkGuide` with a mocked `navigator.geolocation.watchPosition` emitting a point 160 m from the jail shows `160 M · WALK, DON'T RUN`; a point 20 m away calls `onArrived`; an error shows `Walk to the PENJARA pin on the map.`; unmount calls `clearWatch`.
  - `Jail` (caught 3 s ago, `caughtBy: 'Ben'`): shows `dikejar!` first, then after 1500 ms `Ben got you.` and one of the five lines; re-rendering with the same `caught_at` after the moment doesn't show `dikejar!` again; caught 60 s ago shows no stamp at all.
- [ ] **Steps 2–5:** run → FAIL; implement; `npm test && npm run typecheck`; commit `feat: caught: bars, "Ben got you." and the walk to Penjara`.

### Task 5: Auto-jailed: `2× MISSED`, the crossed-out check-ins, and Tell a marshal

**Files:**
- Modify: `app/api/_lib/actions.ts` (the `auto-jailed` event data), `app/shared/views.ts` (`View.jailCheckins`), `app/src/screens/Jail.tsx`, `app/src/game/SosIcon.tsx`, tests in `actions.test.ts`, `views.test.ts`, `Jail.test.tsx`, `SosIcon.test.tsx`

**Interfaces:**
- Produces:
  - The `auto-jailed` event's `data` gains `checkins: { revealAt: number; ok: boolean }[]` — the last **three** scheduled pings that counted for the runner (from the same `pings` list `autoJailDue` was given; `ok` is `checkedIn(...)`), oldest first.
  - `View.jailCheckins: { at: number; ok: boolean }[] | null` — from the latest `auto-jailed` event targeting me, only while `jailReason === 'missed-checkins'`; `at` is the reveal time.
  - `SosIcon` listens for `window` event `kejar:sos` (`CustomEvent<{ reason?: SosReason }>`): opens the sheet; once sent, that reason is pre-selected and sent with `sosDetails` automatically.
- **Auto-jailed screen** (`19-auto-jailed.html`): if `shouldPlay('auto', me.caught_at, …)`: `PenjaraArrival` with a black plate showing lime `2× MISSED`, `navigator.vibrate?.([300, 100, 300])`. Then: `PENJARA · AUTO` eyebrow; `Missed two check-ins.` with a lime full stop; the random gentle line (today's `MISSED_LINES`); the check-ins as a row of clock times (`h:mm`, `✓` for ok), **the marker strikes out each missed one** (one marker moment); `WalkGuide`; `Phone died or no buzz? Tell a marshal →` dispatches `kejar:sos` with `reason: 'other'`. **Already freed once:** today's `That's the game for you.` screen, no walk guide, the Tell a marshal link stays.

- [ ] **Step 1: failing tests**
  - actions.test: after two missed check-ins (reuse the existing auto-jail test setup), the event's `data.checkins` has the right `ok` flags and reveal times.
  - views.test: `jailCheckins` maps from that event for the jailed runner; `null` for a caught runner and for someone else.
  - Jail.test: `2× MISSED` plays for a fresh auto-jail; the row shows three times with one `✓`; the link dispatches `kejar:sos` with `{ reason: 'other' }`.
  - SosIcon.test: dispatching `kejar:sos` with `other` opens the sheet; after the 1 s hold sends, `sosDetails` is called with `reason: 'other'`.
- [ ] **Steps 2–5:** run → FAIL; implement; `npm test && npm run typecheck`; commit `feat: auto-jailed: 2× MISSED, the crossed-out check-ins, and Tell a marshal`.

### Task 6: The lucky dip

**Files:**
- Create: `app/src/game/LuckyDip.tsx`, `app/src/game/LuckyDip.test.tsx`
- Modify: `app/src/game/Scanner.tsx` (`hint` prop and lime viewfinder), `app/src/game/ChaseLayout.tsx`, `app/src/screens/RunnerChase.tsx`, `app/src/screens/ChaserChase.tsx`, `app/src/game/PowerUpHand.tsx` (`claimMessage` copy), `app/src/styles/tokens.css`

**Interfaces:**
- Consumes: `PowerCard`, `Sticker` (Task 1), `Marker` (Task 2), `Stamp` (Task 3), `ClaimResult`.
- Produces:
  - `export default function LuckyDip({ kind, station, deckLeft, onDone }: { kind: PowerUpKind; station: number; deckLeft: number | null; onDone: () => void })`, full-screen:
    1. `<Stamp text={`CLAIMED · Station ${station} ✓`} />` and `navigator.vibrate?.(80)`, with `DECK · {deckLeft} LEFT` top right (when known); after `CLAIM_STAMP_MS = 900`:
    2. five `PowerCard faceDown` cards (96×150) fanned evenly across the middle in a gentle arc (rotations −12, −6, 0, 6, 12 deg; small y lift for the outer ones);
    3. `Pick a card` with a lime bar draining over `PICK_MS = 3000`;
    4. tap a card, or **flick it up** (pointer moved up ≥ 40 px), picks it; with no pick by 3 s a lime spotlight sweeps across and stops on the middle card after `SWEEP_MS = 1200` (a tap during the sweep picks at once);
    5. the picked card rises to the centre, scales to 1.6 and flips (rotateY) to `PowerCard kind`; the others drift down and fade; **no other card is ever flipped**;
    6. `Got {name}!` above it, then the marker: circle around `Got {name}!` plus a star, emphasis marks either side of the card, an arrow pointing down toward the dock;
    7. after `REVEAL_HOLD_MS = 1600` the card shrinks toward the dock and `onDone()` fires.
  - `export const CLAIM_STAMP_MS = 900, PICK_MS = 3000, SWEEP_MS = 1200, REVEAL_HOLD_MS = 1600`
  - `Scanner` gains `hint?: string`: a lime square viewfinder with a sweeping scan line (CSS, only while the camera is open) and the hint text. ChaseLayout passes `Point at the station card` for runners' and chasers' scans alike.
  - ChaseLayout: when `describe`'s target was `claim` and the result is `ok`, it renders `LuckyDip` in the `moment` slot instead of a dock line; scans are ignored while a moment is open.
  - **Refusals stay calm cards with no marker** (§7). `claimMessage(r, station?)` copy: too far → `Get closer. You need to be within 30 m of Station {n}.`; already claimed → `You've used Station {n} this game. Try another one.`; locked → `Station {n} is cooling down. Ready in m:ss.`; slot full and still running stay as today. Without a station number, today's copy.

- [ ] **Step 1: failing tests** (fake timers)
  - shows `CLAIMED · Station 3 ✓` first, then five `Face-down card`s after 900 ms;
  - tapping the second card reveals `Got Durian!` and exactly **one** card face (`Durian` text appears once; four `Face-down card`s are gone or hidden, never showing other names);
  - no tap: after 3000 + 1200 ms the reveal happens by itself;
  - a pointer-drag of 50 px up on a card picks it;
  - `onDone` fires after the reveal + 1600 ms;
  - with `useReducedMotion` → true, the flow still reaches `Got Durian!` and `onDone`.
  - RunnerChase: an ok `claim` shows the dip (`CLAIMED · Station 2 ✓`), and while it's open a second scan calls nothing.
  - `claimMessage({ ok: false, reason: 'too-far' }, 3)` → `Get closer. You need to be within 30 m of Station 3.`
- [ ] **Steps 2–5:** run → FAIL; implement; `npm test && npm run typecheck && npm run build`; commit `feat: the lucky dip`.

### Task 7: The slot screens

**Files:**
- Modify: `app/shared/views.ts` (`View.activeEndsAt`, `View.flareReadyAt`), `app/src/game/PowerUpHand.tsx`, `app/src/styles/tokens.css`, `app/src/screens/testView.ts`, tests in `views.test.ts` and `PowerUpHand.test.tsx`

**Interfaces:**
- Produces:
  - `View.activeEndsAt: number | null` — for my running Durian, `used_at + SHIELD_MS`; otherwise `null` (other running effects wait for the next ping).
  - `View.flareReadyAt: number | null` — for a chaser holding an unused Mat Rempit while `flareBlocked(...)` returns something: `now + readyInMs`; else `null`.
- Slot (dock, §7b adapted to the one-screen dock):
  - **Empty:** dashed, `No power-up. Find a station and scan it.`
  - **Holding:** `Sticker` (36 px) + name + `READY`; drops in with a bounce (`y: -16 → 0`, spring) when a new card id appears; tap → confirm `Use Durian?` with the effect line, `Use Durian` / `Cancel` (today's buttons).
  - **Running:** sticker + `{name} · ACTIVE`, then `m:ss LEFT` live from `activeEndsAt`, or `UNTIL THE NEXT PING` when it's `null`; not tappable.
  - **Mat Rempit cooldown (chasers):** sticker + `Mat Rempit` + `TEAM COOLDOWN · m:ss` from `flareReadyAt`, not tappable; the dock line on tap reads `Your team used Mat Rempit recently. Next one in m:ss.` (Ruling: the spec's `Siti used…` names the teammate; the view doesn't carry who, so the line says "your team".)
  - Deck counter `DECK · N LEFT` stays.
- [ ] **Step 1: failing tests**
  - views: `activeEndsAt` = `used_at + 10 min` for an active shield; `null` for a running cloak; `flareReadyAt` set for a chaser holding a flare during a cooldown, `null` otherwise.
  - PowerUpHand: empty copy; holding shows the sticker image `Durian` and `READY`; running Durian with `activeEndsAt = now + 9:42` shows `9:42 LEFT`; a flare in cooldown shows `TEAM COOLDOWN · 2:14` and its button is disabled.
- [ ] **Steps 2–5:** run → FAIL; implement; `npm test && npm run typecheck`; commit `feat: the slot shows its sticker, what's running, and the Mat Rempit cooldown`.

### Task 8: The ripple ping on the map

**Files:**
- Create: `app/src/game/ripple.ts`, `app/src/game/ripple.test.ts`
- Modify: `app/src/game/Map.tsx` (`ripple` prop), `app/src/game/ChaseLayout.tsx`, `app/src/screens/RunnerChase.tsx`, `app/src/screens/ChaserChase.tsx` (drop the `PingRipple` card; MarshalLive keeps it)

**Interfaces:**
- Produces:
  - `export const RIPPLE_MS = 1500`
  - `export function revealDelay(distanceM: number, maxM: number): number` — when the wave passes `distanceM`, using ease-out `1 - (1 - t)^3` inverted (`t = 1 - cbrt(1 - d/maxM)`), in ms within `[0, RIPPLE_MS]`.
  - `export function rippleOrigin(dots: MapDot[], arena: Arena): LatLng` — my `me` dot, else the arena boundary's centroid (else `arena.start`).
  - `GameMap` gains `ripple?: { at: number; origin: LatLng } | null`. When `at` changes and is within 10 s of now: a lime ring plus two fainter echoes expand from `map.project(origin)` to the map's far corner over `RIPPLE_MS` (an absolutely positioned overlay `div`, transform/opacity only), and the `fuzzy` layers show each circle only once `revealDelay(its distance from origin, maxM)` has passed (a `['<=', ['get', 'dist'], r]` filter updated per animation frame for 1.5 s, then cleared). `navigator.vibrate?.([120, 60, 120])` once per `at`.
  - ChaseLayout passes `ripple={view.lastRevealAt ? { at: view.lastRevealAt, origin: rippleOrigin(view.dots, view.arena) } : null}`.
- Out of scope (recorded): the Pak Guard 75 m ring, and the auto-jailed circle sliding off to Penjara (both need data the chaser view doesn't carry; Plan D/C3).
- [ ] **Step 1: failing tests**
  - `revealDelay(0, 500) === 0`, `revealDelay(500, 500) === 1500`, monotonic, `revealDelay(250, 500) < 750` (ease-out: the near half is reached early).
  - `rippleOrigin` returns the `me` dot when present; the boundary centroid with no `me`.
  - RunnerChase passes a `ripple` to the (mocked) map with `at === lastRevealAt`; no `PingRipple` card text (`You've been pinged`) on the chase screen.
- [ ] **Step 2–4:** run → FAIL; implement; `npm test && npm run typecheck && npm run build`.
- [ ] **Step 5:** browser check with the dev server and a mocked state (as in C1): at 360×640, the catch stamp, the Penjara arrival, the lucky dip and the ripple each look right and nothing scrolls; screenshot or measurements in the ledger.
- [ ] **Step 6:** commit `feat: the ping ripples out from you and reveals circles as it passes`.

### Task 9: Hand-off

- [ ] Add a "Plan C2" block to `docs/HANDOFF.md`: what shipped, **no migration**, and what's left to C3/D (Pak Guard ring, auto-jail slide-off, Dato Seri yellow marker, Abang Grab/Toyol slot states). Commit `docs: Plan C2 hand-off`.
