# Home upgrades: scan, reconnect details, tip, backflip, countdown

Date: 2026-11-12
Mockup: `docs/superpowers/mockups/2026-11-12-home-upgrades/index.html` (launch config `upgrades-mockups`, port 5181), section "Everything in one go".

**The mockup still shows three things we decided to cut**: the bouncing power-up, the iPhone line on home, and hold-to-sprint. Build what this document says, not those.

## Intent

The home screen (the running j, `join game`, `organise game`, `reconnect`, the how-to-play link) is opened by people standing in a park about to play. It should do two jobs:

- get them into the game fast;
- keep them company for the minute before it starts.

Anything else competes with the buttons. There is one moving thing on home, the running j, and these upgrades must not add another.

## Goals

1. **Scan from home.** A round camera button sits beside `join game`. It opens the existing QR scanner, and a good scan goes straight to the join form.
2. **Remember my name.** The join form fills in the name used last time, with a "not you?" link that clears it.
3. **Reconnect that says what you're going back to.** The reconnect button becomes a card. It shows the code, the park, and where the game is at:
   - lobby, with the player count when known;
   - hiding;
   - chasing, with time left;
   - ended.
4. **A tip under the logo.** One short line from the game's own copy, picked once per visit. Tapping it shows the next one.
5. **The j's backflip.** Three quick taps make the j backflip; one tap still jumps, as now.
6. **A countdown to the start**, in the owner's hand-drawn digits. If you're in a game that hasn't started and the organiser has set a start time, home shows "GAME ABC234 STARTS IN" and the time left. Each changed digit draws itself in along its own stroke, like a marker. It takes the tip's place.
7. **Organisers can set a planned start time** in the lobby. This is what the countdown counts down to. It is optional and only informs: it does not start the game.

## Non-goals and cuts

- No bouncing power-up on home. (It may come back on a waiting screen like the lobby later; not now.)
- No iPhone add-to-home-screen line on home: the join form already has that card, at the moment it matters.
- No hold-to-sprint: a long press on phones triggers text selection or system menus.
- No score and no new game rules.
- The planned start time never starts the game automatically. The organiser still taps start.

## Anti-goals (a failure even if it works)

- **A second moving thing on home.** The tip changes only when tapped. The countdown ticks only while you're waiting for a game you're in, and nothing else moves except the j.
- **Home waiting on the network.** The buttons and the plain reconnect show at once. The details fill in when they arrive, and if the request fails the card stays plain.
- **A wrong reconnect.** If the server says the game is gone or you're not in it, show no reconnect.
- **A tip that isn't true.** Tips come only from copy the game already uses (power-up effects, how-to-play cards).
- **No em-dashes** in any player-facing copy (standing rule).

## Behaviour

### 1. Scan from home

- **Layout.** The `join game` row is the lime `join game` button (flexible width) plus a round lime camera button (52 px at a 290 px screen width) on its right, labelled `scan qr` for screen readers.
- **Scanning.**
  - Tapping it opens the existing `Scanner` (`app/src/game/Scanner.tsx`), as `HomeJoin`'s `scan qr` does today.
  - The result is parsed with the existing `joinCodeFrom` (`app/src/screens/HomeJoin.tsx`). A hit goes to `/join/<CODE>`.
  - A miss shows "That QR is not a kejar game." and closes the scanner.
  - Cancel closes it.
- **Motion.** While the scanner is open, the j keeps running but taps don't make it jump (HomeLogo's `loading` mode, as the join step uses).

### 2. Remember my name

- **Saving.** When a player joins successfully (`Join.tsx`), save the name they used on the phone (key `kejar.name`). Do the same for a marshal joining through `MarshalRedeem`.
- **Prefill.**
  - The join form starts with that name filled in, and shows a small line under the field: "✓ remembered from your last game".
  - A "not you?" link inside the field clears the field and forgets the saved name.
- **The agreements stay unticked** and need a fresh tap every game.
- Storage that throws is ignored: the form just starts empty.

### 3. Reconnect card

- **Shape.** When `reconnectHref` (`app/src/game/lastGame.ts`) gives a link, home shows a white (paper) card in place of today's `reconnect` button:
  - line 1: "reconnect" and an arrow;
  - line 2, in mono: `ABC234 · <park name> · <status>`.
- **Status:**
  - `lobby` (with `· 9 players` when a count is available);
  - `hiding`;
  - `chasing · 12 min left`;
  - `ended`.

  Chasing and hiding show a small pulsing green dot. When the game has ended, line 1 reads "see results".
  When the game is in its lobby, line 1 reads "back to the lobby".
- **Getting the details.**
  - Home makes one `state` request for that game, using `credentials(code)` from `app/src/game/auth.ts` (player token, else organiser session).
  - Location is never sent.
  - Read the park from `view.arena.name`, the phase from `view.phase`, time left from `view.endsAt - view.now`, and the player count from whatever the view offers (the builder picks: for example `roster.length` for an organiser). If no count is available, leave it out.
- **Before and after the reply.**
  - Until the reply arrives, the card shows line 1 and `ABC234` only.
  - If the reply is an error that means the game is gone or you're not in it (404, 401 or 403), hide the card.
  - Any other failure keeps the plain card.
- The card links where reconnect links today (`/g/<CODE>` or `/host/<CODE>`).

### 4. Tip under the logo

- **Content.** A list of short tips, each 60 characters or fewer, written only from existing copy:
  - the power-up effects in `app/src/game/powerInfo.ts` (for example "Ponteng skips your next ping.");
  - plain rule lines from the how-to-play cards (`app/shared/howToPlay.ts`), for example who wears the lime vest and who wears the white armband.

  The power-up names are the game's (Ponteng, Durian, Gostan, Pak Guard, Mat Rempit…).
- **Choosing and showing.**
  - One tip is picked at random when home opens. Tapping the tip shows the next one; nothing changes on its own.
  - It sits centred under the logo: a small lime `TIP` eyebrow, with the line below it in dim text and the power-up name in bold.
- **Taps.** Tapping the tip must not make the j jump: the tip sits above the logo's tap area.
- **When it's hidden.** Hide the tip while the countdown shows. Also hide it during the opening, until the buttons have come up.

### 5. Backflip

- **Trigger.** In HomeLogo's `home` mode, three taps within 600 ms make the j do a backflip instead of a third jump. It rises, rotates a full turn backwards around its middle, lands, and goes back to running. About 0.7 s, the same lime flash and buzz as a jump.
- **Taps.** Taps during a flip are ignored, as taps during a jump already are.
- **Motion and craft.**
  - With reduced motion there are no tricks, as now.
  - It lands on a whole stride, like every other stop (see `app/src/game/homeLogo/stride.ts`).

### 6. Countdown

- **When it shows.**
  - On home, when there is a reconnect game;
  - its `state` reply says the phase is `lobby`;
  - and `view.settings.startsAt` is a future time.
- **What it shows.**
  - It replaces the tip with an eyebrow, "GAME ABC234 STARTS IN", in lime mono caps.
  - Below the eyebrow is the time left as `m:ss` (and `h:mm:ss` from an hour up), about 40 px tall at a 290 px screen width, in the owner's hand-drawn digits.
  - The colon is two small hand-drawn dots.
- **After the start time.**
  - At zero, it reads "starting soon" and stops ticking.
  - If the game has started by then, the next `state` check flips the card to `hiding`, so refresh the details about every 30 s while the countdown shows.
- **Drawing the digits.**
  - Each digit is the owner's drawing, revealed along its traced centre line with a stroke mask over about 0.55 s, so it looks written by a marker.
  - Only the digits that changed redraw. The first render draws all of them once.
  - With reduced motion, digits appear without drawing.
- **Assets** (from the mockup folder): copy to `app/public/digits/`:
  - `digit-0.png` … `digit-9.png` (white, the owner's drawings; the 0 and 8 are the newest versions);
  - `digit-paths.json`: per digit, the image width and height, an SVG path `d` along the stroke in image pixels, starting from the top, and a mask stroke width `sw`.

  The mockup's `digitSvg()` shows the technique: an SVG `<mask>` holding the path with `stroke-dasharray: 1; pathLength: 1`, animating `stroke-dashoffset` from 1 to 0, over an `<image>` of the digit.

### 7. Planned start time (organiser)

- **Setting.** Add an optional `startsAt` to the game's `Settings` (`app/shared/types.ts`): an ISO time string, or null. Settings are stored as jsonb, so there's no migration. Older games have none, so readers treat it as null.
- **The new action** `setStartTime`:
  - organiser only, lobby only;
  - takes an ISO time or null;
  - accepts only times from now up to 24 hours ahead, and returns 400 otherwise;
  - stores the time in settings.

  The settings whitelist (`settingsFrom` in `app/api/_lib/actions.ts`) must keep `startsAt` through it.
- **In the lobby (`HostLobby`):**
  - a row reading "planned start" with a time picker (today or tomorrow, to the minute) and a "clear" link;
  - when set, it shows "starts 7:30 pm · in 12 min".

  Players see it through `view.settings.startsAt`. Their lobby screen may show "starts in 12 min" (builder's call; the countdown on home is the must).
- **It never starts the game.**

## Constraints

- React/TS, Vite, motion/react, Vitest. No new dependencies.
- Existing tokens only (volt, black, white or paper, hair, dim), flat colours.
- **The production build must pass:** `cd app && npm run build` (that is `tsc -b && vite build`). `npx tsc --noEmit -p .` checks nothing in this repo.
- **Home must never break on blocked or odd storage**, as today: wrap storage reads.
- **Server changes follow the existing action patterns:** auth, a lobby-only check, and tests in `app/api/_lib/actions.test.ts`.

## Tests (what "done" means)

**Home**
- The camera button opens the scanner. A join link or bare code goes to `/join/<CODE>`; anything else shows the error.
- The reconnect card:
  - shows code, park and status from a mocked `state`;
  - hides on a 404, 401 or 403;
  - stays plain on other failures;
  - reads "see results" when ended and "back to the lobby" in a lobby.
- The tip: one shows; tapping changes it; it isn't shown with the countdown; tapping it doesn't trigger a jump.
- The countdown:
  - shows only for a lobby game with a future `startsAt`;
  - ticks;
  - reads "starting soon" at zero;
  - with reduced motion, shows digits without the draw class.

**Join**
- The join form prefills the saved name; "not you?" clears it.
- A successful join saves the name; a marshal redeem saves it too.

**HomeLogo**
- Three quick taps make a backflip; a fourth tap during it does nothing; it lands back in its stride.

**Server**
- `setStartTime` sets and clears.
- It rejects a non-organiser, a started game, a past time and a time more than 24 hours ahead.
- `startsAt` survives `settingsFrom`.

**Lobby**
- The organiser sets and clears the planned start.

## Calls made after the builder check (mine, not the owner's)

1. **Triple-tap counting.** Every tap counts toward the triple, including taps ignored because the j is mid-jump. A third tap within 600 ms of the first starts the backflip from wherever the j is, so the flip takes over a jump already in the air. Taps during the flip are ignored.
2. **Where `startsAt` is checked.**
   - `settingsFrom` keeps `startsAt` only if it is a valid ISO time or null, and drops anything else to null.
   - `create` always stores null.
   - `setMode` keeps whatever is there; a time that has passed just reads "starting soon".
   - The 0 to 24 hour range check lives only in `setStartTime`.
3. **Clock.** The countdown corrects for a phone's wrong clock. At each `state` reply it keeps the difference between `view.now` and the phone's time, and counts down using the phone's time plus that difference.
4. **Card status when hiding or paused.** In `hiding` the card shows "hiding" with no time. If `view.paused` is true, the status reads "paused" (no time, no pulsing dot), whatever the phase.
5. **The organiser's time picker.** It sends the next time that clock reading comes round: if the chosen time today has already passed, it means tomorrow. The client sends a full ISO time. The server still rejects anything in the past or more than 24 hours ahead.
6. **The player count.** Players' views don't include the roster, so players see "lobby" with no count. Organisers see the count from their roster. This is expected, not a bug.
7. **Refreshing.** While the countdown shows, home refreshes the game's details every 30 s until the phase leaves `lobby`, including after "starting soon". It pauses while the tab is hidden and refreshes once when the tab comes back.

## Left to the builder

- Component split and names (for example `ReconnectCard`, `DrawnNumber`, `TipLine`), and the storage key details.
- The exact tip list, within the rules above.
- The time picker's control (a native `<input type="time">` is fine).
- Whether the players' own lobby screen shows the planned start too.
- Fine tuning: backflip height, draw timing and the countdown's size, within the feel described.
