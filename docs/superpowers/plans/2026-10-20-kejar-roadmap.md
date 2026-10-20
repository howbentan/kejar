# Kejar build roadmap

**Spec:** `docs/superpowers/specs/2026-10-19-kejar-design.md` (approved 2026-10-20)

The design covers six pieces that each produce working, testable software. Each gets its own plan, written after the previous piece is done, so it can use what that piece taught us. Most of all, plan 1's ping spike decides whether check-ins use push alerts or the fixed-schedule fallback.

| # | Plan | Delivers | Depends on |
|---|---|---|---|
| 1 | **Foundation + ping spike** (`2026-10-20-kejar-foundation-ping-spike.md`) | Repo, web app shell in Kejar style, Supabase, push alerts, and a measured pass/fail against the bar in spec §7 | — |
| 2 | Core game | Organiser creates a game; join (code, name, waiver, tag link); roles; hide phase; check-ins and pings; chaser map; tag-scan catch with distance check; jail and jailbreak; end and results; on one hardcoded test park | 1 |
| 3 | Marshal tools and safety | SOS, report, marshal alerts (boundary, no-go, missed check-ins, early start), pause, remove player, 12-month safety records | 2 |
| 4 | Arena setup | Organiser sign-in and invites; OpenStreetMap park import; edit boundary, no-go and walk-only zones, stations, jail | 2 |
| 5 | Power-ups | Station QR claims with 30 m check; Decoy, Shield, Cloak, Flare, Focus | 2, 4 |
| 6 | Polish | Route replay, share card, final visual pass, 24 h location deletion job | 2–5 |

After plan 6: run 2–3 free test games with friends (spec §10 step 7).
