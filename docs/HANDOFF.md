# Kejar: handoff notes

Start here on a new machine or in a new Claude session. Last updated 2026-10-23.

## What Kejar is
A web app for organised, real-world chase games (runners vs chasers, with marshals) in parks, run as paid events in Malaysia.
- Full design: `docs/superpowers/specs/2026-10-19-kejar-design.md`
- Roadmap: `docs/superpowers/plans/2026-10-20-kejar-roadmap.md`

## Live
- App: https://kejar-eosin.vercel.app (Vercel auto-deploys every push to `main`)
- Repo: https://github.com/howbentan/kejar (private)
- Database: Supabase. Migrations `0001`, `0002` (spike; `0002` drops spike tables, not yet run) and `0003_game.sql` (applied).
  - **Turn off** Supabase → Integrations → GitHub → "Deploy to production" if it's on. It would auto-run `0002`.

## Status
- **Plan 1 (foundation + ping spike): done.** Android push alerts work; iPhones untested (`docs/superpowers/spike-results.md`).
- **Plan 2 (core game): done and live.**
  - Create a game (pick the play area on a map), join, roles, tag linking
  - Hide, chase, pings and check-ins
  - Tag-rip catches (QR scan)
  - Jail and jailbreak, results
  - Marshal live view, ping ripple, synced timers, map with place names and a "Me" button
- **Plan 5 (power-up stations): done and live.** Migration `0004_powerups.sql` has been run in Supabase.
  - The host taps the map to drop up to 8 stations, and their QR cards print with the tags.
  - Players scan a station within 30 m during the chase. Runners get Decoy, Shield or Cloak; chasers get Flare or Focus.
  - Each player can claim a station once, a station locks for 60 s after a claim, and a hand holds 3.
- **Plan 3 (marshal and safety tools): done and live.** Migration `0005_safety.sql` has been run in Supabase.
  - Runners and chasers have SOS and Report buttons. Marshals and the organiser get an alert list with a Handled button, and lime pins on the map.
  - Automatic alerts: left the play area (>20 m out), missed 2 check-ins, chaser left the start early, and catches to check.
  - Pause and resume for everyone (clocks freeze), and removing a player.
  - The organiser and marshals can turn on SOS alerts for their phone.
  - SOS, reports and removals are also written to `safety_records`, which is never read by the app.
- **Plan 4a (organiser accounts): done and live.** Migration `0006_organisers.sql` has been run.
  - Organisers sign in through invite links.
  - Marshals can be pre-assigned with personal links.
  - Roles are shuffled in the lobby.
- **Plan 4b (real parks and saved arenas): done and live.** Migration `0007_arenas.sql` has been run.
  - Organisers search a park by name. Its OpenStreetMap outline comes in with lakes cut out and toilets marked.
  - "Use part of the park" drops a circle (150–500 m) to use only part of a big park.
  - Organisers tap to place stations, the jail and the start, then save the park for their organisation. A "lakes not checked" mark with a Retry button appears when Overpass was down.
  - A game can adjust its spots for that game only.
  - Marshals get a setup map in the lobby.
  - Lakes count as outside for the "left the play area" alert.
  - The endgame shrinking zone can reuse `buildPlayArea` (`app/shared/playArea.ts`) with a smaller circle.
  - Walk-only and hand-drawn no-go zones were dropped (owner's decision); walk-only is a briefing rule.
  - Overpass's main server is often overloaded. Lookups wait up to 60 s; a failed one leaves the park marked "lakes not checked".
- **Plan 6 (polish): not started.** Replay, share card, 24 h deletion, 12-month safety-record deletion.

## Decisions made since the design doc (not yet in the spec)
- Brand: **kejar.**; colours **Volt #C6FF3D, black, white** only; fonts Geist and Geist Mono.
- Catch: **armband velcro tag rip**, then the chaser scans the tag's QR code.
  - Only a runner fix ≤20 s old can reject a catch as too far.
  - The chaser needs a location from the last 60 s.
- Runners keep phones pocketed and check in at pings; chasers and marshals keep the page open.
- **Kejar stays a web app** (owner's decision, 2026-10-24). No native app, no Capacitor wrapper, no Bluetooth catching: Bluetooth distance is unreliable, it goes through walls, and iOS restricts it.
- MapLibre **v5** (v6's separate worker broke production builds).
- **Focus/Pak Guard's reveal radius is 75 m, not 150 m** (owner's decision, 2026-10-28), to keep it clearly weaker than the chaser legendary power-up being designed alongside it. `FOCUS_M` in `app/shared/views.ts` already reflects this.

## Open discussion (undecided)
**Endgame intensity.** Proposed, not yet approved:
- Pings speed up: every 2 min in the last 10 minutes, every 1 min in the last 5 (not 30 s).
- The play area shrinks in the last 10 minutes.
- A "Last call" exact ping 1 minute before the end.
- Endgame visuals.

Also floated: surprise missions, a bounty on the longest survivor. **Malaysian power-ups (designed 2026-10-28, not built).** `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`.
- Funny, local renames: Gostan, Durian, Ponteng, Mat Rempit, Pak Guard (now 75 m, not 150 m — see below).
- New power-ups: Toyol and Ah Long ("take away"), and Abang Grab (claim a station remotely).
- Malaysian slang applies to the power-ups only; all other wording stays as it is.
- Stations stay random-on-claim.

**Jail gets a dare wheel, plus a rare runner escape power-up, Dato Seri (designed 2026-10-28, checked and ready for a plan, not built).** `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md`.

**A legendary power-up for chasers, to mirror Dato Seri (brainstorm in progress, 2026-10-30 — not finished).** `docs/superpowers/specs/2026-10-30-kejar-chaser-legendary-design.md`. The character (Bomoh vs Pontianak, or a safer backup) is the one open blocker, deliberately left for the owner to sanity-check with actual Malaysian people first; everything else about the mechanic (rarity, hand cost, discovery, effect duration, staffing) is already pinned down in that file. Pick up there on a new device.

**Check-in and jail fixes (designed 2026-10-30, not built).** `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md`.
- A check-in only counts in the 45 s before a ping (the alert moves from 30 s to 45 s).
- Two missed check-ins in a row send a runner to Penjara automatically (one miss is free).
- Optional organiser switch: at check-in, runners see a fuzzy snapshot of where the chasers were when the alert went out.
- "Jail" becomes "Penjara" for players.
- **Build this first, before the playtest and before the other two designs.**

**Motion design (designed 2026-10-30, not built).** `docs/superpowers/specs/2026-10-30-kejar-motion-design.md`, with mockups in `docs/superpowers/mockups/2026-10-30-motion/`.
- Uses the Motion library.
- The catch "dikejar!" stamp, plus bars and a walk-to-Penjara guide for the caught runner.
- A press-and-hold SOS bar with "What's happening?" reasons; disputes go through SOS.
- Report and feedback move to the results screen.
- A pick-a-card lucky dip for power-ups.

**Locked 2026-10-30: power-ups are one slot per player** (Malaysian power-ups design §5a).
- A slot stays busy while its effect runs.
- Mat Rempit is one at a time, with a 3-minute team cooldown.

**PLAYTEST BUILD (owner's decision, 2026-10-30): no new mechanics until a real game has been played.** Build only:
1. the check-in design (tight window, auto-jail, optional chaser view at check-in, Penjara);
2. one power-up slot plus the Mat Rempit rule, on today's power-ups;
3. motion design §4–§7: catch stamp, runner bars and Penjara guide, SOS bar with post-game report and feedback, lucky dip.

Then playtest with friends, then a run club. Note catches per game, jailbreaks, on-time check-ins, and power-up usage.

Suggested next: write the playtest build plan, then a real playtest in a park, then the endgame ideas above (the shrinking zone can reuse the Plan 4b play-area code); the owner hasn't chosen.

## Setting up a new machine
1. Install Node 20+ and Git, then clone: `git clone https://github.com/howbentan/kejar.git`
2. `cd kejar/app && npm install`
3. Create `app/.env.local`, which is **never committed**. Copy the values from Vercel → Project → Settings → Environment Variables, or run `npx vercel env pull .env.local` after `npx vercel login` and `npx vercel link`. The keys are listed in `app/.env.example`.
4. `npm test` (172 tests should pass), then `npm run dev` for local development.
   - The `/api` functions only run on Vercel; local dev pages that call `/api` need the deployed site.

## Working with Claude on the new machine
Claude's chat history and memory stay on the device they happened on. In a new session, ask Claude to read this file plus the spec and the roadmap first.
