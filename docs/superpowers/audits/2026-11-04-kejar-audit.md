# Kejar audit, 2026-11-04

Scope: the live app on `main` at `8188315`. It covers who can call what, database access rules, what reaches the browser, abuse limits, errors, cost per screen refresh, spot checks of game logic, and data retention. It was done by reading the code. Nothing was attacked or load-tested.

## Summary

- **High:** 2. A leftover test endpoint lets anyone send push notifications, and nothing limits how often anyone can call the API.
- **Medium:** 5.
- **Low:** 4.

The core game API is in good shape. All 36 actions check who's calling, and the checks are consistent. Every database function is locked to the server. Every table has row-level security on, with no public policies. The Plan D secrecy work holds.

## High

### H1. The ping-spike test code is still live

- **Files:** `app/api/send-ping.ts`, `app/api/ack.ts`, `app/src/spike/*`, the `spike-*` routes in `app/src/App.tsx`, `app/src/lib/supabase.ts`.
- **Problem:**
  - `POST /api/send-ping` has no sign-in check. Anyone who finds it can make every phone registered during the October push test buzz, as often as they like.
  - `POST /api/ack` writes to the database with no check at all.
  - The browser bundle still ships the Supabase public key for the spike pages.
  - If `0002_drop_spike.sql` was never run (HANDOFF said "not yet run"), the `spike_*` tables still let anyone holding that public key read and change them. That includes the test phones' push addresses.
- **Fix:**
  - Delete the two spike functions, the spike pages and routes, and `src/lib/supabase.ts`.
  - Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Vercel.
  - Run `0002_drop_spike.sql` in Supabase.
  - This also brings the app back to its "one function" rule.

### H2. No rate limiting anywhere

- **File:** `app/api/game.ts` (every action).
- **Problem:** nothing limits how often anyone calls the API.
  - **Join spam:** with a game code, a script can add thousands of players to a lobby.
  - **Unbounded location writes:** a player's token can write as many location rows as it likes, every one a database row on the free tier.
  - **Code guessing:** someone can keep guessing 6-letter codes to find live lobbies.
- **Fix:** stay on free tiers.
  - Cap players per game (for example 80), checked in `join`.
  - Drop location writes that arrive less than about 2 s after the last one from the same player.
  - Add a small fixed-window limiter: a Supabase table plus one atomic SQL function, keyed by IP for `join`, `state` and the invite actions, and by token for everything else. It answers 429 with plain copy.

## Medium

- **M1. Errors leak internals.** `app/api/game.ts:36` sends the raw message of any unexpected error to the browser, which can include database error text and constraint names. Fix: log it on the server and return `Something went wrong`.
- **M2. A malformed request body crashes the function.** `JSON.parse` runs before the `try` (`app/api/game.ts:11`), so a malformed body fails without a clean answer. Fix: move it inside the `try`, and answer 400.
- **M3. Each screen refresh is expensive.**
  - `state` runs every 3 s on every phone and makes roughly 10–14 database calls:
    - it loads the game twice;
    - `advance` loads pings and players;
    - it loads all the game's events every time;
    - it makes one positions lookup per moment, plus the snapshot moment.
  - 30 phones means roughly 100+ queries a second, and about 36,000 function calls in an hour-long game.
  - Fix: reuse what `advance` already loaded, load the game once, fetch only recent events, and measure at the playtest.
  - Separately, Vercel's free Hobby plan is for non-commercial use, and Kejar runs paid events. Check Vercel's terms; Pro may be needed.
- **M4. Personal data is never deleted.**
  - Everyone's GPS trail (`locations`), names, events and `safety_records` are kept forever.
  - Plan 6 already planned deletion after 24 h, and after 12 months for safety records. Under Malaysia's personal-data law (PDPA), paying customers' location trails are personal data.
  - Fix: build Plan 6's deletion, and make sure the join screen's waiver says location is collected and for how long.
- **M5. Game codes use a weak random source.** `newGameCode` uses `Math.random`, not the crypto generator the tokens already use. It's fine once H2's limits are in, but `crypto.randomInt` is a one-line change.

## Low

- **L1. No security headers.** `vercel.json` has none: no Content-Security-Policy, no frame-ancestors (a site could frame Kejar), and no Referrer-Policy.
- **L2. `accuracy_m` isn't checked.** The location action stores any number, including negative or huge values. Other code clamps it, but the stored value is junk.
- **L3. Phones report their own GPS, and the server trusts it.** Catches, jailbreaks, station claims and Settle all rely on it, and dev tools can fake it. This comes with being a web app; marshals and SOS are the backstop. It's noted, not something to fix.
- **L4. HANDOFF is out of date.** Several sections still say "not built" for things that are live: check-in fixes, motion, power-ups, Dato Seri, C3, and Plan D's ping-fuzz follow-up (now fixed).

## Checked and fine

- **Who can call what:** every game action finds the caller through a hashed token (`requirePlayer`, `requireMarshal`, `requireOrganiser`). Organiser actions are limited to the organiser's own organisation, and invites are single-use with expiry.
- **Database functions:** `claim_station`, `draw_card`, `steal_card`, `open_grab`, `pick_grab`, `claim_dato`, `latest_positions` and `resume_game` are all revoked from public and granted only to the server.
- **Tokens:** 32 random bytes from crypto, stored only as SHA-256 hashes.
- **Secrets in views:** `deck_seed`, Dato Seri's stash and code, and other players' cards never reach players. Plan D's tests enforce this.
- **Game logic, spot-checked** (catch, Durian block, jailbreak, all-caught finish): atomic where it needs to be. Cross-feature interactions were covered by Plan D's final review.

## Suggested order

1. H1, which is an hour, plus running `0002` in Supabase.
2. H2 together with M1, M2 and M5: one small "API hardening" plan.
3. M3: measure at the playtest, then trim the refresh work.
4. M4: Plan 6's deletion work, which is needed before paid events.
5. L1 and L2 alongside 2, and the L4 HANDOFF tidy-up any time.
