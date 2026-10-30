# Kejar: motion design for the playtest build

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole (Core and Full modes, 2026-10-30). Where this doc disagrees with it, the rules doc wins; its §9 lists what changed.

**Status:** Agreed with the owner in chat on 2026-10-30, using live mockups (`docs/superpowers/mockups/2026-10-30-motion/`), then checked by a reviewer (answers in §11). Not built.
- **Playtest scope** is §4–§8. §8 was agreed with the owner on 2026-10-30, after the reviewer's check, so it hasn't been reviewed yet.

**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §5: safety.
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: the power-ups, and their one-slot rule (§5a).
- `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md`: Penjara.

**The mockups** are HTML fragments made for the brainstorming companion; open them in a browser to see the motion. In the folder:
- `1-catch-chaser.html`: option B is the chosen one.
- `2-catch-runner.html`
- `3-sos.html`
- `4-lucky-dip.html`: the left phone, "Pick a card", is the chosen one.
- `5-later-moments.html`: **superseded** by `14-ping-feed-celebrations.html` and `15-marker-scribble.html` (§8).
- `6-checkin.html` and `7-checkin-states.html`: the check-in moment (§7a); option B in `6-checkin.html` is the chosen one.
- `8-power-up-slot.html`: the one power-up slot with the shared deck (§7b).
- `9-penjara-dare-reel.html` and `10-dato-seri.html`: Penjara and Dato Seri (jail design §3a and §4a).
- `11-rarity-tiers.html`: **superseded.** Blue and purple tiers were rejected; only its yellow legendary (option B) was kept.
- `12-marshal-sos.html`: the marshal's side of an SOS (§6.5).
- `13-card-art.html`: the doodle sticker art for all nine cards (power-ups design §5c).
- `14-ping-feed-celebrations.html`: the ripple ping (§8.1), the feed (§8.2) and six celebration options. The owner chose D (scribble) mixed with E (victory lap).
- `15-marker-scribble.html`: the marker scribble across the app (§8.5), including the chosen results celebration.
- `16-organiser-setup.html`: organiser setup, walking the park and the lobby (`2026-10-30-kejar-organiser-setup-design.md`).
- `17-chase-screen.html`: the chase screen before and after (§8.6).

## 1. Why

Kejar's screens are mostly static: the only motion today is the ping ripple and button presses. The biggest moments in the game happen as plain text: being caught, sending an SOS, getting a power-up. The owner wants those moments to feel **rewarding and fun**, cheeky and Malaysian like the rest of the game, without slowing anyone down mid-chase.

## 2. Goals

1. Make **the catch** a big, shared moment on both phones (§4, §5).
2. Make **SOS** faster to send safely, and clearer about what's happening (§6).
3. Make **getting a power-up** feel like drawing a card (§7).
4. Do all of it within the brand, and without hurting battery, speed on cheap Android phones, or accessibility (§3).

## 3. Library and ground rules

- **Library: [Motion](https://motion.dev) for React** (formerly Framer Motion) (**Claude's call**, owner agreed).
  - Use `LazyMotion` with the `m` component to keep the cost small (about 5 KB at first load, against today's ~1.6 MB app, which is mostly the map).
  - Wrap the app in `<MotionConfig reducedMotion="user">`, so players who turn on "reduce motion" on their phone get no transform or layout animations.
- **Not used:**
  - anime.js, which overlaps with Motion; one animation library only.
  - Kokonut UI, which needs Tailwind and would fight the brand's own CSS. It's used only as inspiration: the press-and-hold SOS came from its HoldButton idea.
- **Ground rules:**
  - Animate only **transform and opacity**, so cheap Androids stay smooth.
  - **No looping animation** while a phone is likely pocketed, to save battery.
  - **Brand colours only:** Volt `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3`.
  - **Brand fonts:** Geist (the stamps use weight 800 with the **kejar.** logo's tight spacing, `letter-spacing: -0.06em`) and Geist Mono.
  - Every animation must tell players something happened, never just decorate.
  - **Haptics:** `navigator.vibrate` where the browser allows it (Android); iPhone browsers don't, so nothing there may depend on vibration.

## 4. The catch: chaser's phone

The moment a chaser's scan is accepted:
1. **A lime flash** fills the screen and fades in about 0.45 s.
2. **A stamp slams down**, scaling from 3× to 1×, tilted −8°, with an overshoot ease:
   - the text `dikejar!` in **lowercase** (owner's choice), Geist 800 with tight logo spacing;
   - lime text with a lime border, on a transparent background.
3. **The phone shakes** briefly (about 0.35 s, a few pixels side to side).
4. **The line `#07 Aina → Penjara`** fades in under the stamp.
5. **A short buzz.**

- **Scope:** this replaces today's text-only catch confirmation for accepted catches.
- **Rejections are unchanged:** too far, no location, Durian blocked and so on stay as plain messages.

## 5. The catch: runner's phone, and walking to Penjara

1. **The stamp and the prison bars land at the same moment** (owner's decision), with a shake:
   - **The stamp:** the same lime `dikejar!` stamp as the chaser's, but on a **solid black plate** (a black background plus a black outline ring, **no glow**), so it reads clearly on top of the bars.
   - **The bars:** five vertical white bars drop from the top of the screen in quick succession.
2. **After about 1.5 s,** both fade out into the **Penjara screen**:
   - `PENJARA` eyebrow;
   - a big `Ben got you.`, with a lime full stop;
   - **one line picked at random** from exactly these five (owner's choice):
     1. `Masuk penjara, bossku!`
     2. `Lepak kat Penjara dulu, bro.`
     3. `Habis la, boss.`
     4. `Hailat bro.`
     5. `Skill issue.`

     The owner chose to keep "bossku" knowing it's associated with a political slogan.
   - **a walk-to-Penjara guide:**
     - a small map with the runner's position, a labelled lime **PENJARA** pin and a dashed line between them;
     - the **distance in metres**;
     - `Walk, don't run.`
3. **The guide is worked out on the phone only:**
   - it uses the phone's own GPS through the browser, never sending positions to the server, so jailed runners still aren't tracked (base spec §6);
   - **within 30 m of Penjara,** it switches to today's spectator view.

**Today's jail screen** says "Walk to jail" but shows Penjara only as an unlabelled dot on a 2-minute-delayed map. The guide fixes that.

## 6. SOS: one bar, hold to send, then say what's happening

Replaces the in-game SOS and Report buttons (`SafetyBar`).

### 6.1 The bar
- **One full-width pill at the bottom** of runner and chaser screens, where the two buttons are today.
- **At rest:** a solid Volt lime bar, with `SOS` in black capitals.
- **Above it,** a small mono hint: `HOLD 1 S · MARSHALS COME TO YOU`.
- **While held:**
  - the bar empties to dark, then **lime fills it from left to right** like a loading bar over **1 second**;
  - lime ripple rings pulse outwards from the bar, in the same visual language as the ping ripple;
  - a short tick buzz at the start.
- **Let go early:** the fill resets. A **quick tap** (under about 0.25 s) shows the lime hint `HOLD FOR 1 SECOND TO SEND SOS` for 2 s. Letting go part-way shows `LET GO TOO EARLY · HOLD 1 S`.
- **At 1 s the SOS sends:**
  - the bar pops, reads **`sos sent`** in lowercase, and gives a longer double buzz;
  - the alert goes out **immediately**, before any choices are made, using today's SOS action.

### 6.2 "What's happening?" (after sending, optional)
- **A card slides up:**
  - `Marshals alerted`;
  - `What's happening? (optional, helps the marshal)`;
  - reason chips: **Hurt · Lost · Unsafe player · Catch dispute · Something else**.
- **Unsafe player** and **Catch dispute** then ask `With who?`, with a chip for each other player.
- **Each tap updates the SOS that was already sent:**
  - **the marshal alert text,** e.g. `SOS from Aina #07: Catch dispute with Ben`;
  - **the saved safety record**, which gains the reason and who it's about.

  This needs a small new server action to add details to an existing SOS (**left to the builder**). It must only work for the player's own SOS from the last few minutes.
- **The card closes itself after 20 s,** with a lime bar along its bottom showing the time left.
- **This is how disputes are settled now:** a catch dispute buzzes a marshal right away, with who and what attached.

### 6.3 Accessibility fallback
- Players who can't long-press, or who use a screen reader, need an alternative. The hint becomes `TAP SOS, THEN CONFIRM`; tapping SOS opens a confirm card (`Send SOS to marshals?` · **Yes, send SOS** · Cancel).
- **How it's switched on** (**left to the builder**): an app setting, or detecting the platform's assistive mode where browsers allow it.

### 6.4 Report moves to after the game
- **There's no Report button during the game any more.** Urgent behaviour goes through SOS (§6.2).
- **The results screen gains two cards:**
  - **`How fun was it?`:**
    - a 1–5 rating, plus an optional `What would you change?`;
    - stored per player per game. This is the owner's community-feedback channel for events.
  - **`Report a player`:**
    - reason chips: Rough play · Catch dispute · Something else;
    - who it's about, plus an optional note;
    - `Send report`.
- **Reports reuse the existing report action and safety records.** That action must accept reports after the game has ended, for players who were in it.
- **Marshals and the organiser** see post-game reports alongside the game's alerts.

### 6.5 The marshal's side of an SOS (added 2026-10-30)

Mockup: `12-marshal-sos.html`. This replaces today's single alert row in `MarshalTools`. The organiser gets this screen too, since the organiser's live view is already a marshal view.

- **Takeover:** a new SOS turns the **whole screen lime**, sliding up over whatever the marshal had open, with a long buzz pattern (`400-150-400-150-400`). With the page closed it arrives as a push notification that opens straight to the takeover. It shows:
  - `MARSHALS · SOS · SENT 0:04 AGO` (the time ticks up);
  - a big lowercase **`sos`** with a ripple ring, then the sender (`Aina #07`) and `RUNNER · FREE · GPS ±12 M`;
  - **What's happening:** a black panel showing `Waiting for Aina to say…`, which pops to the reason when the runner taps a chip (§6.2), e.g. `Catch dispute with Ben #K2`;
  - **an arrow and distance** from the marshal to the SOS (`180 m · NORTH-EAST`), plus a landmark name if the arena has one nearby. This works without reading a map;
  - who's responding: `NOBODY'S GOING YET` / `HAFIZ IS GOING`;
  - **`I'm going`** (primary) and `See the map first`.
- **`I'm going`** marks the marshal as responding, so every other marshal (and the organiser) sees `Hafiz is going` on the alert and doesn't also run. A second marshal can still tap it to go too.
- **On the way:** the map shows a dashed line from the marshal to the SOS, and a card with the sender, reason and a live distance counting down (`You're there` on arrival). **While an SOS is open, the sender's position updates every few seconds,** not just at pings. That's visible to marshals only, and it stops when the SOS closes.
- **Closing:** one outcome chip, **Sorted, all good · First aid given · Player left the game · False alarm**, then `Close SOS`. The outcome and who closed it go into the safety record. The sender sees `A marshal closed your SOS`.
- **The inbox** (the marshal's alert list) has two tabs:
  - **Live:** open SOS alerts are always pinned on top in lime, showing who's going and how far. Below them, under `NEEDS A LOOK`, are the other alerts (boundary, flagged catch, check-ins). Closed ones fade under `CLOSED`, with who closed them and the outcome.
  - **After game:** post-game reports (§6.4), each linked to any SOS from the same player during the game, plus the `How fun was it?` average and the comments.
- **Colour:** lime means "needs you now", consistent with check-ins. There's no red.
- **New server work** (**left to the builder**): a `respondToSos` action ("I'm going"), an outcome on closing an alert (extending today's `handleAlert`), and the SOS sender's live position while the SOS is open.

### 6.6 Running an event with two people (owner's decision, 2026-10-30)

The goal is the smallest safe crew: **two people**.
- **The organiser is the roaming marshal.** That's already true in the code: the organiser's live view has the marshal role and tools, and gets SOS push.
- **One helper, invited as a marshal,** is stationed at Penjara (playing Pak Pulis) and is the backup for any SOS.
- **Why two, not one:** Penjara can run with nobody there (jailbreaks are QR scans, and dares don't decide who gets out), and Dato Seri's stash mode needs nobody (jail design §4b). So one person is technically possible, but if the only marshal is busy with someone who's hurt, nobody is covering everyone else. `I'm going` lets one marshal respond while the other keeps watch.
- **Bigger events can add people** (more marshals, or a quest-giver for Dato Seri's quest-giver mode), but nothing requires more than two.

## 7. The lucky dip: claiming a power-up

When a station claim (or Abang Grab) succeeds:
1. **Five face-down cards fan out across the middle of the screen,** side by side in a gentle arc. Each card is about 96×150 px; they're spread evenly, not bunched at the top (owner's request).
   - **Card back:** the same for every card, ornate like a tarot card but built only from the brand:
     - black, with a lime outer border and a thinner inner border;
     - lime corner marks;
     - a faint lime lattice;
     - a round **kejar.** seal in the middle.
2. **`Pick a card`** appears with a lime bar that drains over **3 seconds**.
3. **The player taps any card.** If they don't tap in time, a **lime spotlight sweeps** across the cards, slows down, and picks one.
4. **The chosen card rises to the centre** (about 1.6× its size) and **flips**. The others drift down and fade away.
5. **`Got Durian!`** (the power-up's name) appears above.

Rules:
- **The server decides the power-up when the station is scanned:** it's the top card of the player's side's shared deck (power-ups design §5b). The tapped card only reveals it; the player's choice never changes what they get.
- **Never flip the other cards** to show "what you could have got". They aren't real alternatives, so that would be showing false information.
- **Tapping during the sweep** skips straight to the reveal.
- **Card front:** the same layout for every power-up:
  - a `POWER-UP` eyebrow;
  - a **round art spot** for the character's illustration;
  - the name in Geist 800;
  - the plain-English effect line.
- **Art** (decided 2026-10-30, power-ups design §5c): each card shows its **doodle sticker** in the character's own colours, from `13-card-art.html`. Hand-drawn wobble, a white sticker edge and a slight tilt. The sticker wiggles briefly when the card lands.
- **One slot** (power-ups design §5a): the revealed card goes into the player's single power-up slot.
- **No rarity colours** (power-ups design §5c): every deck card has the same lime-framed front. Dato Seri, the only yellow card, never comes from the lucky dip.

## 7b. The power-up slot (added 2026-10-30)

Mockup: `8-power-up-slot.html` (six situations). Under the map on runner and chaser screens:

- **The slot area:**
  - a `YOUR POWER-UP` eyebrow;
  - on the right, the deck counter `DECK · 7 LEFT`, the number of cards left in the player's side's deck.
- **Empty:** a dashed outline, `No power-up. Find a station and scan it.`, and a lime **Scan station** button.
- **Holding a card:**
  - a lime-bordered card (art spot, name, effect line) marked `READY`, which drops in with a bounce when it arrives;
  - **Use** opens a confirm (`Use Durian?` plus the effect line);
  - **Scan station** with a full slot is refused: toast `Use your power-up first`, and the note `One power-up at a time. Use Durian, then scan again.`
- **Effect still running:**
  - the card stays in the slot, marked `ACTIVE · 9:42 LEFT` (Durian) or with what it's waiting for (e.g. the next ping), plus a small draining ring;
  - Use is disabled;
  - scanning is refused with `Your Durian is still switched on`.
- **Abang Grab:** Use opens a full-screen chooser:
  - `What should Abang Grab bring?`, with the top three cards as tappable rows and `Keep one. The other two go to the bottom of the deck.`;
  - the tapped card glows and settles into the slot, the other two slide away down the screen;
  - toast `Abang Grab hantar Durian!`;
  - **the delivered card shows it's sealed** (e.g. a small `SEALED` mark), so the player knows Toyol and Ah Long can't take it.
- **Mat Rempit, team cooldown (chasers):**
  - Use is disabled, and the card reads `TEAM COOLDOWN · 2:14`, with the reason `Siti used Mat Rempit recently. Your team can use the next one in 2:14.`;
  - it counts down live, then unlocks;
  - while another surprise ping is still pending, the reason says so instead.
- **Taken by Toyol or Ah Long:** the card is yanked sideways off the screen, with the white toast `Toyol curi Durian kau!`, and the slot returns to empty.

This replaces the "hand of cards" idea in §8.

## 7a. The check-in moment (added 2026-10-30)

Mockups: `6-checkin.html` (option **B, map first**, chosen) and `7-checkin-states.html`. This dresses the check-in rules in `2026-10-30-kejar-checkins-counterping-penjara-design.md` §4–§5; it doesn't change them.

**The alert** (push, 45 s before the ping):
- title `Ping in 45s — check in!`;
- body `Tap to check in. Kejar see you at 5:00.` (the ping's clock time).

**Opening Kejar inside the window (map first):**
- **A lime banner slides down from the top:** a black tick, `Checked in`, and a live countdown `Kejar see you in 0:44`.
- **The map is the screen.** Your own dot gives two quick lime pulses to show your spot was sent.
- **With the organiser's switch on,** the chasers' snapshot circles (lime, ~30 m, labelled `Ben · 4:15`) drop in one after another, with the caption `LIME CIRCLES · WHERE KEJAR WERE AT 4:15`.
- **Penjara stays marked** on the map.
- **The footer** reads `You can pocket your phone now.`
- **A short buzz** confirms it.

**The other situations:**

| Situation | Banner | Rest of the screen |
|---|---|---|
| Switch off | the same lime `Checked in` banner and countdown | no chaser circles |
| Opened too early (before the window) | **dark** banner with a lime outline: `Check-in opens in 1:12` and `Keep Kejar open and it checks you in by itself` | the previous snapshot shown **dashed and faded**, captioned `DASHED · LAST SNAPSHOT, FROM 4:10`, plus `Ping at 5:00. The window is the last 45 s.` When the window opens, it switches to the lime "Checked in" state without a tap, because the open page is already sending locations. |
| Opened too late (after the window) | **white** banner: `Missed this check-in` and `Kejar saw your last spot, marked "missed"` | a strike counter `MISSED IN A ROW` with two bars (one filled); `Miss the next one too and you're sent to Penjara. Next check-in buzzes at 5:15.`; the old snapshot dashed |

**Colour meaning across check-ins:** lime means you're fine, dark means wait, white means a warning. There's no red, since the brand doesn't use it.

## 8. Later moments (agreed 2026-10-30)

Replaces the earlier unreviewed list. ~~The power-up hand~~ is superseded by the one-slot screens in §7b.

### 8.1 Ping reveal: a ripple from you
- When a ping lands, a **lime wave rolls out from the viewer's own dot** to the far edge of the map, with two fainter echoes behind it (about 1.5 s).
- **Each runner's fuzzy circle pops in the moment the wave passes over it,** so near runners appear first. The reveal time comes from each circle's distance from the viewer, along the wave's easing.
- A missed check-in lands as a **dashed** circle. A runner's second miss in a row (auto-jail) lands dashed, then slides off to Penjara, with `#22 MISSED 2 CHECK-INS · SENT TO PENJARA` under the map.
- **Pak Guard:** a dashed 75 m ring around that chaser, and runners inside it land as exact dots instead of circles.
- **If the viewer has no position** (e.g. a marshal without GPS), the wave starts from the middle of the play area.

### 8.2 Feed: what happened, and what it means for you
- **All feed lines are in plain English** (owner's decision). Power-up and role names stay as they are (Durian, Mat Rempit, Kejar, Dikejar).
- **Each line has two parts:**
  - what happened, in bold;
  - a lime `→` line saying what it means **for the reader's side**. Runners and chasers see different `→` lines for the same event.
- **Lines that need the reader to act now get a lime box,** e.g. Mat Rempit for runners, or `5 minutes left` for everyone.
- **Power-up lines show that card's doodle sticker,** popping in; other lines show a small mono label (`PING`, `CATCH`, `FREE`, `2×`, `5:00`). Dato Seri's line has a yellow edge.
- **SOS never appears in the feed.** It goes to marshals as a takeover (§6.5).
- **Secrecy rules still apply** (power-ups design §8): Gostan, Ponteng and Abang Grab's card never appear; Toyol, Ah Long and Mat Rempit say "a Kejar/Dikejar", never who.
- **Starting lines** (Claude's wording; final copy is left to the builder):

  | Event | Bold line | → Dikejar | → Kejar |
  |---|---|---|---|
  | Ping | `Ping: 5 Dikejar seen, 1 missed check-in.` | Kejar now know roughly where you were. | Fresh circles are on your map. |
  | Mat Rempit | `A Kejar used Mat Rempit.` | **Check in now. An extra ping lands in 30 s.** | Extra ping in 30 s. Get close to the circles. |
  | Catch | `Ben caught #14.` | #14 is walking to Penjara. 9 Dikejar still free. | Nice. 9 Dikejar left to find. |
  | Durian | `#07 blocked a catch with Durian.` | #07 is still free. Their Durian is used up. | That catch didn't count. #07 has no Durian now. |
  | Toyol | `A Dikejar used Toyol.` | One Kejar just lost their power-up. | Check your slot: one of you lost a power-up. |
  | Jailbreak | `Hafiz freed 2 Dikejar from Penjara.` | Penjara is empty again. | 2 more Dikejar are loose near Penjara. |
  | Pak Guard | `A Kejar used Pak Guard.` | **At the next ping, anyone within 75 m of that Kejar shows exactly. Move away.** | Next ping shows Dikejar near them exactly. |
  | Ah Long | `A Kejar used Ah Long.` | A free Dikejar just lost their power-up. Check your slot. | One Dikejar's power-up is gone. |
  | Dato Seri found | `Dato Seri has been found.` | One of you holds the legendary: they can free themselves and a friend from Penjara. | A Dikejar can now break out of Penjara with a friend. |
  | Auto-jail | `#22 missed 2 check-ins in a row.` | #22 went to Penjara. Check in when your phone buzzes, or you're next. | One less to find. #22 is in Penjara. |
  | 5 minutes left | `5 minutes left.` | **Survive 5 more minutes and Dikejar win.** | **Catch every free Dikejar in 5 minutes to win.** |

  Bold `→` lines are the ones in a lime box. `Dato Seri has been found` is **Claude's call**: in stash mode the hint zone disappears for everyone when it's claimed, so the feed says why. Claiming it in quest-giver mode stays secret, so that line is stash mode only.

### 8.3 Phase changes
- **`Kejar released.`:** a lime wipe sweeps across, holds and sweeps off.
- **`Game paused`:** a dark panel slides down over the game, with the frozen clock. It slides back up on resume.
- **New, `5 minutes left`:** a white card pops in (`5 minutes left` · `Stay hidden. Kejar are getting desperate.` for runners), and the game clock turns lime and pulses until the end. The feed also gets its `5 minutes left` line (§8.2).

### 8.4 Results: victory lap, then the marker
1. **Victory lap:** the winning side's sticker drives across the bottom of the screen dragging a lime banner: **Gostan's car reversing in** with `DIKEJAR WIN!`, or a **Mat Rempit wheelie** with `KEJAR WIN!` (about 2.6 s).
2. **The marker scribble** (§8.5), starting as the lap passes: it circles the winner title, underlines it twice, adds two stars and draws an arrow to the top award.
3. **The awards** count up as before. Award rows involving a power-up show its sticker.
4. **The `How fun was it?` rating and `Report a player` card** (§6.4) comes last.
- **Suggested extra awards** (Claude's call, for the owner to confirm): `BEST PLAY` (e.g. a Durian that saved someone) and `FOUND DATO SERI` (with how many it freed, on a yellow-edged row).
- The other five celebration options in `14-ping-feed-celebrations.html` (sticker rain, sticker slap, doodle fireworks, team photo) were not chosen.

### 8.5 The marker scribble: Kejar's hype language
A hand-drawn lime marker that draws itself over the screen, used for hype and wayfinding. Mockup: `15-marker-scribble.html`.

- **Where it appears:**

  | Screen | The marker |
  |---|---|
  | Lobby, when sides are set | Circles `Dikejar.` / `Kejar.` (your side), underlines it, adds a star. |
  | Hide phase | Rings the countdown, then three arrows burst outwards ("scatter"). In the last 10 seconds the ring is redrawn every second. |
  | Check-in | When the server confirms, a big **black** tick is drawn across the lime check-in button. |
  | Lucky dip | Circles `Got Durian!` and adds emphasis marks around the revealed card. |
  | Caught (runner) | Underlines the chaser's name in `Ben got you.`, then draws a dashed route from your dot to a big X on Penjara. Same on-device route as §5. |
  | Results | §8.4. |
- **Rules** (Claude's suggestion, agreed):
  - **Shapes only, never handwriting:** circles, underlines, arrows, stars, ticks, X's and bursts. All text stays in Geist.
  - **Lime on black, black on lime,** one marker weight (about 3 px) everywhere, with a slight hand-drawn wobble.
  - **Sized from the text it marks:** circles are measured from the words' box with room on every side, so no letters sit outside the loop (owner's request).
  - **Hype and wayfinding only.** **Never on safety screens:** SOS, the marshal screens, pause, removal and reports stay clean and calm.
  - **One scribble moment per screen,** drawn in under 2 s (each stroke about 0.4 s), then it stays still.
  - **Reduced motion:** the marks appear already drawn.
- **Build note** (left to the builder): draw each stroke by animating its dash offset from the path's real length. The wobble is an SVG displacement filter. In testing, applying it to an inner group hid the strokes in Chrome, while applying it to the whole overlay SVG worked.

### 8.6 The chase screen: one screen, no scrolling (agreed 2026-10-30)

Mockup: `17-chase-screen.html`. This replaces today's scrolling stack in `RunnerChase` and `ChaserChase`. **Both sides use the same layout.**

- **Top bar** (about 40 px):
  - who you are (`DIKEJAR · #07` / `KEJAR · BEN`);
  - the game clock, which turns lime and pulses in the last 5 minutes (§8.3);
  - how many are free.
- **The map fills the middle,** at least half the screen and always visible, even under the check-in banner.
  - **Chips,** not cards, sit along the map's top edge: `Check in in 2:14` (runners) or `Next ping 1:42 · last 3:18 ago` (chasers), plus `● Kejar within 100 m` (glowing lime) and `5 min left · survive`.
  - **The check-in banner** (§7a) drops down over the top of the map, not the whole screen. In Full with the switch on, the chaser snapshot circles show on the map below it.
- **The bottom dock** (about 150 px), top to bottom:
  1. **The slot** (§7b): sticker, name and `TAP TO USE`. While running, it reads `ON · 8:12 LEFT` with a lime tint.
  2. **One Scan button:**
     - **runners:** `Scan`, for stations, a Penjara rescue and the Dato Seri stash. The QR's contents decide which, which replaces today's separate `Break them out` scanner;
     - **chasers:** a big lime `Scan tag`, for catches and stations.
  3. **A one-line ticker:** the newest feed event with its sticker or label, the bold line and the `→` line (§8.2), truncated to one line, plus a `+N` unread count. Lines that need you to act get a lime outline and **one buzz**. **Tapping it opens the full feed** as a sheet that stops above the SOS bar.
  4. **SOS** (§6), always last and always visible. **Nothing ever covers it,** the feed sheet included.
- **Rules:**
  - no scrolling during the chase, including on a small Android (about 360 × 640);
  - one loud thing at a time (rules doc §7);
  - the `Kejar within 100 m` warning, the Dato Seri hint zone and the stations stay on the map, not in the dock.
- **Penjara, hide phase and pause** keep their own screens. This layout is for the chase phase only.

### 8.7 The lock-screen status notification (agreed 2026-10-30)

The owner asked for a countdown on the phone's lock screen. **A live ticking timer needs a native app** (iPhone Live Activities, Android ongoing notifications), and Kejar stays a web app. Instead:

- **One Kejar notification stays on the lock screen and is replaced in place,** using the same notification `tag`, so they never pile up. It shows **clock times, not countdowns**, so it never goes stale:

  ```
  kejar. · Dikejar #07
  Next check-in 3:42 PM · Game ends 4:15 PM
  9 Dikejar free · 2 in Penjara
  ```
  Chasers get `Next ping 3:42 PM · Game ends 4:15 PM` and the counts.
- **When it updates:**
  - **every check-in alert** (§7a), which buzzes as today;
  - **`10 minutes left` and `5 minutes left`,** which buzz;
  - **pause and resume,** which buzz. A pause shows `Game paused`; a resume shows the new times (`Resumed · now ends 4:21 PM`).
  - Other refreshes, e.g. counts after a ping, are **silent** (`renotify: false`).
- **Who gets it:** every player and marshal who has push alerts on, from the start of the chase until the results. Marshals keep their separate SOS alerts (§6.5).
- **Times use the phone's own time format and time zone,** computed from the server's times.
- **Caveats:**
  - On iPhone, web push only works when Kejar is added to the home screen (iOS 16.4+), and iPhones are still untested (`docs/superpowers/spike-results.md`).
  - Some Android battery savers delay pushes, which is another reason to show times rather than countdowns.
- **Server work** (left to the builder): the existing push sender gains the status payload and the `tag`. Each update is one push per subscribed player, at most about one a minute, so it stays within free-tier limits.

## 9. Constraints

- **Free tiers only.** Motion is MIT-licensed and loads from npm with the rest of the app.
- **Single `api/game.ts` function;** any new server action (the SOS details, the post-game rating) goes on the existing router.
- **Database:** the post-game rating needs a place to live, e.g. a small table or the existing events. Any new table is a numbered migration that the owner runs in Supabase by hand.
- **Tests:** the existing screen tests mock the map and the API, and the same applies here. Animation timing must not make tests flaky:
  - drive state changes directly;
  - keep any timing constants exported, so tests can use them.

## 10. Left to the builder

- Exact component split: e.g. a shared `Stamp` used by both catch screens, and a `LuckyDip` overlay.
- How the 20 s auto-close, the 3 s pick timer and the 1 s hold are wired, as long as they match the numbers above.
- The server action that adds a reason and person to an existing SOS, and how the alert text is rebuilt from it.
- Where the accessibility switch lives.
- Storage for the post-game rating.

## 11. Resolved after the reviewer's check (all Claude's calls, for the owner to confirm)

1. **Build order.** This is part of the playtest build (see `docs/HANDOFF.md`), built **after** the check-in / Penjara design and the one-slot change.
   - It's built against **today's power-ups:** the lucky dip and card fronts show today's names (Decoy, Shield, Cloak, Flare, Focus) and their initials. The Malaysian names drop in later when that design is built, with no change to the motion.
   - "Penjara" exists by then, because the check-in design renames it.
   - The jail dare wheel and Dato Seri are **not** designed into the Penjara screen now; that design adds them later.
2. **Auto-jailed runners** (missed 2 check-ins, no chaser) get **the bars only, with no `dikejar!` stamp**, because nobody caught them.
   - The Penjara screen's headline is `You missed 2 check-ins.` in place of `Ben got you.`.
   - It uses the same random line pool and the same walk-to-Penjara guide.
3. **SOS bar states:**

   | State | When | What it shows |
   |---|---|---|
   | Sending | the hold completes and the request is in flight | the bar stays full and reads `sending…` |
   | Sent | the server confirms | `sos sent`, then the "What's happening?" card |
   | Sent, nobody reachable | the server returns `notified: 0` | `sos sent`, but the card's heading is today's line (`SOS saved, but no marshal has alerts on. Find a marshal or call for help.`) instead of `Marshals alerted`; the reason chips still show |
   | Repeat within 30 s | the server returns `repeat: true` | `sos sent`, and any details attach to that player's most recent SOS |
   | Failed | a network or server error | the bar shows `not sent · hold again` in lime and resets; the card doesn't open |
4. **Post-game reports and ratings:**
   - **They're stored only, with no push to marshals.** Nobody should get buzzed hours after a game.
   - The **results screen for marshals and the organiser** gets a "Reports" list showing that game's post-game reports.
   - **Ratings are only stored for now.** The owner reads them in Supabase; a dashboard can come later.
5. **Time limit:** players can rate and report until **24 hours after the game ends**, matching when game data is deleted. It only works from the phone that played: there are no accounts, and players are identified by their game session on that phone.
6. **Reason lists:**
   - SOS details use `hurt`, `lost`, `unsafe`, `dispute`, `other`. Two are new values; the labels are Hurt, Lost, Unsafe player, Catch dispute, Something else.
   - Post-game reports use `unsafe`, `dispute`, `other`, labelled Rough play, Catch dispute, Something else. "Rough play" is a new label for the existing `unsafe` reason, so stored records keep their meaning.
7. **Flagged catches** (the runner's position was unknown) get the **full** catch animation on both phones: the catch counts and the runner is jailed, so showing that is accurate. Marshals still get the "Check catch" alert to review afterwards.
