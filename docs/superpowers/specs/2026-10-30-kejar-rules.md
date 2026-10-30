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

**Kit** (§5a). Runners wear their own clothes plus a **dark velcro arm strap** carrying a rip-off tag (a QR code and a number, e.g. #07). Chasers wear a **hi-vis yellow vest** and no armband. Marshals wear an **orange vest** and a MARSHAL lanyard card.

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
   - **The rescue:** a free runner scans the Penjara QR, then **stays within 30 m for 10 seconds** (owner's decision, 2026-10-30). Chasers are warned the moment it starts. If the rescuer is caught or leaves the 30 m in that time, nobody gets out (§9a).
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
| Penjara rescue | scan the Penjara QR, then stay within 30 m for 10 s; frees everyone inside | this doc §9a |
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
- The organiser setup screen turns this into an **event-day checklist** (organiser setup design §3).

## 5a. The physical kit (owner's decision, 2026-10-30)

Designed to be cheap, reusable and bought in one trip, mostly from MR.DIY.

**The runner tag.** It has to rip off with one tug, stay on while running, stay flat and scannable after being grabbed, be reused every event, and go back on in seconds. It's built in layers:
1. **A printed card** with the tag's QR code (`KEJAR:TAG:<n>`) and its number, sized for an ID holder (about 54 × 85 mm, QR at least 35 mm).
2. **A clear rigid ID card holder** around the card, to keep it flat and dry (MR.DIY transparent ID card holder, 6 pcs).
3. **A patch of sticky hook velcro, about 2 × 3 cm,** on the back of the holder. **Its size is the rip-force dial:** test once, then fix it for every tag.
4. **A black hook-and-loop arm strap,** about 3–5 cm wide, with the soft loop side facing out, so the tag sticks anywhere on it. It's adjustable for any arm, and dark so runners can hide.

The chaser rips the **whole holder** off and scans it. At Penjara the marshal presses it back onto the runner's strap. Nothing is sewn and nothing is single-use; only the paper card is ever reprinted.

**Who wears what:**

| Who | Wears |
|---|---|
| Dikejar | Own clothes plus the dark arm strap and tag on the upper arm |
| Kejar | A **hi-vis yellow vest** (MR.DIY safety vest; fluorescent yellow sits close to Volt lime). No armband. |
| Marshals | An **orange vest** (MR.DIY reflective vest) plus a lanyard with a `MARSHAL` card in an ID holder. **Changed from the base design's black or white vests:** orange can't be confused with the chasers' yellow, and reads as "safety" to the public. |

**Cards around the park.** Station cards, the Penjara card and the Full-mode Dato Seri stash card use the **same clear ID holders**, fixed with **painter's tape** so nothing marks park property. Bring a zip bag for the stash card in case of rain.

**Shopping list for about 20 players** (15 runners, 5 chasers, 2 marshals), approximate:

| Item | Qty | Where | Approx. |
|---|---|---|---|
| Transparent ID card holders (6 pcs) | 4 packs | MR.DIY, RM2.10 a pack | RM8.40 |
| Black velcro arm straps | 15 | MR.DIY if stocked, else Shopee | RM15–30 |
| Sticky hook velcro (dots or strip) | 1 roll | MR.DIY if stocked, else Shopee | RM5–10 |
| Safety vests (yellow) | 5 | MR.DIY, RM4.40–9.30 | RM22–47 |
| Orange reflective vests | 2 | MR.DIY, RM5.90 | RM12 |
| Neck lanyards | 2 | MR.DIY, RM0.90–1.60 | RM3 |
| Painter's tape | 1 | MR.DIY | about RM5 |
| Printing | — | — | about RM3 |
| **Total** | | | **about RM70–110, reusable** |

Prices are from MR.DIY's online listings on 2026-10-30 and may change. Velcro straps and sticky velcro weren't found in MR.DIY's online catalogue, so check in store first. Some vests showed as sold out online.

**Before the first event:**
- Test the velcro patch size on two or three tags: it should survive a sprint and come off with one firm tug.
- Test-scan a ripped tag through the holder in bright sun, since glare can slow scanning.

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
- **The chase screen** is one screen with no scrolling: a top bar, the map as the hero, and a dock with the slot, one Scan button, a one-line ticker and SOS (motion §8.6). A lock-screen notification shows the next check-in and the end as clock times (motion §8.7).

## 8. Which doc owns what

| Topic | Owner doc |
|---|---|
| The game as a whole, the modes, the Core deck, numbers | **this doc** |
| Roles, joining, catching, the original jail and power-up rules, safety basics, data and privacy, kit, brand | `2026-10-19-kejar-design.md` (where not replaced below) |
| Check-in window, auto-jail, the chaser-snapshot switch, the Penjara rename | `2026-10-30-kejar-checkins-counterping-penjara-design.md` |
| Power-up names, effects, one slot, shared deck, Abang Grab, Toyol and Ah Long, card look | `2026-10-28-kejar-malaysian-powerups-design.md` |
| Dare reel, Dato Seri (both modes of it), Pak Pulis | `2026-10-28-kejar-jail-dato-seri-design.md` |
| Everything that moves, SOS, the marshal SOS screen, the crew of two, the feed, results, the scribble | `2026-10-30-kejar-motion-design.md` |
| Creating a game (five steps), the kit checklist, walking the park, lobby checks | `2026-10-30-kejar-organiser-setup-design.md` |
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
| Base §4.7: one scan at Penjara frees everyone at once | A **10-second hold** after the scan (§9a) |
| Jail §4b and motion §8.2: everyone sees a yellow Dato Seri zone; the feed says `Dato Seri has been found` | **Dato Seri is a secret** (§9b): an unlabelled `?` zone, and the feed says `Something legendary was found.` |
| Check-ins design §4.5: auto-jail is final like a catch | A marshal can **undo** an auto-jail for a phone fault, without using the runner's one escape (motion §5b) |
| Base §3: marshals in black or white vests | **Orange vests** plus a MARSHAL lanyard card (§5a) |
| Dato Seri stash: what if the finder's slot is full? | **Not said before. Claude's call:** the scan is refused with `Use or lose your power-up first`, and the stash stays claimable |

## 9a. The 10-second rescue (owner's decision, 2026-10-30)

Freeing everyone with one quick scan was judged too swingy: one runner could undo 20 minutes of chaser work in 5 seconds. Instead of capping how many get out, the owner chose to keep "frees everyone" and make the rescue a risk.

- **Start:** a free runner scans the Penjara QR within 30 m (as today). The rescue doesn't happen yet.
- **Hold:** the rescuer keeps Kejar open and **stays within 30 m of Penjara for 10 seconds.** Their screen shows a lime ring filling and `Stay close · 7 s`. The phone sends its location every 1–2 s during the hold (**Claude's call**).
- **Everyone hears about it at once:**
  - **chasers:** a lime-box ticker line and a buzz, `Rescue starting at Penjara!` → `Catch them in 10 s and nobody gets out.`;
  - **jailed runners:** `Hafiz is breaking you out · 7 s`;
  - **the Penjara marshal:** the same line.
- **Success:** after 10 s, everyone inside who hasn't already been freed once is freed, as today.
- **Fail:** if the rescuer is **caught** (their tag is scanned) or a location puts them **more than 30 m away** (plus GPS error, as with station claims), the rescue fails. Nobody gets out, and the rescuer can try again if they're still free.
- **Only one rescue at a time.** A second runner's scan during a hold just joins it, and the hold continues.
- **GPS leniency** (**Claude's call**): one missing or poor-accuracy fix during the hold doesn't fail it. Only a clear "outside 30 m" does.
- **Why:** chasers get a real chance to stop a rescue without camping on Penjara all game, and a successful rescue is earned. It's the best "hero moment" in the game.
- **Dato Seri's Settle and the dare reel's free card are unchanged.** They free in the moment, because their cost is already the rare card.

## 9b. Dato Seri is a secret (owner's decision, 2026-10-30)

- **Players are never told about Dato Seri.** It's not in the how-to-play story, the lobby, the rules on the card, or the feed's wording.
- **Stash mode keeps a mystery zone:** an unlabelled yellow `?` on every player's map, with no explanation. Players who go and look find the card and discover Dato Seri themselves.
- **When it's claimed,** the zone disappears and the feed says `Something legendary was found.` (it never names the card).
- **Settle is still visible** when it happens at Penjara. That's the moment everyone learns about it, which is part of the fun.
- **Organisers do see it,** in the mode step, settings and kit list (organiser setup design).

## 10. Still to design before building

1. ~~**Organiser setup**~~ **designed 2026-10-30:** `2026-10-30-kejar-organiser-setup-design.md` covers five setup steps, the kit checklist, walking the park, the stash drop and lobby checks.
2. ~~**The chase screen audit**~~ **designed 2026-10-30:** motion design §8.6 (one screen, map as the hero, a dock with the slot, one Scan button, a ticker and SOS) and §8.7 (the lock-screen status notification with clock times).
3. ~~**The how-to-play card**~~ **designed 2026-10-30:** motion design §8.8, a briefing story per side and mode with self-drawing doodle scenes.
4. ~~**The auto-jailed runner**~~ **designed 2026-10-30:** motion design §5a–§5b, with a `2× MISSED` moment, the missed check-ins crossed out, and a **marshal undo for phone faults** (auto-jail only, doesn't use the once-only escape).

**All screens are now designed. Next: build plans (§12).**

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
