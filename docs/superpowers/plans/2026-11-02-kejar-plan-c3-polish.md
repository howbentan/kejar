# Plan C3: Marshal SOS Takeover, Post-Game Report, and Map Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marshal's plain SOS alert row with the full-screen takeover the motion design always specified, move "Report a player" to the results screen as a proper post-game flow, and give chasers' maps the two visual distinctions they're still missing (a ring on a Pak-Guard-revealed runner, and a jailed runner's dot sliding off to Penjara instead of vanishing).

**Architecture:** The SOS takeover and inbox reuse the existing `Alert`/`alertsFrom` machinery (`app/shared/alerts.ts`) and the existing `handleAlert` marshal action, extended rather than replaced — a new `respondToSos` action and `sos-responding` event follow the exact pattern `sos-details` already established for "what's happening". The arrow-and-distance view reuses `GameMap`'s `route` prop the same way `WalkGuide.tsx` already does for the walk-to-Penjara guide, not the `Marker` scribble component (explicitly barred from safety screens). The two map visuals are pure view/render changes in `app/shared/views.ts` and `Map.tsx`/`Marker.tsx` — no new storage. Dato Seri's own yellow marker and foil move to Plan D, since nothing exists yet for them to decorate; noted below.

**Tech Stack:** TypeScript, React, Vitest, Motion (already wired at the app root per Plan C1/C2), the existing `GameStore`/`MemoryStore`/`SupabaseStore` split.

**Spec:** `docs/superpowers/specs/2026-10-30-kejar-motion-design.md` §6.4–§6.5 (post-game report, the marshal SOS screen). `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for numbers and wins any conflict. `docs/superpowers/plans/2026-11-01-kejar-plan-c1-chase-screen-sos-feed.md` and `docs/superpowers/plans/2026-11-01-kejar-plan-c2-moments.md` describe what's already built and must not be duplicated.

**Scope note (Claude's call):** Plan C2's hand-off listed "Dato Seri's yellow marker and foil" as left for "C3/D". Dato Seri doesn't exist as a power-up anywhere in the code yet (confirmed: `PowerUpKind` has no Dato Seri member, nothing references it outside a few "Plan D's job" comments) — there's nothing for a marker or foil to decorate until Plan D builds the power-up itself. That task moves to Plan D, as its final task, once Dato Seri exists to apply it to.

## Global Constraints

- Brand colours: Volt `#C6FF3D`, black `#0A0A0B`, white `#F5F5F3` only. Lime means "needs you now" — there is no red anywhere (motion design §6.5).
- Free tiers only; keep the single `api/game.ts` function.
- Any new database column or table is a numbered migration the owner runs by hand in Supabase. Prefer computing from what already exists — this plan needs none.
- `Marker` (the scribble component) is explicitly barred from SOS, marshal, pause, removal and report screens (its own doc comment). Use `GameMap`'s `route` prop (as `WalkGuide.tsx` already does) for the SOS arrow instead.
- New "moment" animations (e.g. the auto-jailed dot sliding off) must gate through `shouldPlay(key, at, now, store)` from `app/src/game/moments.ts`, the same one-play-within-15s mechanism every existing moment uses.
- Reports must be acceptable after the game has ended, for players who were in it (motion design §6.4).

## Review Focus

- **A second marshal tapping "I'm going" after the first must still work** — the spec says "a second marshal can still tap it to go too," not that the button disables.
- **Closing an SOS with no outcome chosen must not be possible** — `Close SOS` needs an outcome first, so every closed SOS has one in the safety record.
- **A runner's SOS position stream must stop the moment the SOS closes** — it's explicitly marshal-only and explicitly only "while an SOS is open."
- **An auto-jail-undo (Plan A/followup) must not break the slide-off animation** — a runner un-jailed moments after being auto-jailed should not be left mid-slide or duplicated on the map.
- **A report submitted for a game with no prior SOS from that player must still work** — reports and SOS are linked when they exist, not required to coexist.

---

## Task 1: `respondToSos` and "who's responding" on the alert

**Files:**
- Modify: `app/shared/types.ts` (`EventType` union)
- Modify: `app/shared/alerts.ts` (`Alert` interface, `toAlert`)
- Modify: `app/api/_lib/actions.ts` (new action, exported from `actions`)
- Test: `app/shared/alerts.test.ts`, `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `EventType` gains `'sos-responding'`. `Alert` gains `respondingName: string | null`. New action `respondToSos(ctx, { code, token, eventId })`.
- Consumes: the existing `sos` event and `Alert.id` (the SOS's own event id).

- [ ] **Step 1: Write the failing test**

```ts
it('a marshal tapping "I\'m going" shows on the alert for everyone', () => {
  const events = [event('sos', T0, { id: 'e1', data: { who: 'Aina #07' } }), event('sos-responding', T0 + MIN, { data: { sosId: 'e1', name: 'Hafiz' } })]
  const alert = alertsFrom(events).find((a) => a.id === 'e1')
  expect(alert?.respondingName).toBe('Hafiz')
})

it('a second marshal can still respond after the first', async () => {
  // call respondToSos twice with two different marshal tokens against the same eventId; both succeed (ok: true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- alerts actions`
Expected: FAIL — `respondingName` is `undefined`; `respondToSos` doesn't exist.

- [ ] **Step 3: Add `'sos-responding'` to the `EventType` union in `app/shared/types.ts`**

- [ ] **Step 4: Add `respondingName: string | null` to the `Alert` interface in `app/shared/alerts.ts`, and resolve it in `alertsFrom` the same way `details`/`sos-details` already resolves "what's happening"**

Build a second `Map<string, GameEvent>` from `'sos-responding'` events keyed by `s(e.data.sosId)`, newest wins (events arrive oldest first, same as `details`), and thread `respondingName: s(responding.get(e.id)?.data.name) || null` into the `sos` case of `toAlert`.

- [ ] **Step 5: Add a `respondToSos: Action` in `app/api/_lib/actions.ts`, following `handleAlert`'s exact shape (`loadGame` → `requireMarshal` → `addEvent`)**

```ts
const respondToSos: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  await ctx.store.addEvent({ game_id: game.id, type: 'sos-responding', actor_id: marshal?.id ?? null, target_id: null, data: { sosId: str(body.eventId), name: marshal?.name ?? '' } })
  return { ok: true }
}
```
Export it from the `actions` map alongside `handleAlert`. No uniqueness check — the spec is explicit that a second marshal can still respond.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- alerts actions`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/shared/types.ts app/shared/alerts.ts app/shared/alerts.test.ts app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: marshals can mark themselves responding to an SOS"
```

---

## Task 2: Closing an alert records an outcome

**Files:**
- Modify: `app/api/_lib/actions.ts:843-854` (`handleAlert`)
- Modify: `app/shared/alerts.ts` (`Alert` gains `outcome`)
- Test: `app/api/_lib/actions.test.ts`, `app/shared/alerts.test.ts`

**Interfaces:**
- Produces: `handleAlert(ctx, { code, token, eventId, outcome? })` — `outcome` is optional so every other alert kind's existing call sites keep working unchanged. `Alert.outcome: string | null`.
- Consumes: Task 1's `respondToSos` pattern for the action shape; the existing `addSafetyRecord` call already used by `undoAutoJail` (`actions.ts:870`) as the precedent for writing an outcome into the safety record.

- [ ] **Step 1: Write the failing test**

```ts
it('closing an SOS with an outcome writes it to the alert and the safety record', async () => {
  // send an sos, then call handleAlert with { eventId, outcome: 'sorted' }
  const events = await store.events(g.id)
  expect(events.find((e) => e.type === 'handled')?.data.outcome).toBe('sorted')
  const records = await store.safetyRecords(g.id) // or however safety records are read back in this test file already
  expect(records.some((r) => r.type === 'sos' && r.data?.outcome === 'sorted')).toBe(true)
})

it('handleAlert without an outcome still works for non-SOS alerts, unchanged', async () => {
  // existing behaviour: an 'outside' or 'missed' alert handled with no outcome still succeeds
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions`
Expected: FAIL — `outcome` is never written anywhere.

- [ ] **Step 3: Widen `handleAlert`'s body to accept an optional `outcome`, write it into the `handled` event's `data`, and call `addSafetyRecord` with it when present**

```ts
const outcome = typeof body.outcome === 'string' ? body.outcome : null
await ctx.store.addEvent({ ..., type: 'handled', data: { eventId: str(body.eventId), ...(outcome ? { outcome } : {}) } })
if (outcome) await ctx.store.addSafetyRecord({ game_id: game.id, type: 'sos', at: iso(ctx.now), data: { eventId: str(body.eventId), outcome } })
```
Match `undoAutoJail`'s existing `addSafetyRecord` call shape exactly (`actions.ts:870` onward) rather than inventing a new one.

- [ ] **Step 4: Add `outcome: string | null` to the `Alert` interface and resolve it from the matching `handled` event's `data.outcome` in `alertsFrom`**

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- actions alerts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/_lib/actions.ts app/api/_lib/actions.test.ts app/shared/alerts.ts app/shared/alerts.test.ts
git commit -m "feat: closing an SOS records an outcome in the safety record"
```

---

## Task 3: The SOS sender's live position, marshal-only, while open

**Files:**
- Modify: `app/shared/views.ts` (marshal's `View` building)
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Consumes: the existing per-player position history already used elsewhere for views (same lookup `chaserDots`/the chaser-visible-to-marshals code path already uses).
- Produces: marshal `View`s gain `sosPositions: Record<string, LatLng>` — the latest known position for each player with a currently-open `sos` alert (an `sos` event with no matching `handled` event). Empty object when no SOS is open.

- [ ] **Step 1: Write the failing test**

```ts
it('a marshal sees the live position of a runner with an open SOS', () => {
  const events = [event('sos', T0, { actor_id: 'r1', data: { who: 'Aina #07' } })]
  const v = view(marshal, { events, positions: { ...positions, r1: [pos(3.01, 101.01, T0 + MIN)] } })
  expect(v.sosPositions.r1).toEqual({ lat: 3.01, lng: 101.01 })
})

it('sosPositions is empty once the SOS is handled', () => {
  const events = [event('sos', T0, { actor_id: 'r1' }), event('handled', T0 + MIN, { data: { eventId: /* the sos event's id */ '' } })]
  const v = view(marshal, { events })
  expect(v.sosPositions).toEqual({})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- views`
Expected: FAIL — `sosPositions` is `undefined`.

- [ ] **Step 3: In the marshal branch of `viewFor` (`app/shared/views.ts`), compute `sosPositions` from `alertsFrom(events)` filtered to `kind === 'sos' && !handled`, resolving each to that player's latest position**

Reuse whatever helper already resolves "a player's latest position as of now" for marshal-visible chaser dots — don't write a second one.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- views`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts
git commit -m "feat: marshals see a live position for any open SOS"
```

---

## Task 4: The marshal SOS takeover screen

**Files:**
- Create: `app/src/game/SosTakeover.tsx`
- Create: `app/src/game/SosTakeover.test.tsx`
- Modify: `app/src/screens/MarshalLive.tsx` (render the takeover over whatever's open when an unhandled SOS exists)

**Interfaces:**
- Consumes: `Alert` (Task 1 and 2's `respondingName`/`outcome` fields), `View.sosPositions` (Task 3), `View.me` (the marshal's own position), `GameMap`'s `route` prop and `distanceM()` the same way `app/src/game/WalkGuide.tsx` already consumes them.
- Produces: `export default function SosTakeover({ alert, myPos, senderPos, onRespond, onClose }: { alert: Alert; myPos: LatLng | null; senderPos: LatLng | null; onRespond: () => void; onClose: (outcome: string) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the sender, what\'s happening, and the arrow-and-distance readout', () => {
  render(<SosTakeover alert={{ ...baseAlert, text: 'SOS from Aina #07: Catch dispute' }} myPos={{ lat: 3, lng: 101 }} senderPos={{ lat: 3.001, lng: 101 }} onRespond={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/sos/i)).toBeInTheDocument()
  expect(screen.getByText(/Catch dispute/)).toBeInTheDocument()
  expect(screen.getByText(/M$/)).toBeInTheDocument() // the distance readout, e.g. "111 M"
})

it('shows who\'s responding, or that nobody is yet', () => {
  const { rerender } = render(<SosTakeover alert={{ ...baseAlert, respondingName: null }} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/nobody.*going yet/i)).toBeInTheDocument()
  rerender(<SosTakeover alert={{ ...baseAlert, respondingName: 'Hafiz' }} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/hafiz is going/i)).toBeInTheDocument()
})

it('closing requires an outcome first', () => {
  const onClose = vi.fn()
  render(<SosTakeover alert={baseAlert} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={onClose} />)
  expect(screen.getByRole('button', { name: /close sos/i })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /sorted, all good/i }))
  fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
  expect(onClose).toHaveBeenCalledWith('sorted')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SosTakeover`
Expected: FAIL — the component doesn't exist.

- [ ] **Step 3: Implement `SosTakeover`, following motion design §6.5's exact copy**

- Full-screen lime panel, `MARSHALS · SOS · SENT {elapsed}` ticking up.
- Big lowercase `sos`, the sender (from `alert.text`'s existing formatting — don't re-derive it).
- A black "what's happening" panel: `Waiting for {sender} to say…` until the alert's text carries the reason, then the reason.
- Arrow-and-distance: render `GameMap` with a `route={{ from: myPos, to: senderPos }}` prop, same as `WalkGuide.tsx`, with a `{Math.round(distanceM(myPos, senderPos))} M` readout.
- `NOBODY'S GOING YET` / `{respondingName} IS GOING`.
- `I'm going` (primary, calls `onRespond`) and `See the map first` (a no-op close/peek — leave its exact behaviour to the builder, it's not safety-critical).
- Outcome chips (`Sorted, all good`, `First aid given`, `Player left the game`, `False alarm`) — selecting one enables `Close SOS`, which calls `onClose(outcome)`.
- No `Marker` import anywhere in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SosTakeover`
Expected: PASS

- [ ] **Step 5: Wire it into `MarshalLive.tsx`: render `SosTakeover` over the current screen whenever `alertsFrom(view.alerts).some(a => a.kind === 'sos' && !a.handled)`, wiring `onRespond`/`onClose` to the `respondToSos`/`handleAlert` actions**

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/src/game/SosTakeover.tsx app/src/game/SosTakeover.test.tsx app/src/screens/MarshalLive.tsx
git commit -m "feat: the marshal SOS takeover screen"
```

---

## Task 5: The marshal inbox's two tabs

**Files:**
- Modify: `app/src/game/MarshalTools.tsx:80-119`
- Test: `app/src/game/MarshalTools.test.tsx`

**Interfaces:**
- Consumes: `Alert` (all of Tasks 1–2's fields), `View.reports` (if the post-game report (Task 8) has landed; if this task ships first, leave the "After game" tab's report list empty and come back to it — don't block this task on Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
it('pins open SOS alerts on top of the Live tab, in lime, with who\'s going', () => {
  render(<MarshalTools view={testView({ alerts: [sosAlert, outsideAlert] })} />)
  const rows = screen.getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent(/sos/i)
})

it('closed alerts fade under a Closed heading with their outcome', () => {
  render(<MarshalTools view={testView({ alerts: [{ ...sosAlert, handled: true, outcome: 'sorted' }] })} />)
  expect(screen.getByText(/closed/i)).toBeInTheDocument()
  expect(screen.getByText(/sorted/i)).toBeInTheDocument()
})

it('switches to an After game tab listing post-game reports', () => {
  render(<MarshalTools view={testView()} />)
  fireEvent.click(screen.getByRole('tab', { name: /after game/i }))
  expect(screen.getByRole('tabpanel')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MarshalTools`
Expected: FAIL — no tabs exist yet, alerts render as a flat list.

- [ ] **Step 3: Restructure `MarshalTools`'s alert list into `Live` / `After game` tabs**

Live tab, in order: open `sos` alerts (lime, pinned, showing `respondingName`), then `NEEDS A LOOK` (other open alerts — `outside`, `flagged-catch`, `missed`, `auto-jail`, `left-start`), then `CLOSED` (handled alerts, faded, with their outcome and who closed them). Keep the existing `auto-jail` action buttons exactly as they are today — this task only changes layout and the SOS row, not that logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- MarshalTools`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/game/MarshalTools.tsx app/src/game/MarshalTools.test.tsx
git commit -m "feat: split the marshal inbox into Live and After game tabs"
```

---

## Task 6: Pak Guard's reveal ring

**Files:**
- Modify: `app/shared/views.ts` (a chaser's `MapDot` gains a reveal flag)
- Modify: `app/src/game/Map.tsx`
- Test: `app/shared/views.test.ts`, `app/src/game/Map.test.tsx`

**Interfaces:**
- Produces: `MapDot` gains `revealedBy: 'focus' | null` (or reuses the existing `exact: true` field if it already distinguishes "exact because always exact" from "exact because of Pak Guard" — check first; the earlier fork found no such distinction exists today, so add it).

- [ ] **Step 1: Write the failing test**

```ts
it('a runner shown exactly because of Pak Guard carries revealedBy: focus', () => {
  const v = view(chaser, { powerUps: [used('c1', 'c1', 'focus', T0 + 14 * MIN)], positions: ps })
  const dot = v.dots.find((d) => d.id === 'r1')
  expect(dot?.revealedBy).toBe('focus')
})

it('an ordinarily-exact dot (a teammate) does not carry revealedBy', () => {
  const dot = view(chaser, {}).dots.find((d) => d.kind === 'teammate')
  expect(dot?.revealedBy).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- views`
Expected: FAIL — `revealedBy` is `undefined`.

- [ ] **Step 3: In the dot-building code already handling Focus (`FOCUS_M`, `app/shared/views.ts`), set `revealedBy: 'focus'` only on dots exact specifically because of that check**

- [ ] **Step 4: In `Map.tsx`, render a ring (a small circle layer, brand lime, around any dot with `revealedBy === 'focus'`)**

Follow the existing fuzzy-circle layer's pattern for adding a new GeoJSON source/layer — don't invent a new rendering approach.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- views Map`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts app/src/game/Map.tsx app/src/game/Map.test.tsx
git commit -m "feat: a lime ring marks a runner revealed by Pak Guard"
```

---

## Task 7: The auto-jailed runner's dot slides off to Penjara

**Files:**
- Modify: `app/shared/views.ts:144,192,221` (stop skipping a just-jailed runner outright)
- Modify: `app/src/game/Map.tsx` or a new small component, builder's choice, following the existing moment pattern
- Test: `app/shared/views.test.ts`, and the component test for wherever the animation lives

**Interfaces:**
- Produces: a jailed runner's dot is included in the view for a short window right after `caught_at` (not forever — ordinary caught/jailed runners still disappear once the moment has played), carrying enough information (their last position, Penjara's position) for a one-shot slide animation gated by `shouldPlay` (`app/src/game/moments.ts`).

- [ ] **Step 1: Write the failing test**

```ts
it('a runner auto-jailed in the last 15s still has a dot, for the slide-off moment', () => {
  const events = [event('auto-jailed', T0 + 14 * MIN, { target_id: 'r1' })]
  const v = view(chaser, { events, now: T0 + 14 * MIN + 5_000 })
  expect(v.dots.find((d) => d.id === 'r1')).toBeDefined()
})

it('a runner jailed more than 15s ago has no dot, as today', () => {
  const events = [event('auto-jailed', T0 + 14 * MIN, { target_id: 'r1' })]
  const v = view(chaser, { events, now: T0 + 14 * MIN + 20_000 })
  expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
})

it('a runner whose auto-jail is undone mid-window does not keep sliding', () => {
  const events = [event('auto-jailed', T0 + 14 * MIN, { target_id: 'r1' }), event('auto-jail-undone', T0 + 14 * MIN + 3_000, { target_id: 'r1' })]
  const v = view(chaser, { events, now: T0 + 14 * MIN + 5_000, players: [{ ...runner1, jailed: false }] })
  expect(v.dots.find((d) => d.id === 'r1')).toMatchObject({ kind: 'runner' }) // back to an ordinary free-runner dot, not mid-slide
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- views`
Expected: FAIL — the dot vanishes immediately on jailing, as today.

- [ ] **Step 3: In the three spots that skip jailed runners (`app/shared/views.ts:144,192,221`), keep including a runner whose `caught_at` is within `MOMENT_WINDOW_MS` (15 s) of `now` AND who is still `jailed`, using their last known position**

The `still jailed` check matters: a runner whose auto-jail was undone (Plan A's followup, `undoAutoJail`) has `jailed` set back to `false` immediately, so they fall out of this window on their very next view even if less than 15 s have passed, and render as an ordinary free runner instead. Import `MOMENT_WINDOW_MS` from `app/src/game/moments.ts` rather than hardcoding `15_000` a second time — if that constant isn't importable from shared code (it may live in a client-only file), move it to `app/shared/` first so both sides use the same number, and update `moments.ts` to import it back.

- [ ] **Step 4: Build the slide animation, gated by `shouldPlay('auto-jailed-' + playerId, caughtAt, now, localStorage)`, playing once per jailing**

Animate the dot from its last position to Penjara's known position (already available wherever `WalkGuide.tsx` gets it), then remove it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/shared/views.ts app/shared/views.test.ts app/src/game/Map.tsx
git commit -m "feat: an auto-jailed runner's dot slides off to Penjara instead of vanishing"
```

---

## Task 8: Post-game report and rating

**Files:**
- Modify: `app/src/game/SosIcon.tsx` (remove `ReportForm` from the in-game sheet)
- Create: `app/src/screens/PostGameFeedback.tsx`
- Create: `app/src/screens/PostGameFeedback.test.tsx`
- Modify: `app/src/screens/Results.tsx` (render the two new cards)
- Modify: `app/api/_lib/actions.ts` (the existing `report` action: accept it after `ended_at` is set)
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Produces: `export default function PostGameFeedback({ code, view }: { code: string; view: View })` rendering `How fun was it?` (1–5 plus optional `What would you change?`) and `Report a player` (reason chips `Rough play` / `Catch dispute` / `Something else`, a target player, optional note, `Send report`).
- Consumes: the existing `report` action and `REASON_LABEL`-style reason chips already used by `ReportForm`, moved here rather than re-invented.

- [ ] **Step 1: Write the failing test**

```ts
it('the report action still works once the game has ended', async () => {
  // end the game, then call the report action with a valid player token from that game
  const r = await run('report', { code: g.code, token: runnerToken, targetId: 'c1', reason: 'dispute', note: '' })
  expect(r.ok).toBe(true)
})
```

```tsx
it('submitting a rating stores it per player per game', async () => {
  call.mockResolvedValue({ ok: true })
  render(<PostGameFeedback code="ABC234" view={testView()} />)
  fireEvent.click(screen.getByRole('button', { name: '4' }))
  fireEvent.click(screen.getByRole('button', { name: /send/i }))
  expect(call).toHaveBeenCalledWith('rate', { code: 'ABC234', token: 't1', rating: 4, note: '' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions PostGameFeedback`
Expected: FAIL — `report` rejects an ended game; `rate` and `PostGameFeedback` don't exist.

- [ ] **Step 3: In `app/api/_lib/actions.ts`, find wherever the `report` action currently requires the game to be mid-chase (if it does) and allow `ended` too, for a player who was actually in that game**

- [ ] **Step 4: Add a `rate: Action` storing `{ rating: 1-5, note }` per player per game as a new event type `'rated'` (reusing `addEvent`, no new table — the existing events table already models "one record per player action")**

- [ ] **Step 5: Build `PostGameFeedback`, moving `ReportForm`'s existing chip/note UI out of `SosIcon.tsx` into this new file, plus the `How fun was it?` rating above it**

- [ ] **Step 6: Remove `ReportForm` and its trigger from `SosIcon.tsx`'s sheet; render `PostGameFeedback` on `Results.tsx` instead**

- [ ] **Step 7: Marshals and the organiser see post-game reports in the inbox's "After game" tab (Task 5) — wire `'rated'`/`'report'`-after-end events into whatever that tab reads**

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/src/game/SosIcon.tsx app/src/screens/PostGameFeedback.tsx app/src/screens/PostGameFeedback.test.tsx app/src/screens/Results.tsx app/api/_lib/actions.ts app/api/_lib/actions.test.ts
git commit -m "feat: move reporting to a post-game flow, add the fun rating"
```
