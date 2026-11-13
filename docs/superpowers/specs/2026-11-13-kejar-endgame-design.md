# Kejar: the endgame (Bomba, Hang Hebat, PKP; Banjir Kilat later)

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole. This design adds to it; when built, the rules doc gets a new endgame section and its §9/§11 rows for "Endgame notes" are replaced by a pointer here.

**Status:** Draft for the owner's approval (builder check done). Nothing is built yet.
**Date:** 2026-11-13
**Replaces:** the unapproved brainstorm in `2026-10-26-kejar-endgame-intensity-design.md` (ideas 1, 3 and 5 live on here as Bomba and PKP; idea 2 becomes Banjir Kilat).
**Mockup:** `docs/superpowers/mockups/2026-11-13-endgame/` (logos, reveals, chip, wanted poster), also live at https://claude.ai/artifact/372stkU1RqhizcuCD9NdeU.

## 1. Why

A Kejar game goes flat in its last stretch. The chase works the same in minute 40 as in minute 5, and the only change near the end is the `5 minutes left!` warning. The owner wants the last minutes to feel like a finale, and to be a **surprise**: nobody knows which twist is coming until it lands, so every game ends differently.

## 2. Goals

- Each game rolls **one endgame** at random, kept secret until it's revealed.
- The reveal is a moment: a full-screen takeover on every phone, in the endgame's own colour, with its doodle logo, then a small chip that stays on the chase screen.
- Each endgame raises the pressure in a different way: Bomba shows more, Hang Hebat puts everything on one runner, PKP shuts the way out of Penjara.
- The organiser can switch any endgame off.

## 3. Non-goals

- **Banjir Kilat** (the flood) is designed in name, logo and colour only. Its rules and build come in a second plan (§9), because a shrinking play area has to be worked out against Luar Garisan and the outside alerts.
- No new power-ups, no new printed kit.
- No endgame vote, pick or preview by players or the organiser beyond switching endgames off.

## 4. Anti-goals (a failure even if it technically works)

- **The surprise leaks.** If a phone, the feed, the ping schedule or the API lets anyone tell which endgame is coming before the reveal, the feature has failed.
- **A runner is jailed by the twist, not by play.** Faster pings must not auto-jail someone who never had a fair warning.
- **An unwinnable finale.** Every endgame has to leave both sides a real way to win.
- **The phone takes over the game.** Runners keep phones pocketed between check-ins, as now (Bomba's last 5 minutes are the one exception, and they're short).

## 5. Approaches (owner picked A)

- **A. Shared parts, then Bomba, Hang Hebat and PKP; Banjir Kilat in a second plan (picked).** The roll, reveal, chip, organiser switches and the three endgames that mostly change rules the game already has ship first. Three endgames reach real games sooner, and the boundary problem doesn't hold them back.
- **B. All four in one release.** One plan and one launch, but everything waits on the shrinking boundary.
- **C. One endgame at a time.** Shared parts with Bomba only (Core always uses it), then the others one by one. Safest, but the random surprise doesn't exist until the second endgame lands.

## 6. Shared parts

### 6.1 Which endgames a game can get (owner's decisions)

- **Full mode:** one endgame picked at random from those switched on.
- **Core mode:** always **Bomba** (it's the only one that adds no new rule to learn).
- **Organiser switches:** new game setup gets an "Endgame" row with an on/off switch for each endgame. Defaults: all on. Core shows only Bomba's switch. Everything switched off means no endgame; the game ends as today.
- Until the second plan, Banjir Kilat is shown as "coming soon" and can't be switched on.

Stored as `settings.endgames: { bomba: 'on' | 'off'; hebat: 'on' | 'off'; pkp: 'on' | 'off'; banjir: 'off' }`. Older games have none: read as all off, so a game made before this ships never gets an endgame. *(Claude's call: switching the feature on for games already sitting in a lobby would surprise their organiser.)*

### 6.2 The roll and the secret

- The endgame is rolled **when the game starts** and stored on the game row (`games.endgame`), the same way the deck seed is: on the server only.
- **No client learns it before the reveal**: not the game view, not the feed, not the ping schedule (§7.3), not marshals, not the organiser. *(Claude's call: the organiser plays too, often as a marshal; "surprise for everyone" is simplest to keep honest.)*
- From the reveal on, everyone's view carries the endgame's kind and any public detail (Hang Hebat's wanted runner).

### 6.3 When it's revealed (owner accepted)

| Endgame | Revealed at |
|---|---|
| Bomba | 10 minutes left |
| Hang Hebat | 10 minutes left |
| PKP | 5 minutes left |
| Banjir Kilat (later) | 10 minutes left |

- "Minutes left" is the chase clock, with pauses counted as today (`toWall`): a pause holds the reveal back.
- The reveal is judged lazily on any poll, like the `5 minutes left!` warning, and claimed once (a `claimEndgameReveal` store call, the same pattern as `claimFiveWarning`).
- **Never while paused, and never while a final whistle is pending.** If the final whistle is called off, the reveal goes out on the next poll if it's due.
- A game whose chase starts with less than 10 minutes left reveals straight away (the same rule as `fiveLeftDue`).
- PKP's reveal falls on the `5 minutes left!` warning: they go out as **one** push ("5 minutes left · PKP!") and the PKP takeover replaces the plain warning. *(Claude's call: two pushes in the same second read as a glitch.)*
- PKP revealing at 5 minutes means that a game with no reveal at 10 minutes left is one where PKP is coming. **The owner accepted this**; five minutes of "what's coming?" is part of the fun. With Banjir Kilat built it'll still be a tell. *(Note for later: a teaser at 10 minutes, "Endgame in 5…", would hide it if it ever matters.)*

### 6.4 What everyone sees

- **The takeover:** full screen, the endgame's colour, its logo (sticker doodle style), `10 MINUTES LEFT · ENDGAME` (or `5`), the title in lower case with marker doodles (`bomba!`, `hang hebat!`, `pkp!`), a black card with the rule and one line of detail, and a **Got it** button. It shows on runners', chasers' and marshals' phones, over whatever screen is open, the same way the SOS and Mak Kau Hijau takeovers do. A phone that opens Kejar later sees it once, the first time.
- **The push:** "kejar. · Endgame: Bomba!" (and the like) to every player with push on.
- **The feed line:** "Endgame: Bomba." etc.
- **The chip:** a small pill on the chase screen's status row in the endgame's colour with its logo and name, kept till the end. Tapping it reopens the rule card. For Hang Hebat, it opens the wanted poster (§8).
- **Results:** the results screen names the endgame in its colour; for Hang Hebat it says whether the bounty was caught.
- **Spectators** get the reveal after their usual delay. *(Claude's call: same rule as everything else they see.)*

| Endgame | Colour | Ink | Logo |
|---|---|---|---|
| Bomba | red `#E63946` | black | fire helmet with a siren |
| Hang Hebat | poster cream `#F1E3C3` | brown `#3A2410` | wanted poster with a keris |
| PKP | hot pink `#FF5FA2` (owner's pick) | black | padlocked roadblock |
| Banjir Kilat (later) | blue `#3D8BFD` | black | wave with lightning |

None of these clashes with the legendaries' yellow, orange, purple or green.

### 6.5 How to play

The how-to-play story gets one card: "**Endgame.** Near the end, something changes. You'll find out when it happens." It never names the four. *(Claude's call: naming them spoils nothing, but the mystery is the point.)*

## 7. Bomba (faster pings, then a last call)

**Rule card:** "Pings every 2 minutes now, then every minute from 5 minutes left." **Line:** "At 1 minute left: every Dikejar shows exactly. No fuzz, no Ponteng."

### 7.1 The ping schedule

From the reveal, the normal schedule stops and Bomba's takes over. Reveals land at these minutes left:

**8, 6, 5, 4, 3, 2**, then the **last call at 1**.

- Every one of these is a **scheduled ping**: the 45 s check-in alert, the push, check-ins and the missed-ping count all work as today.
- A normal-schedule ping due after the 10-minute mark is dropped. *(Claude's call: one schedule at a time keeps the counts simple.)*
- If the organiser's interval already gives a ping at or near one of Bomba's times, Bomba's schedule still wins: the times above are fixed.

### 7.2 Auto-jail under Bomba (fairness)

Bomba's pings count toward auto-jail, as any scheduled ping does (two missed in a row). *(Claude's call: if they didn't, a runner could simply ignore the last 10 minutes.)* The protections already in place cover the risk of being jailed by the twist:

- the 25 s fair-warning rule (`fairlyWarned`) skips any ping whose alert went out late;
- the count restarts at each runner's own release.

A runner who missed the last normal ping before the reveal and then misses Bomba's first is jailed, as they would be today.

### 7.3 Keeping the schedule secret

Today the client can work out ping times from the settings (`pingTimes`). With Bomba, the schedule after the 10-minute mark depends on the endgame, so:

- before the reveal, every client sees the **normal** schedule, whatever the endgame is;
- the server works from the real schedule (which needs the stored endgame);
- the first Bomba alert (8 minutes left, alert at 8:45) comes after the reveal at 10:00, so no alert leaks Bomba early.

### 7.4 The last call (1 minute left)

- Every free runner shows on the Kejar's map at their **exact** latest location: **no fuzz** (0 m instead of `FUZZ_RADIUS_M`), and **Ponteng (cloak) doesn't hide them**.
- A runner who doesn't check in shows at their latest fix as usual (dashed, as a miss). It still counts as a miss for auto-jail.
- A runner under **house arrest** (Super Ring) stays hidden, as at every ping. *(Claude's call: house arrest is already a "you're out of the hunt" state; showing them would add a rule.)*
- The feed line reads "Last call!" instead of the normal ping line.

## 8. Hang Hebat (the wanted runner)

**Rule card:** "#07 Aina survived the longest, so she's now wanted." **Line:** "Kejar catch her: Kejar win. She reaches the whistle: Dikejar win."

### 8.1 Who becomes wanted

At the reveal, the **free runner whose current free stretch is longest**:

- free means not in Penjara, not out, not disqualified, not removed, and not under house arrest;
- a runner never caught has been free since the chase started; a runner freed from Penjara or house arrest, since their last release.
- **Tie:** the lowest armband number. *(Claude's call: predictable and easy to explain.)*

If there's no free runner at the reveal, the game is already ending; nothing happens.

### 8.2 How the game is won

From the reveal, **only the wanted runner decides the game**:

- **The Kejar win** the moment the wanted runner is **out**, by any route: a catch, auto-jail, Mak Kau Hijau, Luar Garisan disqualification. The usual **60 s final whistle** holds the end so a wrong catch can be undone.
- **The Dikejar win** if the wanted runner is still free when time runs out, even if every other runner is in Penjara. With the wanted runner free, "nobody left free" can't happen, so the normal all-caught end can't fire.
- Other runners keep playing as normal: they can still be caught, freed, use cards and claim stations, which can help the wanted runner (decoys, rescues, Cheese Ais).

Edge cases *(Claude's calls)*:
- **Durian (shield) blocks a catch** on the wanted runner as on anyone: still free, still wanted.
- **Super Ring:** a catch that lands on a runner under house arrest already doesn't count (`ring-locked`). If the wanted runner is *put* under house arrest by the ring, that counts as out: **Kejar win**. The wanted runner is the target; the ring protects a runner from Penjara, not from losing the bounty.
- **The wanted runner is removed by a marshal** (left the game, safety): the bounty passes to the next free runner by the same rule, with a feed line and a push. If nobody's left, the game ends as today.
- **Caught is caught (owner's decision).** Once the wanted runner is out, the Kejar have won; the 60 s hold is only there for a marshal to undo a wrong catch. A rescue, a reel win, a Dato Seri Settle or the end of a house arrest during the hold does **not** call off the whistle or bring the bounty back. This is new: today the whistle only blows when nobody is free, so `settleWhistle` / `callOffWhistle` need a Hang Hebat path that calls off only on an undo.
- **During the hold** the other runners and the Kejar keep playing as normal (catches, rescues, stations); none of it changes the result. *(Claude's call.)*
- **An undone catch** (a marshal's undo during the hold) puts them back as wanted and the game carries on.
- **At the reveal, nobody is free but someone is under house arrest:** no wanted runner is picked; the game ends as it would today. *(Claude's call.)*
- **Choosing the wanted runner after an undo:** an undone catch never happened, so the free stretch runs from before it. *(Claude's call.)*

### 8.3 What players see

- **The wanted poster** (from the chip): their armband number and name, "DIKEHENDAKI · HANG HEBAT", and the keris logo. Everyone can open it.
- **On the Kejar's map,** the wanted runner's ping circle has a cream ring and a small poster pin, so the Kejar know which circle is the bounty. *(Claude's call: without it, the Kejar would have to recognise armbands from ping dots, which they can't.)* Everything else about how often and how exactly they show is unchanged.
- **The wanted runner** sees the takeover with "You're wanted." in place of the rule line, and the chip says "You".

## 9. PKP (Penjara closes, stations ×2)

**Rule card:** "Penjara is closed for good. No more jailbreaks." **Line:** "Every station now gives two goes of its card. Use them or lose them."

### 9.1 Penjara closes

From the reveal (5 minutes left) to the end:

- **No rescue:** scanning Penjara as a free runner does nothing (the screen says "Penjara is closed (PKP)"). A rescue already in its 10-second hold at the reveal **fails** with the usual `rescue-failed` line.
- **No reel:** the reel is greyed out for jailed runners.
- **Dato Seri's Settle frees nobody** (it would free the holder plus up to 2 jailed Dikejar). *(Owner's decision: "closed for good" means every way out. The cost, accepted: an unused Dato Seri is dead for the last 5 minutes.)* Settle shows "Penjara is closed (PKP)".
- **Mak Kau Hijau's Penjara lock** simply overlaps, no change.
- **House arrest** still ends as normal when it ends (it isn't Penjara).
- **A marshal's undo** of a wrong catch still frees the runner, as it does through Mak Kau Hijau's lock: fixing a mistake isn't a jailbreak. *(Claude's call.)*

### 9.2 Stations give ×2

- Every station claim after the reveal arrives **doubled**: the same twin mechanism as Nasi Lemak KFC (`twin_of`, two uses of the one card).
- Cards Nasi Lemak KFC can't double (`COMBO_EXCLUDED`) arrive as normal.
- A player who is already combo-ready doesn't get four goes: PKP doubles once and the combo stays ready for later. *(Claude's call: stacking would hand out huge swings in the last five minutes.)*
- Station lock times (`STATION_LOCK_MS`) are unchanged.

## 10. Banjir Kilat (second plan, not designed here)

Name, logo, colour and the rough idea only: the play area floods inward every few minutes until a small dry patch is left; anyone caught in the water gets 60 s to get back inside. The second plan has to settle, at least:

- how the dry patch is chosen and shrinks (centre, steps, timing);
- how it interacts with **Luar Garisan** (two reports outside = disqualified) and the marshals' **outside alerts**, so a runner standing still isn't suddenly "outside" and disqualified;
- stations, Penjara and stashes that end up under water.

## 11. Constraints

- Works with the existing lazy, poll-driven server (no ticks): the reveal, the Bomba schedule and the Hang Hebat check all run inside `advance`.
- Pauses hold everything (the reveal, Bomba's times), as for all timers today.
- Both the memory store and the Supabase store, with one migration (`0021`): `games.endgame` (kind, revealed at, wanted runner) and the settings default.
- Older games keep working (no endgame).
- The surprise must hold at the API level, not just in the UI (§6.2, §7.3).

## 12. Left to the builder

- The exact shape of `games.endgame` and the claim call.
- How the client gets the post-reveal ping schedule (server-sent times or the kind in the view).
- Where the Endgame row sits in new game setup.
- Takeover animation (reuse the Stamp slam or the Mak Kau Hijau takeover's motion).
- Copy for the feed lines and pushes, in the app's voice, within the wording above.
