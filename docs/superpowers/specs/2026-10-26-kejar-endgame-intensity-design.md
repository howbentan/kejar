# Kejar: endgame intensity — brainstorm notes

**Status:** Draft — brainstorming in progress, nothing here is approved or scoped to build yet.
**Started:** 2026-10-26
**Related:** `docs/superpowers/specs/2026-10-19-kejar-design.md` (base design), `docs/HANDOFF.md` (open discussion that kicked this off)

## Why this exists
`docs/HANDOFF.md` flagged "endgame intensity" as an undecided next direction, floating three ideas (ping speedup, shrinking play area, a "last call" ping). The owner chose to explore this before deciding priority against Plan 4 (arena setup).

## Scope note
This touches shared scheduling logic (`app/shared/clock.ts`), which the Plan 3 safety system (outside-the-boundary alerts) also depends on. Any shrinking-boundary idea needs to be designed against marshal alerts explicitly, not bolted on as a side effect.

## Ideas discussed

### Original three (genre staples — also used by apps like Scram)
1. **Ping speedup** — pings every 2 min in the last 10 minutes, every 1 min in the last 5 (instead of the fixed interval all game).
2. **Shrinking play area** — the boundary polygon contracts in the last 10 minutes.
3. **"Last call" ping** — one exact-time ping 1 minute before the end.

Flagged concern: shrinking the boundary interacts with the Plan 3 "outside the play area" safety alert — a shrink could flag an already-stationary runner as suddenly "outside," which currently fires a marshal alert. Needs explicit handling.

### Kejar-specific ideas (lean on mechanics Scram doesn't have)
4. **Power-up drought or surge** — in the final stretch, stations either stop refilling (use-it-or-lose-it) or flip to spawning only the strongest kind (double Flare/Focus for chasers running low on time). Builds on the existing station/claim system from Plan 5.
5. **Jail lockdown** — jailbreak gets harder near the end (needs two rescuers instead of one, or locks permanently past a time threshold). Raises the cost of a late catch using the existing jail mechanic.
6. **Marshal "last known" board** — as survivors thin out, MarshalLive switches to showing just the remaining uncaught runners and their last-seen spot. Reuses the existing marshal live view.
7. **Spectator hype cut** — the existing delayed spectator feed (`spectatorDelayMin`) zooms to just the remaining runners' last-known spots in the endgame, instead of the same full map all game.
8. **Catch-window loosening at the death** — loosen the strict catch-validation windows (20 s fix to reject, 60 s chaser location) slightly in the final minutes, so a dramatic finish doesn't get thrown out on a technicality.

**Recommendation so far:** ideas 4-6 (power-up drought/surge, jail lockdown, marshal board) are the strongest — they make the endgame feel distinctly Kejar rather than "hide-and-seek app with a timer," and they build on systems already shipped. 7 and 8 are lower-priority nice-to-haves.

## Open question: quest-based power-ups?

Raised 2026-10-26: should claiming a power-up require completing a multi-step "quest" instead of the current single scan (walk within 30 m of a station, scan its QR)?

**Recommendation: keep it simple, don't add quests.**

- The current mechanic already has quest-like tension built in — walking to a station while being hunted *is* the risk/reward loop, with none of the extra screen time.
- It directly conflicts with an existing, deliberate design decision: runners keep phones pocketed and only check in at pings (`docs/HANDOFF.md`). A multi-step quest means runners actively tracking objectives on their phone mid-chase — the opposite of the stealth gameplay already chosen.
- It's a meaningfully bigger build than it sounds: a quest state machine, multi-step completion tracking, new UI for active objectives, and more edge cases to QA (partial completion, abandoned quests, contested multi-step stations) — live, during a paid event, where failures are visible immediately.
- The roadmap already has two unstarted plans (arena setup, polish) and a flagged security/production-readiness track competing for the same build time.

If a lighter middle ground is wanted later: a single optional bonus step (e.g. one extra QR scan at a second nearby station for a stronger version of the same power-up), not a full multi-step quest chain. Worth flagging as maybe-later, not something to scope now.

## Still undecided
- Final scope: how many of ideas 1-8 to build, and in what order
- Whether quest-based power-ups get revisited later in a lighter form
- Whether this work happens before or after Plan 4 (arena setup) / the security-review track
