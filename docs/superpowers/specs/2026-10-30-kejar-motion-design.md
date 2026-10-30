# Kejar: motion design for the playtest build

**Status:** Agreed with the owner in chat on 2026-10-30, using live mockups (`docs/superpowers/mockups/2026-10-30-motion/`), then checked by a reviewer (answers in §11). Not built.
- **Playtest scope** is §4–§7.
- §8 is mocked up but **not reviewed or in scope**.

**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §5: safety.
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: the power-ups, and their one-slot rule (§5a).
- `docs/superpowers/specs/2026-10-30-kejar-checkins-counterping-penjara-design.md`: Penjara.

**The mockups** are HTML fragments made for the brainstorming companion; open them in a browser to see the motion. In the folder:
- `1-catch-chaser.html`: option B is the chosen one.
- `2-catch-runner.html`
- `3-sos.html`
- `4-lucky-dip.html`: the left phone, "Pick a card", is the chosen one.
- `5-later-moments.html`

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
- **The server decides the power-up when the station is scanned,** with the same equal odds as today. The tapped card only reveals it; the player's choice never changes the odds.
- **Never flip the other cards** to show "what you could have got". They aren't real alternatives, so that would be showing false information.
- **Tapping during the sweep** skips straight to the reveal.
- **Card front:** the same layout for every power-up:
  - a `POWER-UP` eyebrow;
  - a **round art spot** for the character's illustration;
  - the name in Geist 800;
  - the plain-English effect line.
- **Art is a separate task.** Until each character has its illustration, the art spot shows the initials (e.g. `D`, `AG`). All nine share one style: lime line art on black in the round frame, matching stroke weight. This also answers the power-ups design's open question on icons: brand colours, not emoji.
- **One slot** (power-ups design §5a): the revealed card goes into the player's single power-up slot.

## 8. Later: mocked up, not reviewed, not in the playtest build

`5-later-moments.html` shows these. The owner hasn't reviewed them yet, and they wait until after the first playtest:
- **The power-up slot:** a card drops and bounces in when claimed; it lifts, glows and flies up when used; Toyol or Ah Long yank it sideways with `Toyol curi Durian kau!`.
- **Ping reveal:** runners' fuzzy circles drop onto the map one by one with a lime pulse; a missed check-in lands dashed.
- **Feed and marshal alerts** slide in at the top; an SOS alert flashes lime twice.
- **Phase changes:**
  - a lime wipe sweeps across for `Kejar released.`;
  - a dark panel slides down for `Game paused`, with the frozen clock.
- **Results:** the winner pops in, then each award slides up one after another, with its number counting up.

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
