# Kejar: the rules (Core and Full modes)

**Status:** Consolidation pass, agreed with the owner in chat on 2026-10-30. **This is the single source of truth for what the game is.** The other specs hold the detail (§8 says which owns what). Where one of them disagrees with this doc, this doc wins. Nothing here is new design, apart from the two game modes (§1), the Core deck (§3) and the conflicts settled in §9. Not built.

## 1. Two game modes, one switch

The organiser picks a **Game mode** when creating a game (owner's decision):
- **Core**, the default for first-timers: the chase, check-ins, Penjara and a small deck of 4 power-ups. Learnable in five minutes.
- **Full**, for regulars: everything in Core, plus the rest of the power-ups, Dato Seri and the "see Kejar at check-in" switch.

Rules:
- **Both modes are fully playable** in the same app, so events can run either and compare them (the owner wants to test both).
- **The mode locks when the game starts.** It can be changed in the lobby, but never mid-game.
- **Everyone sees which mode they're in:** a `CORE` or `FULL` badge in the lobby, and the lobby's how-to-play card only explains what that mode uses (§10).
- Saved parks (Plan 4b) work with either mode. Stations are the same printed cards in both.

## 2. The rules in one page (both modes)

**Roles.** Dikejar (runners, about 3 in 4 players), Kejar (chasers, about 1 in 4) and marshals. The organiser is also a marshal. Roles are assigned or shuffled in the lobby, and the app refuses lopsided teams.

**Kit.** Runners wear an armband with a velcro tag that has a QR code and a number (e.g. #07). Chasers wear lime vests, and marshals wear vests marked MARSHAL.

**Flow.**
1. **Join:** open the link, enter a name, accept the code of conduct and waiver, and scan your tag to link it.
2. **Hide** (default 5 min): runners scatter, and chasers stay at the start (marshals are alerted if one leaves early).
3. **Chase** (default 45 min in total):
   - **Pings** every 5 min (2, 3 or 5). **45 s before** each ping, every free runner's phone buzzes: open Kejar to **check in**. Only a location sent inside that 45 s window counts.
   - At the ping, chasers see each runner as a **fuzzy circle** (about 15 m) where they checked in. A runner who missed is shown dashed at their last spot.
   - **Two missed check-ins in a row sends a runner to Penjara automatically** (auto-jail). One miss is free. The count restarts after a runner is freed.
   - Runners keep their phone in their pocket between check-ins. Chasers and marshals keep Kejar open.
4. **Catching:** the chaser rips the tag off the upper arm with one hand (no grabbing or tackling), the runner stops, and the chaser scans the tag. The app checks the chaser was close enough. Disputes go through SOS to a marshal, never settled physically.
5. **Penjara:** caught runners walk to Penjara.
   - They watch a spectator map delayed by 2 minutes, and get **one pull of the dare reel** per stay: a silly dare, or rarely "You're free".
   - **A free runner who scans the Penjara QR** (within 30 m) frees everyone inside.
   - **Each runner can only be freed once per game,** however it happens, so games end.
6. **Power-ups:** printed **stations** around the park. Scanning one within 30 m during the chase draws the **top card of your side's shared deck**, revealed with the lucky dip.
   - You hold **one power-up at a time**, and the slot stays busy while its effect runs.
   - Each station can be claimed once per player, and locks for everyone for 60 s after a claim.
7. **End:** time runs out (Dikejar win if anyone is still free) or every runner is in Penjara (Kejar win). There's a `5 minutes left` warning before the end. Then come the results: awards, a rating, and a post-game report.

**Safety (both modes).** One **SOS** bar (hold for 1 s) on every player screen. Marshals get a full-screen takeover with an arrow and distance, plus `I'm going` so only one runs, and they close it with an outcome. Automatic alerts cover leaving the play area, auto-jail, a chaser leaving the start early and flagged catches. Marshals can pause and resume the game and remove a player. Reports happen after the game.

## 3. What each mode includes

| | **Core** | **Full** |
|---|---|---|
| Chase, check-ins, auto-jail, Penjara, jailbreak, dare reel | ✓ | ✓ |
| Safety tools, motion, the marker scribble, results | ✓ | ✓ |
| **Runners' deck** | **Durian, Ponteng** | Gostan, Durian, Ponteng, Toyol, Abang Grab |
| **Chasers' deck** | **Mat Rempit, Pak Guard** | Mat Rempit, Pak Guard, Ah Long, Abang Grab |
| Dato Seri (runner legendary) | – | ✓ hidden stash, or the quest-giver if there are volunteers |
| "Dikejar can see Kejar at check-in" switch | – (always off) | ✓ organiser's choice, default off |
| Chaser legendary | – | Later, when designed (§11) |

**Core's deck counts** (**Claude's call**, tune after playtests):
- runners, per 10 runners: Durian ×3, Ponteng ×3 (6 cards);
- chasers, per 5 chasers: Mat Rempit ×2, Pak Guard ×2 (4 cards).

**Why these four:** each is one tap with an obvious effect ("block a catch", "skip a ping", "extra ping", "see nearby runners exactly"). There are no targets, no choices and no stealing.

**Full's deck counts** are in the power-ups design §5b. Everything else about each power-up (effects, messages, one slot, the Mat Rempit cooldown) is the same in both modes.

## 4. Numbers in one place

| Thing | Value | Owner |
|---|---|---|
| Game length | 45 min default (15–90) | base design §4.3 |
| Hide time | 5 min default (1–15) | base §4.3 |
| Ping interval | 5 min default (2, 3 or 5) | base §4.3 |
| Check-in window | the 45 s before each scheduled ping (Mat Rempit's extra ping: 30 s) | check-ins design §4.2 |
| Auto-jail | 2 missed scheduled check-ins in a row, counted since last freed | check-ins §4 |
| Runner circle | about 15 m | base §4.5 |
| Chaser circle at check-in (Full, switch on) | about 30 m, frozen at the alert | check-ins §5 |
| Pak Guard | runners within 75 m show exactly at the next ping | power-ups §6.1 |
| Durian | blocks the next catch, up to 10 min, no head start | power-ups §6.1 |
| Gostan | next ping shows you 120–180 m away | power-ups §6.1 |
| Mat Rempit | extra ping in 30 s, one at a time, 3 min team cooldown | power-ups §5a |
| Station claim | within 30 m, once per player per station, station locks 60 s | base §4.8.1 |
| Penjara rescue | free runner scans the Penjara QR within 30 m | base §4.7 |
| Freed | once per runner per game, by any route | base §4.7 |
| Dato Seri hint | fuzzy zone 100–200 m | jail design §4 |
| Spectator delay in Penjara | 2 min | base §4.3 |
| SOS | hold 1 s; details card closes after 20 s | motion design §6 |

## 5. People and kit per event

- **Crew of two** (motion design §6.6): the organiser is the roaming marshal, and one helper is the marshal at Penjara (playing Pak Pulis).
  - **Up to about 20 players.** Add one marshal per extra 10 players or so (**Claude's call**, reconciling the base design's "1 marshal per 8–10 players" with the two-person crew).
  - Full mode's quest-giver version of Dato Seri needs two more people: a quest-giver and a dedicated Pak Pulis.
- **Printed kit:**
  - **Both modes:** runner tags (armbands), chaser and marshal vests, station QR cards, the Penjara QR card.
  - **Full adds** the Dato Seri stash card (or the coin, in quest-giver mode).
- The organiser setup screen should turn this into an **event-day checklist** (next design).

## 6. Words

- **Plain English for everything players read** (owner's decision, 2026-10-30), including the feed and power-up messages.
- **Local names stay:** Kejar, Dikejar, Penjara, Pak Pulis and the power-up names. Each card also has a plain-English effect line.
- The Malay message lines in the power-ups design §6 are kept as tone references, not as on-screen text (power-ups §7).

## 7. Look and feel in one place

- **Brand:** Volt `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3`; Geist and Geist Mono. There's no red, even for warnings.
- **Exceptions, each with a single job:**
  - **Doodle stickers in their own colours,** only for power-up art (cards, the slot, the feed, award rows). Power-ups §5c, mockup `13-card-art.html`.
  - **Legendary yellow,** only for Dato Seri. Jail design §4a.
- **Motion:** short moments that come and go (the catch stamp, lucky dip, ripple ping, phase wipes, victory lap). Motion design §4–§8.
- **The lime marker scribble** is the hype and wayfinding layer, never on safety screens, with one moment per screen. Motion §8.5.
- **One loud thing at a time** (**Claude's call**, from the clutter review): a screen never plays two big effects at once (for example a sticker pop during a scribble). Queue them.
- **Watch the runner's chase screen.** It carries the map, the check-in banner, the clock, the slot, the feed and the SOS bar. Before building, mock it with the feed shrunk to a **one-line ticker** that opens when tapped, so the map stays the hero (§10).

## 8. Which doc owns what

| Topic | Owner doc |
|---|---|
| The game as a whole, the modes, the Core deck, numbers | **this doc** |
| Roles, joining, catching, the original jail and power-up rules, safety basics, data and privacy, kit, brand | `2026-10-19-kejar-design.md` (where not replaced below) |
| Check-in window, auto-jail, the chaser-snapshot switch, the Penjara rename | `2026-10-30-kejar-checkins-counterping-penjara-design.md` |
| Power-up names, effects, one slot, shared deck, Abang Grab, Toyol and Ah Long, card look | `2026-10-28-kejar-malaysian-powerups-design.md` |
| Dare reel, Dato Seri (both modes of it), Pak Pulis | `2026-10-28-kejar-jail-dato-seri-design.md` |
| Everything that moves, SOS, the marshal SOS screen, the crew of two, the feed, results, the scribble | `2026-10-30-kejar-motion-design.md` |
| Organiser accounts; real parks and saved arenas | `2026-10-26-kejar-plan4a-organiser-accounts-design.md`, `2026-10-27-kejar-plan4b-arenas-design.md` |
| Endgame ideas (not approved) | `2026-10-26-kejar-endgame-intensity-design.md` |
| Chaser legendary (unfinished) | `2026-10-30-kejar-chaser-legendary-design.md` |

## 9. Conflicts settled in this pass

| Older text | Now |
|---|---|
| Base §4.5: check-in alert 30 s before the ping; marshals alerted after 2 missed check-ins | 45 s window; 2 misses means **auto-jail** (with a marshal alert instead) |
| Base §4.8: Decoy, Shield (with a 10 s head start), Cloak, Flare, Focus 150 m | Gostan, Durian (no head start), Ponteng, Mat Rempit, Pak Guard 75 m |
| Base §4.8.1: hand of 3; a random power-up per claim | **One slot**; draw the top card of the shared deck |
| Base §3: 1 marshal per 8–10 players | Crew of two up to about 20 players, then about 1 more per 10 (§5) |
| Power-ups §6: Malay messages on screen | Plain English on screen; Malay lines kept as tone (§6) |
| Power-ups §5c (first version): blue rare and purple epic tiers | No tiers: lime brand cards; yellow only for Dato Seri |
| Jail design: "dare wheel" | It's a **dare reel** with a Penjara lever (jail §3a); the rules are unchanged |
| Jail design §4: Dato Seri needs a quest-giver, a coin and Pak Pulis | Hidden stash by default; quest-giver is an option (jail §4b). Full mode only |
| Chaser legendary notes: "fills all 3 hand slots"; a staff of 5 | One slot; it must fit the crew of two, so a hidden-stash style grant unless volunteers exist (open, §11) |
| Endgame notes: "Last call" and other ideas | Only `5 minutes left` (a warning, the feed line and the lime clock) is agreed. The rest stays unapproved (§11) |
| HANDOFF: "stations stay random-on-claim", "Abang Grab claims a station remotely", "slang applies to power-ups only" | Shared deck; Abang Grab picks 1 of the top 3 (sealed); English messages, local names (§6) |
| Dato Seri stash: what if the finder's slot is full? | **Not said before. Claude's call:** the scan is refused with `Use or lose your power-up first`, and the stash stays claimable |

## 10. Still to design before building

1. **Organiser setup,** including the mode switch, the event-day checklist (§5) and the Dato Seri stash drop.
2. **The runner's chase screen audit,** with the feed as a one-line ticker (§7).
3. **The lobby's how-to-play card,** one per mode: what you are, how to check in, how you get caught, and the power-ups in this mode's deck.
4. **The auto-jailed runner** variant of the Penjara screen (`You missed 2 check-ins`).

## 11. Still open (owner's decisions)

- **Chaser legendary:** the character (Bomoh, Pontianak, Hantu Rimba or Cikgu Jejak), and how it's granted with a crew of two. It's Full mode only.
- **Endgame intensity:** faster pings near the end, a shrinking play area, "Last call", and the other ideas in the endgame notes. Not approved.
- **Core and Full deck counts and the chaser snapshot's 30 m:** first things to tune after playtests.

## 12. Build order (unchanged in spirit, updated for modes)

1. Check-ins: the 45 s window, auto-jail, Penjara naming (check-ins design §8a).
2. One slot, the shared deck and the Mat Rempit rule, with **Core's four power-ups** and the **Game mode switch** (Full's extra cards can follow).
3. Motion §4–§8 and the marker scribble, the SOS bar and marshal takeover, the feed and results.
4. Full mode: Gostan, Toyol, Ah Long, Abang Grab, the snapshot switch, then Dato Seri (stash first).
5. Then playtest Core with friends, then Core and Full at a run club. Note catches per game, jailbreaks, on-time check-ins and power-up use per mode.
