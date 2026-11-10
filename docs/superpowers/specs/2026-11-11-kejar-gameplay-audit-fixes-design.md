# Kejar: fixing the 2026-11-10 gameplay audit

Source: the owner's gameplay audit, `2026-11-10-kejar-gameplay-audit.md` (done on another device, at `41ff0d2`). Every finding was re-checked against `main` at `0ca7b57` (after Bomoh) and still holds. This document records the owner's decisions from the 2026-11-11 conversation and is the design the three build plans argue from. Where it conflicts with `2026-10-30-kejar-rules.md`, this document wins, and the rules doc is updated to match (see "Rules doc changes").

## Why

The audit found that the game can be decided by things players don't control: a locked screen can auto-jail everyone, a catch can be faked from a photo of a tag, a doubtful catch can't be undone, Durian protects nothing, and a dead phone locks a player out. It also found Core rules the rules doc promises but the app doesn't build (the 10-second rescue, the dare reel, `5 minutes left`, the how-to-play card). The goal is a Core game that is fair and complete enough to playtest, before any more legendaries.

## Goals

- Nobody is auto-jailed for an alert they didn't get in time.
- A catch only counts when the chaser could plausibly be near the runner.
- Marshals can undo a wrong catch, and are only alerted about catches that are actually doubtful.
- Durian gives the runner real protection that can't be beaten by camping.
- A player whose phone dies can carry on from another phone.
- Personal data is deleted 30 days after a game ends.
- The rescue, the dare reel, `5 minutes left` and the how-to-play card work as already designed.

## Non-goals

- A server-side game tick (pg_cron or similar). The owner chose Wake Lock plus a late-ping rule instead.
- Changing Dato Seri's slot behaviour (audit M3). The owner chose to leave it: holding the legendary means no more power-ups until caught.
- Legal and venue matters (Vercel Hobby being non-commercial, park permits, public alarm, Overpass downtime). These go into `docs/HANDOFF.md` as owner to-dos, not code.
- Playtesting itself, and tuning from it.

## Anti-goals (would be a failure even if it technically works)

- A fix that makes ordinary catches feel fussy: real chases must keep counting without extra steps.
- Marshals buried in alerts again.
- Any lock or timer that a chaser can beat by standing next to the runner and waiting.
- Telling players anything secret (Dato Seri, Bomoh) in the new screens, including the how-to-play card.
- Em-dashes in any player- or organiser-facing line. Copy stays English with a light Malaysian twist.

## Constraints

- Free tiers only, no recurring cost per event. Keep the single `api/game.ts` Vercel function.
- The server stays the authority; phones only report.
- Migrations are numbered (next is `0016`), idempotent, wrapped in `begin; … commit;`, with functions revoked from public/anon/authenticated and granted to service_role. The owner runs each by hand before its plan merges.
- Both `GameStore` implementations (`MemoryStore`, `SupabaseStore`) stay in step.
- The three plans below are built and merged one at a time, in order. Each gets its own detailed build plan when its turn comes (Plan 2's rescue hold needs its own data design, which Plan 1 doesn't pre-empt).

---

## Plan 1: Fair play

### 1.1 Locked screens and late pings (audit C1)

- **Wake Lock:** chaser and marshal chase screens (and the organiser's live view) hold a Screen Wake Lock while the game is in the hide or chase phase and the page is visible, re-acquiring it when the page becomes visible again. Where the API isn't supported, nothing changes. Runners don't get one (their phones live in pockets).
- **Late-ping rule (owner's decision):** a missed check-in counts toward auto-jail **only if that ping's alert push went out at least 25 seconds before its reveal.**
  - This needs the server to record, per ping, when its alert push was actually sent. A ping with no record (no phone polled in time, so no push went out) never counts.
  - **What "sent" means (Claude's call):** the server time at which the poll that wins the right to send that ping's alert hands it to the push service. Claiming the alert and recording that time happen in one atomic step, so two phones polling at once can never double-send or record two different times. If the push service call fails outright, the time is still the attempt time (the runner's phone may still get it; the server can't know).
  - On-time pushes of both kinds pass: scheduled pings alert 45 s ahead, Mat Rempit bonus pings 30 s ahead. A scheduled push up to 20 s late still passes.
  - A ping that doesn't count is simply skipped for auto-jail purposes: it neither adds a miss nor resets the runner's streak. (**Claude's call.**)
  - The runner's own screen and the marshal's view should not show a skipped ping as `MISSED`. (**Claude's call.**)

### 1.2 Faked catches (audit C3)

- `judgeCatch` gains a plausibility check. A catch is **refused** when the distance from the chaser's fix to the runner's last known location is more than **50 m + the two fixes' GPS error + 6 m/s × the age of the runner's location**, with the age capped at **10 minutes**.
- The existing "runner location under 20 s old and too far" refusal stays as it is.
- If the runner has no location at all yet, the check is skipped (the catch counts), as today. (**Claude's call:** refusing would block catches on runners whose phones never reported.)
- The chaser sees a neutral refusal: `Can't confirm that one. Get closer and try again.` It doesn't record anything against the runner.

### 1.3 Quieter alerts (audit C4)

- The marshal alert (`Check catch … (runner location old)`) and the runner's `Kena tangkap! Not you?` push now fire **only for borderline catches:** accepted catches whose distance is above **80% of the plausibility limit** from 1.2.
- Every other accepted catch is silent, as a normal catch should be.

### 1.4 Undo kejar (audit C2)

- Marshals and the organiser get an **`Undo kejar`** action on a caught runner (the owner's name for it; "catch" is not used in the label).
- It is atomic, like `releaseAutoJailed`: the runner goes back to free, and the catch is removed from awards and stats.
- It does **not** use the runner's one escape (`freed_once` is untouched), and it restarts their check-in count the way the auto-jail undo does.
- It is logged to `safety_records` with who undid it.
- The runner's existing dispute link (`Not you? Tap to tell a marshal.`) should lead marshals straight to the runner whose catch is disputed, where `Undo kejar` lives. (**Claude's call** on exact placement: the marshal's alert for that catch and the runner's row both offer it.)
- **What it targets (Claude's call):** the runner's current catch only, while that runner is still caught by it (in Penjara or walking there) and the game is in the chase phase. If the runner has since been freed, rescued, or caught again, only the latest catch can be undone. There is no time limit beyond that.
- **The last catch (owner's decision):** when a catch leaves no free runner, the game doesn't end at once. Everyone sees `Last Dikejar caught! Final whistle in 60 s.` and the end is held for 60 seconds. A marshal or the organiser can `Undo kejar` during that minute and the chase carries on. After 60 s the Kejar win is final. If the chase's time runs out during the hold, the hold still runs its full 60 s first, and a successful undo then ends the game on time as a Dikejar win. (**Claude's call** on that last point, so a wrong last catch near the end can still be fixed.)
- **What it reverses (Claude's call):** the runner's jailed state and that catch's place in awards and stats. Nothing else is rewound: power-ups used or drawn around that time, Bomoh reveals, pings and feed lines all stand.
- Feed: everyone sees a neutral line when a kejar is undone, e.g. `A marshal undid a kejar. {runner} is back in.` (**Claude's call**, copy may be tuned.)

### 1.5 Durian (audit H2, owner's decision)

- Durian still blocks the next catch on its holder, as today.
- When a Durian blocks a catch:
  - **The stung chaser can never catch that runner again this game.**
  - **No chaser can catch that runner for the next 15 seconds**, so a teammate standing right there can't rip them straight away.
  - After 15 s, any other chaser can catch them normally.
- Why this design: any lock that ends at a fixed time can be beaten by tailing the runner and waiting. A permanent lock on just the stung chaser can't be camped. It is not too strong because Durian is about 3 cards per 10 runners and each one only locks one chaser off one runner.
- Copy:
  - The stung chaser: `Durian! You can't catch {name} again this game. Hand the tag back.`
  - Another chaser scanning inside the 15 s: `Durian! {name} gets a 15 s head start.`
  - A stung chaser scanning that runner later: `Durian! You can't catch {name} again this game.`
- These refusals record nothing against the runner and don't spend anything.
- **Data model (Claude's call):** the lock is keyed to the stung chaser's player id and the runner's player id, so it survives `Undo kejar` and `New phone` (same player, new phone). Handing the tag back is advice; the lock is what enforces it. The Durian is spent when it blocks, as today.

### 1.6 Stale check-in spot (audit M1)

- When a runner opens the app during a check-in window, the app only re-sends its last known location if that fix's own timestamp is **under 20 seconds old**. Otherwise it asks for a fresh fix and sends that.
- The server keeps stamping locations as it does today; the fix is on the phone side.

### 1.7 New phone (audit H4, owner's decision)

- On a player's row, a **marshal or the organiser** taps `New phone`. This makes a one-time link, shared the same way crew invites are.
- Opening the link on another phone takes over **the same player**: role, hand, escape used or not, check-in history, everything. The old phone's session stops working.
- It works after the game has started (joining is still refused after the start; this is not a join).
- The link is single-use and expires (**Claude's call:** 30 minutes).
- **Who it's for (Claude's call):** players only (runners and chasers). Marshals and the organiser never get a `New phone` link this way: marshals already have their own invite flow, and the organiser signs in. Any marshal or the organiser can issue it for any player in their game, and the issuer is logged in `safety_records`.
- A runner auto-jailed during the dead-phone gap is handled by the existing auto-jail undo, not by this feature.

### 1.8 Data wipe after 30 days (audit M4, owner's decision)

- **30 days after a game ends**, its personal data is deleted: location trails, push subscriptions, player names, session tokens and safety-record free text. (**Claude's call** on the exact list; the principle is "nothing that identifies or tracks a person".)
- Results, anonymous counts and the game row itself stay.
- **Names in results (Claude's call):** wiped names are replaced with role placeholders (`Dikejar 3`, `Kejar 2`) rather than nulled, so results and awards screens keep rendering without changes.
- With no server tick (non-goal), the wipe runs opportunistically from requests that already happen, for example when an organiser creates or loads a game, sweeping a small batch of expired games. It must be cheap and safe to run repeatedly. (**Claude's call**; the builder may pick another trigger that needs no new paid service.)

### 1.9 Small fixes (audit L1, L2)

- **L1:** `removePlayer`'s "is anyone still free?" check gets the same `runners.length > 0` guard as the other end checks.
- **L2:** after a pause, stored and computed alert times agree: either `resume_game` stops shifting pings that already alerted, or `clock.ts` matches it. Pick the one that keeps already-sent alerts on the wall clock.

### 1.10 Docs

- `docs/HANDOFF.md`: an entry for Plan 1, including its migration and the owner's to-do list from the audit's threats: Vercel Hobby's non-commercial terms before paid events, park permits and briefing for public alarm, Overpass downtime, and the free-tier load of ~30 phones polling every 3 s.

---

## Plan 2: Penjara

### 2.1 The 10-second rescue (audit H1)

Build exactly as `2026-10-30-kejar-rules.md` §9a describes, including its two "Claude's call" points (location every 1–2 s during the hold; one missing or poor fix doesn't fail it). In short:
- A free runner scans the Penjara QR within 30 m. The rescue starts but doesn't happen yet.
- The rescuer stays within 30 m of Penjara for 10 s with Kejar open: a lime ring filling and `Stay close · 7 s`.
- Everyone hears at once: chasers get `Rescue starting at Penjara!` then `Catch them in 10 s and nobody gets out.` with a buzz; jailed runners get `{name} is breaking you out · 7 s`; the Penjara marshal sees the same.
- Success after 10 s frees everyone inside who hasn't been freed once. Failure if the rescuer is caught or clearly more than 30 m away (plus GPS error). They can try again while free.
- One rescue at a time; a second scan during a hold joins it.
- Dato Seri's Settle and the dare reel's free slot still free instantly.

### 2.2 The dare reel (audit H3)

Build as `2026-10-28-kejar-jail-dato-seri-design.md` §3 and §3a describe, with the mockup `docs/superpowers/mockups/2026-10-30-motion/9-penjara-dare-reel.html`: one pull per jail stay, available once the jailed runner is at Penjara, roughly 1 in 10 is the lime "free" slot, a dare is confirmed by the Penjara marshal with one tap, and doing or skipping a dare never changes release.

### 2.3 `5 minutes left` (audit H3)

Rules §2.7: at 5 minutes left in the chase, every player gets a warning (push and on-screen), the feed gets a line, and the clock turns lime for the rest of the game. Pauses are respected (it's 5 minutes of game time).

---

## Plan 3: How to play

### 3.1 The briefing story (audit H3, owner's decision: full drawn scenes)

Build the how-to-play card as `2026-10-30-kejar-motion-design.md` §8.8 describes, **with its full self-drawing doodle scenes**, one briefing story per side (Dikejar, Kejar) and per mode (Core, Full).
- It replaces the organiser's manual `Brief the players` tick.
- It never mentions Dato Seri or Bomoh (rules §9b, Bomoh spec §2c).
- It tells runners honestly that leaving the play area is only checked at check-ins (audit M2), alongside the existing Luar Garisan rule.
- It reflects Plans 1 and 2 where they changed the rules players need to know: Durian's new effect and the 10-second rescue.

---

## Rules doc changes

Update `2026-10-30-kejar-rules.md` when Plan 1 lands:
- Durian (§ power-ups table and the base-rules comparison): replace "no head start" with the new effect from 1.5.
- Auto-jail: add the late-ping rule from 1.1.
- Catches: add the plausibility limit from 1.2 and `Undo kejar` from 1.4.

## Left to the builder

- Exact data structures (for example how a Durian lock and the per-ping push time are stored), as long as both stores and the SQL agree and the rules above hold.
- Where `Undo kejar` and `New phone` sit visually on the marshal and organiser screens, following existing patterns.
- How Wake Lock is wired into the existing screens.
- The exact batch size and trigger for the 30-day wipe, within the constraints.
