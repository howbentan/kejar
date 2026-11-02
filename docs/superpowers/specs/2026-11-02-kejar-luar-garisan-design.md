# Kejar: Luar Garisan — a real penalty for leaving the play area

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole. Where this doc disagrees with it, the rules doc wins.

**Status:** Design agreed with the owner in chat, 2026-11-02. Builder-checked once; the check caught a real bug (§7a) and exposed that the original live-timer trigger (§5) didn't fit how runner location actually works, leading to the simpler two-consecutive-reports rule now in place. Not built.
**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §4.5-ish (the existing `outside` alert, `OUTSIDE_MARGIN_M = 20m`, one alert per excursion, marshal-only).
- `docs/superpowers/plans/2026-10-30-kejar-plan-a-checkins-autojail.md` / `docs/superpowers/specs/2026-10-31-kejar-checkins-autojail-penjara.md` (auto-jail): the direct precedent and the reasoning this doc deliberately diverges from in one place (see §4).

## 1. Why

Leaving the play area today has exactly one consequence: a single alert to marshals, reset once the player returns. There is no automatic penalty. This is the same shape of hole missed check-ins had before auto-jail: **the safest way to win "Longest Survivor" is to walk out of the park and sit outside for the whole game.** No chaser can catch someone who isn't in the play area. The fix needs to close that without turning an honest GPS blip at the park's edge into an unfair penalty — the same tension auto-jail already had to resolve for missed check-ins.

## 2. Goals

1. **Close the "leave the park to win" exploit** for both sides: a runner can't out-survive everyone by hiding outside the boundary, and a chaser can't rack up catches by lurking just outside it either.
2. **Tell the player before it happens.** Nobody should be disqualified by surprise — one free miss, with a real warning on it, before anything costs them.
3. **Don't punish GPS noise.** A brief jitter at the boundary edge must never cost someone their round.
4. **Stay proportionate.** This is a rule violation, not a capture — the consequence should read as "you're out of the running," not "the chasers got you."

## 3. Non-goals

- **A literal wall or hard block.** Kejar doesn't stop anyone from physically leaving; this only governs what counts in the game.
- **Removing the player from the game entirely.** Someone who triggers this can keep playing socially — hiding, moving, having fun — they just can't win anything time- or catch-based for that round any more.
- **A new physical destination.** Unlike Penjara, there is nowhere to walk to. See §4 for why this isn't modelled as a jailing.

## 4. The name and the core decision: this is not Penjara

This status is called **Luar Garisan** — "outside the line," the natural Malay sports term for out of bounds (the same register as calling offside). It is **not** an auto-jail, and that's a deliberate departure from the auto-jail precedent, not an oversight:

- **Penjara is a physical place inside the play area.** Sending someone who's already left the area to walk back *in*, to a specific structure, for a boundary violation that might be entirely innocent (grabbing water from a shop just past the line) is a strange, disproportionate extra burden.
- **Being caught and leaving the boundary are different failures.** A catch is the chase game's core verb. Leaving the boundary means leaving the organised, supervised activity the organiser can actually keep safe — a disqualification, not a capture.
- **So Luar Garisan has no physical component at all.** It's a status change, not a destination.

## 5. The trigger (researched, not guessed)

Grounded in how real geofencing systems handle exactly this problem — a spatial margin, a time debounce, and accuracy-aware filtering, not a raw timer alone ([TrackHub geofencing wiki](https://github.com/shernandezp/TrackHub/wiki/Geofencing); [SOTI MobiControl geofence scripts](https://soti.net/mc/help/v2024.1/en/console/devices/monitoring/locationservices/geofence_scripts.html); [Navixy — how geofence exit events work](https://www.navixy.com/docs/qna/using-navixy/how-geofence-exit-events-work)):

**Simplified after the second builder-check round, replacing the original live-timer version below this line.** Kejar can't actually run a live continuous countdown: runners send a position only once per check-in window (phone pocketed between pings, per the base design), not a continuous stream — there's no clock to tick on the server between those moments without a new, meaningfully more invasive always-on tracking mode. Rather than build that, this reuses the exact pattern auto-jail already proved:

- **The existing 20m margin (`OUTSIDE_MARGIN_M`) stays as the spatial buffer.**
- **The check runs at exactly the same evaluation point the existing `outside` alert already uses** — "on every location a runner or chaser sends" (base design). No new tracking mode, no new scheduling component.
- **One out-of-bounds report is free, exactly like one missed check-in.** Two **consecutive** reports from the same player outside the margin — with nothing inside the margin in between — triggers Luar Garisan. A report back inside the margin resets the streak to zero, same as a normal check-in resets the missed-check-in streak.
- **This single rule naturally fits both sides without special-casing.** Runners report roughly every ping interval, so for them this plays out roughly once per check-in cycle (slower, matching how often they're actually heard from). Chasers already report much more often while their tab is open (continuous tracking, same as today), so the same two-consecutive-reports rule resolves for them in whatever their existing report cadence already is — faster, for free, because their underlying data already arrives more often. No separate chaser-specific number needed.
- **Applies to both sides**, using the identical rule, since the underlying `outside` alert already covers "a runner or chaser" identically today.

## 6. The warning

The **player themselves** gets told — today's alert is marshal-only, this isn't:

1. **On the first out-of-bounds report:** a push notification, `You're outside the play area. Come back before your next check-in or you're out.` Reuses the existing `pushTo` mechanism already used for check-in alerts — no new push infrastructure.
2. **On the second, consecutive out-of-bounds report:** Luar Garisan triggers, and a final notification confirms it, plain about what it means (§7/§8).

This mirrors the fairness instinct behind auto-jail's "one free miss" exactly, because it *is* the same mechanism — the player always gets one real chance to come back before anything costs them.

**Deliberately not pursued (discussed and set aside, 2026-11-02):** opportunistic live tracking whenever a runner's tab happens to be open, and an immediate off-cycle re-check push the instant an out-of-bounds report lands, instead of waiting for the next scheduled evaluation. Both are real, buildable ideas that would make the warning feel more immediate — but neither changes the actual guarantee against someone deliberately leaving the park (that guarantee is carried entirely by the two-consecutive-reports rule above), opportunistic tracking has a real privacy cost the project hasn't signed off on elsewhere, and nothing has been playtested yet to say this is even needed. Worth revisiting only if a real playtest shows players are confused or frustrated by the simpler version.

---

*(Superseded below: the original live-timer design, kept for history rather than deleted, since it documents why the simpler version was chosen.)*

~~- 30 continuous seconds past the margin triggers Luar Garisan, filtered by position accuracy, resetting on re-entry.~~
~~- Three-stage escalating countdown: on crossing the margin, at the midpoint, and on lapsing.~~
~~Abandoned because runners don't send a continuous stream — there's nothing for a 30-second server clock to watch between check-ins without a new always-on tracking mode, which the research in §5 above was answering a question that doesn't arise under the simpler design.

## 7. What happens to a disqualified runner

- **Their survival time ends at that instant**, exactly like a catch or an auto-jail, for "Longest Survivor" purposes.
- **They are no longer eligible to win anything time-based this round.**
- **No physical consequence, no destination, nothing to be rescued from.**
- **Their screen reuses the existing jailed-runner spectator map** (the same delayed, everyone-visible map a Penjara'd runner already gets) with swapped header copy — `Luar Garisan` instead of `In Penjara` — rather than building a second screen for the same underlying experience (**Claude's call**).
- **It's permanent for the round.** Coming back inside the boundary doesn't undo it or restart their clock — but nothing stops them walking back in and continuing to play socially; they've lost eligibility, not their place in the game.

### 7a. Data model: a separate flag, not `jailed` (resolved after the first builder-check)

A reviewer caught a real bug in the first draft: the game's only end-of-game check (three call sites) is literally `runners.every(p => p.jailed)`, and `computeResults`'s survivor calculation is `!p.jailed`. §4's "this is not jailed, no physical component" was correct about the *player experience*, but if a disqualified runner's `jailed` flag genuinely stays `false` forever, a game where the last free runner is disqualified would never end — none of those checks would ever see them as "no longer free."

**Resolution:** `Player` gets its own `disqualified: boolean` (or `disqualified_at: string | null`, matching `caught_at`'s style), entirely separate from `jailed`. The three win-condition checks and `computeResults`'s survivor filter are each widened from `!p.jailed` to `!p.jailed && !p.disqualified` (four call sites total, all small, mechanical changes). `jailed` itself is never touched by Luar Garisan and keeps meaning exactly what it means today — so every piece of Penjara-specific machinery (dare-wheel eligibility, rescue, Settle's target list) automatically and correctly never considers a disqualified player, with no code anywhere needing to explicitly exclude them. This is the one new piece of plumbing this design needs; everything else in §7–§8 is unchanged.

## 8. What happens to a disqualified chaser

- **Any catch they attempt while Luar Garisan is refused outright by the app**, cleanly, the same way any other invalid claim already refuses — never a tag-rip that "doesn't count," which would unfairly drag a runner into a non-event. The runner simply isn't caught.
- **No dedicated screen.** A persistent banner on their existing chase screen states the status, the same pattern as the existing chaser-nearby or location-off warnings (**Claude's call** — no new screen needed for a status with no physical destination).
- **Also permanent for the round**, same as a runner: coming back inside doesn't restore catch-eligibility, but nothing stops them continuing to chase socially.

## 9. Anti-goals

- **Punishing bad luck.** The 20m margin and the one-free-miss rule (§5) both exist so a single GPS blip never costs anyone their round — the same reasoning that shaped auto-jail's own "one free miss."
- **Making it feel like a capture.** Luar Garisan must never be presented with Penjara's language, screen, or ceremony — it's a different kind of failure and should read as one.
- **Silently penalising anyone.** The escalating warning (§6) is not optional — nobody reaches Luar Garisan without having been told it was coming.

## 10. Left to the builder

- Whether the final "you're out" notification differs in phrasing between runners and chasers, beyond the different consequence each gets.
- Whether a disqualified player's dot still appears on anyone's map at all afterwards, and if so, how (this doc takes no position — it's a visual/UX detail, not a rule).
- Whether the existing `outside` alert (marshal-only, today) stays as a separate thing alongside the new player-facing warning, or whether one subsumes the other — they're closely related but not identical (the existing alert fires on any single out-of-bounds report; this doc's warning specifically fires on the first of what could become two consecutive ones).

## 11. Explicitly out of scope, raised in the same conversation

**A season-long points/scoring system** (F1-style standings across multiple games, accumulated per player) was raised alongside this but is a separate, larger brainstorm — it depends on some form of persistent player identity across games, which reopens the player-accounts thread parked earlier in this project's design history. Not covered here; worth its own brainstorm next.
