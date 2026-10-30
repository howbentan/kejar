# Kejar: organiser setup, walk the park, and the lobby

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole (Core and Full modes, 2026-10-30). Where this doc disagrees with it, the rules doc wins; its §9 lists what changed.

**Status:** Agreed with the owner in chat on 2026-10-30 from a live mockup (`docs/superpowers/mockups/2026-10-30-motion/16-organiser-setup.html`). Not built, and not yet checked by a reviewer.
**Builds on:**
- rules doc §1 (Game mode switch), §5 (crew and kit), §10 item 1;
- `2026-10-27-kejar-plan4b-arenas-design.md` (saved parks, placing stations, Penjara and the start);
- `2026-10-26-kejar-plan4a-organiser-accounts-design.md` (organisers, marshal invite links);
- jail design §4b (the Dato Seri stash), motion design §6.6 (crew of two) and §8.5 (the marker scribble).

## 1. Why

Today's `New game` (`HostNew`) is one long page: invite an organiser, the park, settings and Create. The new rules add a mode, Full-only options, a crew and a kit list. Put on one page, that becomes a wall. Running an event also has a physical half (printing, packing, taping cards around a park) that the app doesn't help with yet, and one forgotten item breaks a game.

## 2. Creating a game: five short steps

A progress bar of five segments sits at the top. Each step has one `Next` button, and Back works throughout.

1. **Park:** today's saved-parks screen (Plan 4b), unchanged, including "Move things for this game only".
2. **Core or Full:** two large cards.
   - **Core** is preselected and tagged `BEST FOR FIRST-TIMERS`: `The chase, check-ins and Penjara, plus 4 simple power-ups. Learnable in 5 minutes.`, with the four doodle stickers.
   - **Full** is tagged `FOR REGULARS`: `Everything in Core, plus 4 more power-ups and Dato Seri, the legendary.`, with all nine stickers.
3. **Settings:**
   - **Length presets:** **Quick** (30 min), **Standard** (45, preselected) and **Long** (60). A summary line under them (`Hide 5 min · ping every 5 min · Penjara view 2 min behind`) has a `Change` link that opens today's number fields and the check-in mode (push or fixed schedule).
   - **Full only:**
     - **Dato Seri:** `Off`, `Stash` (default) or `Quest-giver`, with a one-line explanation of the selected option;
     - **"Dikejar see Kejar at check-in"**, default off.
   - In Core, a line instead says there are no extra settings and points back to the mode step.
4. **Crew:**
   - **Expected players:** `Up to 20`, `21–30` or `31–40`. The app suggests the crew from rules doc §5: you plus 1 helper up to 20, then about 1 more marshal per 10.
   - **A row per crew member:**
     - **You:** roaming marshal, gets every SOS, `READY`;
     - **Helper at Penjara:** marshal, plays Pak Pulis, `INVITE`;
     - more marshals as suggested;
     - **Quest-giver** (yellow) when Dato Seri is in quest-giver mode.
   - `Send invite links on WhatsApp` shares each row's marshal invite link (today's `createMarshalInvite`) through the phone's share sheet. Each link is personal.
   - The suggestion is advice. The organiser can add or remove rows.
5. **Kit:** the checklist (§3), then **Create game**.

The organiser-invite card (`Invite another organiser`) moves off this flow to the organisation's settings (**Claude's call**), since it isn't about one game.

## 3. The kit checklist

Built from this game's settings, in two groups:
- **PACK:**
  - runner tags, with the count and numbers (e.g. `14 armbands (#01–#14)`) and **Print**;
  - vests (lime for Kejar, marshal vests), with counts from the roles;
  - station cards (count from the park), with **Print**;
  - the Penjara card, with **Print**;
  - **Full, stash mode:** the Dato Seri stash card (`Secret`), with **Print**, plus tape and a zip bag;
  - **Full, quest-giver mode:** the Dato Seri coin and the quest-giver's vest;
  - tape and a power bank.
- **BEFORE PLAYERS ARRIVE:**
  - walk the park (§4), placing stations and Penjara, and hiding the stash;
  - helper briefed: Penjara duty, dares and SOS.

Behaviour:
- **Ticking an item draws a lime marker tick** and strikes the text through. Ticking every item circles `Ready for event day` with the marker (motion design §8.5).
- **Ticks are saved per game** and stay until the game starts, so the organiser can pack the night before and continue on event day (**Claude's call**, owner agreed).
- Print buttons open today's print sheet (`PrintTags`), filtered to that item. The stash card prints on its own page so nobody sees it on the station sheet.
- **Counts follow changes.** If players join after the list was made and more tags are needed, the item un-ticks and shows the new count.

## 4. Event day: walk the park

Opened from the kit checklist or the lobby. One map and one card for the next thing to place.
- **The map** shows the park, your dot and a numbered pin for each thing to place (stations, Penjara). The next one pulses, and placed ones fill lime.
- **The card** shows `NEXT · 2 OF 4`, the thing's name, and the distance and direction (`210 M · EAST`).
- **Within about 15 m** (**Claude's call**) the card turns lime: `YOU'RE HERE · 8 M` · `Tape Station 2 here.` · `At eye level, facing the path.`, with a `Station 2 is up` button.
- **The Dato Seri stash is last, secret, and yellow** (Full, stash mode):
  - its pin is a yellow `?`, and it's shown only to organisers;
  - the card says `Secret. Only you see this. Pick any spot nearby.`, and in the area, `Hide it somewhere sneaky. Under a bench, behind a sign.`;
  - **`Drop Dato Seri here`** saves the phone's current position as the stash, which sets the fuzzy hint zone (jail design §4b). The organiser can move it again until the game starts.
- **Finished:** `Kit's out.` and a pointer back to the lobby.
- **The helper sees the same list,** apart from the stash, so the two can split the walk. Ticks are shared.
- Placing is a tick, not a GPS-verified step. Saved spots already come from the park setup; this screen only guides the organiser and records that it's done. **"Drop Dato Seri here" is the only step that saves a position.**

## 5. The lobby

Keeps today's join QR, code, player list and role shuffle. It adds:
- **a mode badge**, `CORE` or `FULL`, next to the code;
- **`BEFORE YOU START`**, four checks:
  - **Kit placed:** ticked by the walk (§4);
  - **Helper joined:** ticked when the helper's invite is redeemed, showing their name and post;
  - **SOS alerts on:** ticked when the organiser and every marshal have push alerts on (today's `AlertsOnPhone`);
  - **Brief the players:** tapping it pushes the how-to-play card for this mode to every player's phone (rules doc §10 item 3; the card itself is still to be designed).
- **`Start game`** is always available. Unticked checks **warn but never block** (`Unticked items warn you, but never block Start.`). Real events have surprises, and the organiser decides.

## 6. Data and server notes (left to the builder)

- **Game settings gain:** `mode` (`core` / `full`), `datoSeriMode` (`off` / `stash` / `quest`), the existing snapshot switch (Full only), and an expected-players band (only used for crew and kit suggestions).
- **New per-game state:**
  - the kit ticks (which items are done; a small JSON column or table);
  - the walk-the-park placed flags;
  - the Dato Seri stash position (lat/lng, hidden from every view except organisers').
- All of this needs a numbered migration, which the owner runs in Supabase by hand.
- **Secrecy:** the stash position must never appear in player or helper views. Players only ever get the fuzzy zone (jail design §4b).
- **Mode is set at creation and can be changed in the lobby, never after start** (rules doc §1). Changing it in the lobby rebuilds the kit list.

## 7. Not in this design

- Editing the park's saved spots on event day. That's still Plan 4b's "move for this game only", before the walk.
- GPS-verifying each placed card.
- The how-to-play card's content (rules doc §10 item 3).
