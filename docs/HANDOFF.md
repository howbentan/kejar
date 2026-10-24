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
- **Plans 4 and 6: not started.** Arena setup, including no-go and walk-only zone alerts; polish (replay, share card, 24 h deletion, 12-month safety-record deletion).

## Decisions made since the design doc (not yet in the spec)
- Brand: **kejar.**; colours **Volt #C6FF3D, black, white** only; fonts Geist and Geist Mono.
- Catch: **armband velcro tag rip**, then the chaser scans the tag's QR code.
  - Only a runner fix ≤20 s old can reject a catch as too far.
  - The chaser needs a location from the last 60 s.
- Runners keep phones pocketed and check in at pings; chasers and marshals keep the page open.
- **Kejar stays a web app** (owner's decision, 2026-10-24). No native app, no Capacitor wrapper, no Bluetooth catching: Bluetooth distance is unreliable, it goes through walls, and iOS restricts it.
- MapLibre **v5** (v6's separate worker broke production builds).

## Open discussion (undecided)
**Endgame intensity.** Proposed, not yet approved:
- Pings speed up: every 2 min in the last 10 minutes, every 1 min in the last 5 (not 30 s).
- The play area shrinks in the last 10 minutes.
- A "Last call" exact ping 1 minute before the end.
- Endgame visuals.

Also floated: surprise missions, a bounty on the longest survivor. Suggested next build: arena setup (Plan 4) or the endgame ideas above; the owner hasn't chosen.

## Setting up a new machine
1. Install Node 20+ and Git, then clone: `git clone https://github.com/howbentan/kejar.git`
2. `cd kejar/app && npm install`
3. Create `app/.env.local`, which is **never committed**. Copy the values from Vercel → Project → Settings → Environment Variables, or run `npx vercel env pull .env.local` after `npx vercel login` and `npx vercel link`. The keys are listed in `app/.env.example`.
4. `npm test` (172 tests should pass), then `npm run dev` for local development.
   - The `/api` functions only run on Vercel; local dev pages that call `/api` need the deployed site.

## Working with Claude on the new machine
Claude's chat history and memory stay on the device they happened on. In a new session, ask Claude to read this file plus the spec and the roadmap first.
