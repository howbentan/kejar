# Kejar: handoff notes

Start here on a new machine or in a new Claude session. Last updated 2026-10-30.

**Read `docs/superpowers/specs/2026-10-30-kejar-rules.md` first.** It's the single source of truth for the game (Core and Full modes, every number, which spec owns what, and what's still open). The notes below are history and status.

## What Kejar is
A web app for organised, real-world chase games (runners vs chasers, with marshals) in parks, run as paid events in Malaysia.
- Current rules: `docs/superpowers/specs/2026-10-30-kejar-rules.md`
- Original full design: `docs/superpowers/specs/2026-10-19-kejar-design.md`
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
- New power-ups: Toyol and Ah Long ("take away"), and Abang Grab (see the top 3 cards of your deck, keep 1, sealed).
- Local names stay; everything players read is plain English (rules doc §6).
- Stations draw from a shared deck per side (power-ups §5b).

**Jail gets a dare wheel, plus a rare runner escape power-up, Dato Seri (designed 2026-10-28, checked and ready for a plan, not built; 2026-10-30: two modes, a hidden QR stash by default or the quest-giver, in yellow as the one legendary, §4a–§4b).** Events are designed to run with **two people**: the organiser as roaming marshal plus one helper at Penjara (motion design §6.6). The marshal's SOS screen is §6.5. `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md`.

**Bomoh, the legendary power-up for chasers, mirroring Dato Seri (designed 2026-10-30/31, not built).** `docs/superpowers/specs/2026-10-30-kejar-chaser-legendary-design.md`. Named and coloured 2026-10-31: **Bomoh**, **purple** (not Dato Seri's yellow — the two need to stay visually distinct). Grants the same way Dato Seri does: a hidden stash by default, the ritual as an optional staffed mode when there's a spare volunteer. Doodle card art mocked up in `docs/superpowers/mockups/2026-10-31-chaser-legendary/`.

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
- **Connection states added 2026-10-31** (§8.10): buffering, lost signal (ties to the marshal auto-jail undo), reconnected, and two failed-action variants, one of them a tease ("Kepala bapak kau!"). Widens the plain-English-on-screen rule further than "Pak Pulis" did; flagged, owner's call. An earlier ambient-radar pass the same day was judged too much and reverted — see §8.10's note.

**Locked 2026-10-30: power-ups are one slot per player** (Malaysian power-ups design §5a).
- A slot stays busy while its effect runs.
- Mat Rempit is one at a time, with a 3-minute team cooldown.

**Plan C1 (branch `plan-c1-chase`, 2026-11-01): the one-screen chase, the SOS icon, the two-part feed and the check-in banner.** **No migration is needed.**
- Motion for React at the app root (honours the phone's reduced-motion setting).
- Every feed line says what happened, then what it means for your side (`→ …` in lime). Lines that need a runner to act get a lime outline and one buzz.
- `View.checkin` tells a free runner whether they're early, open, checked in or missed for the next ping, using the same window and since-release rule as auto-jail.
- SOS is a small Volt "!" on the status row of every player screen. Tapping opens a sheet; only a 1 s hold on its bar sends. Afterwards, "What's happening?" chips (and "With who?") fold into the marshals' alert. Report a player lives in the sheet until the post-game report (C3).
- Runner and chaser chase screens fit one phone screen: top bar, status row, the map, then a dock with the slot, one Scan button (stations, Penjara or tags) and the ticker.
- The check-in push now says `Ping in 45s — check in!` with when Kejar see you, and opens `/g/{code}?checkin=1`. Check this notification by hand on a phone at the next playtest.

**Plan B (branch `plan-b-slot-deck`, 2026-11-01): one power-up slot, the shared deck per side, Mat Rempit one at a time with a 3-minute team cooldown, Malaysian power-up names with plain-English copy, `DECK · N LEFT`, and the Core/Full switch with a lobby badge.** Before merging to `main`: **run `supabase/migrations/0010_deck.sql` in Supabase first** — claims call its `draw_card` function, so every station claim fails without it. Full's deck is Core plus Gostan until Plan D adds Toyol, Ah Long and Abang Grab.

**Check-ins follow-up (branch `plan-checkins-followup`, 2026-11-01): strict 45 s check-in window, release-aware counting, marshal "Phone problem: undo", and the auto-jailed Penjara screen are built.** Before merging to `main`: **run `supabase/migrations/0009_auto_jail_undo.sql` in Supabase first** (it widens `safety_records.type` so an undo can be logged; without it, the undo fails). Once merged, auto-jail is ready for players.

**Check-ins build (branch `plan-checkins-autojail`, 2026-11-01): auto-jail after two missed check-ins, `freed_at`, results, and the Penjara rename are built and reviewed.** Before merging to `main`: **run `supabase/migrations/0008_freed_at.sql` in Supabase first**, because the app now reads `players.freed_at` and every game breaks without it. Players shouldn't use auto-jail until the follow-up plan (`docs/superpowers/plans/2026-11-01-kejar-checkins-followup.md`: strict 45 s window, marshal undo, auto-jailed screen) is built too. Runners whose location is off now get a warning on the chase screen.

**Playtest (updated 2026-10-30): the owner will not playtest until everything is in place**, so design work continues first. The first build, when it starts, is still:
1. the check-in design (tight window, auto-jail, optional chaser view at check-in, Penjara);
2. one power-up slot plus the Mat Rempit rule, on today's power-ups;
3. motion design §4–§7: catch stamp, runner bars and Penjara guide, SOS bar with post-game report and feedback, lucky dip.

Then playtest with friends, then a run club. Note catches per game, jailbreaks, on-time check-ins, and power-up usage.

**Consolidated 2026-10-30:** one rules doc with a **Game mode switch, Core or Full** (rules doc). Core is the chase, check-ins, Penjara and four power-ups (Durian, Ponteng, Mat Rempit, Pak Guard). Full adds the rest and Dato Seri.

Designed 2026-10-30 (motion design §6.5–§8.5, power-ups §5c): the marshal SOS screen, a two-person crew, card art (doodle stickers), the ripple ping, the English feed, the results victory lap and the marker scribble. **Organiser setup designed 2026-10-30:** `docs/superpowers/specs/2026-10-30-kejar-organiser-setup-design.md` covers five steps, the kit checklist, walking the park and lobby checks. **Polished station claim, Dato Seri's yellow marker and foil, lobby and share tickets, role scramble, hold to confirm, and the logo loader designed 2026-10-30** (motion §7, §8.9). **Dato Seri's Settle now frees the holder plus up to 2** (rules doc §9c). **Auto-jailed screen and marshal undo designed 2026-10-30** (motion §5a–§5b). **All screens are now designed; next is build plans** (rules doc §12). **How-to-play story designed 2026-10-30** (motion §8.8). **Physical kit** in rules doc §5a: velcro strap tag, yellow chaser vests, orange marshal vests, MR.DIY list. **Chase screen designed 2026-10-30** (motion design §8.6–§8.7): one screen with no scrolling, plus a lock-screen notification with clock times (a live countdown needs a native app). Suggested next: the per-mode how-to-play card and the auto-jailed runner (rules doc §10), then plans and build (rules doc §12), then the endgame ideas above (the shrinking zone can reuse the Plan 4b play-area code); the owner hasn't chosen.

## Setting up a new machine
1. Install Node 20+ and Git, then clone: `git clone https://github.com/howbentan/kejar.git`
2. `cd kejar/app && npm install`
3. Create `app/.env.local`, which is **never committed**. Copy the values from Vercel → Project → Settings → Environment Variables, or run `npx vercel env pull .env.local` after `npx vercel login` and `npx vercel link`. The keys are listed in `app/.env.example`.
4. `npm test` (172 tests should pass), then `npm run dev` for local development.
   - The `/api` functions only run on Vercel; local dev pages that call `/api` need the deployed site.

## Working with Claude on the new machine
Claude's chat history and memory stay on the device they happened on. In a new session, ask Claude to read this file plus the spec and the roadmap first.
