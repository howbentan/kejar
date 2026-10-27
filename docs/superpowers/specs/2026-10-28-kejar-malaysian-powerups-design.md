# Kejar: Malaysian power-ups

**Status:** Design agreed with the owner in chat on 2026-10-28, checked by a reviewer, and narrowed to power-ups only the same day; open questions in §9. Not built yet.
**Builds on:**
- `2026-10-19-kejar-design.md` §4.8 and §4.8.1: the power-up station rules this keeps.
- `docs/superpowers/plans/2026-10-24-kejar-plan-5-power-ups.md`: how power-ups are built today.

## 1. Why

Kejar's power-ups have generic game names: Decoy, Shield, Cloak, Flare, Focus. The owner wants the game to feel unmistakably Malaysian and funny, like a local horror-comedy (*Hantu Kak Limah*) crossed with everyday Malaysian life. That means characters everyone recognises and the slang people actually use, so a briefing at KLCC Park gets laughs and the game is something Malaysians share.

The tone is **funny, not scary** (owner's decision).

**Scope (owner's decision):** the Malaysian characters and slang apply to **the power-ups only**. Every other piece of wording in the app stays exactly as it is today.

## 2. Goals

1. **Rename the five existing power-ups** to Malaysian characters and slang, keeping their rules.
2. **Add three new power-ups:** Toyol and Ah Long (a mirrored "take away" pair) and Abang Grab (claim a station from anywhere).

## 3. Non-goals

- **Malaysian lines anywhere outside the power-ups.** The chase start, catches, jail, jailbreaks, pings, claims, the hide phase, SOS and alerts, and the organiser and marshal screens keep their current wording (owner's decision). Lines floated in chat, like `Jom kejar!`, `KANTOI!`, `Lepak mamak dulu` and `Tapau`, are dropped.
- **Fixed power-ups per station.** Stations keep giving a random power-up when claimed.
  - The owner chose this "option A" after comparing the options. Random means no camping at "the good station", no setup and fresh games at saved parks.
  - "Option B" (each station always holds the same power-up) and "option C" (shuffled once per game, shown on the map) are possible later upgrades if playtests show players want route planning.
- **Honour-system dares the app can't enforce:** "AIS!" (freeze the nearest chaser 10 s, from the playground game *ais-air*) and "Jem teruk" (chasers held 30 s at the start). Rejected, not deferred (see §4).
- **TNB potong api** (every chaser's map goes blank for a ping): too strong for now.
- **Banjir kilat** (flash flood): kept as the name for the future endgame shrinking zone, not a power-up.
- **Hantu art on the printed station QR cards.** Station cards stay generic ("Station 3") because a station's power-up is only decided when it's claimed. The characters appear in the app: the hand, the feed and pop-ups.
- **Pocong, Pontianak, Orang Minyak, Orang Bunian, Mak Cik Bawang, Penanggal.** They were discussed but aren't in this set; the owner picked Mat Rempit, Ah Long, Toyol, Durian, Ponteng, Gostan and Abang Grab.

## 4. Anti-goals

- **Punching down or getting crude.** Jokes stay at "cheeky uncle" level: no race, religion, sexual content or mocking real people. Hantu are used in the playful way Malaysian comedies use them.
- **Breaking what works.** The station rules (§4.8.1 of the base spec) stay exactly as they are, and so do the existing power-ups' effects and numbers:
  - claims within 30 m of the station;
  - each station locked for 60 s after a claim;
  - each player claims each station once;
  - at most 3 unused power-ups in hand;
  - jailed runners and marshals can't claim.
- **Making stealing feel unfair.** A steal that finds nothing to take must not use up the stealer's power-up.
- **Power-ups that need a referee (owner's decision).** Every power-up's effect must be decided entirely by the app: no honour rules, no waiting periods players must count for themselves, no marshal judgement. Disputes in a physical chase get heated, and marshals should watch for safety, not settle arguments.
  - This is why Durian loses Shield's old "10 s head start". That replaces the base spec's §4.8 table row and §4.8.1 Shield rule. In the code, the chaser's `shielded` message in `ChaserChase.tsx` (and its test) changes accordingly.
  - Handing the tag back stays, because it happens after every scan anyway and needs no judgement.

## 5. How stations work (unchanged, restated for clarity)

- Stations are numbered QR cards placed around the park.
- Scanning one within 30 m during the chase gives a **random power-up for your side**, picked at that moment, with **equal odds** across your side's list (§6).
- Each player can claim each station once per game.
- A claim locks that station for everyone for 60 s.

## 6. The set

**Runners** draw from: Gostan, Durian, Ponteng, Toyol, Abang Grab.
**Chasers** draw from: Mat Rempit, Pak Guard, Ah Long, Abang Grab.

### 6.1 Renamed: same rules as today, new name and jokes

| New name | Was | Side | What it does | Messages |
|---|---|---|---|---|
| **Gostan** | Decoy | runner | Your next ping shows you 120–180 m from your real spot (inside the play area, not in a lake). | Kept secret. Only the user sees: `Gostan! Next ping tunjuk tempat lain.` |
| **Durian** | Shield | runner | Blocks the next catch; lasts up to 10 min. The catch simply doesn't count: the chaser hands the tag back and play carries on at once. **No 10 s head start** (owner's decision, see §4). | The chaser's catch screen says `Bau durian! Tak boleh dekat. Pulangkan tag.` The feed says `#07 kena durian!` |
| **Ponteng** | Cloak | runner | You're left off the next ping, and it looks like you never checked in. | Kept secret. The user sees `Ponteng ping!` |
| **Mat Rempit** | Flare | chaser | Every free runner gets "check in now"; an extra ping comes 30 s later. The regular schedule doesn't move. | The feed says `VROOOM! Mat Rempit buat round. Ping dalam 30 s!` |
| **Pak Guard** | Focus | chaser | At the next ping, runners within 150 m of you show exactly instead of fuzzy. | The feed says `Pak Guard tengah check CCTV…` |

### 6.2 New: Toyol (runner) and Ah Long (chaser), the "take away" pair

They mirror each other: the little thief for runners, the debt collector for chasers.

- **Toyol, on use:** pick a random chaser who holds at least one unused power-up, then a random one of theirs, and remove it from the game. The runner doesn't get it, because they couldn't use a chaser's power-up anyway.
- **Ah Long, on use:** the same, taking from a random **free** (not jailed) runner (**Claude's call**).
- **Only unused power-ups can be taken.** A Durian that is already switched on can't be taken.
- **If there's nothing to take,** the power-up is not used up. The player sees `Tak ada apa nak curi` (Toyol) or `Semua dah bayar hutang` (Ah Long).
- **Messages:**
  - The feed shows `Toyol curi barang!` or `Ah Long datang! Hutang kena bayar.`, without saying who did it or who lost what.
  - The player who lost one sees a personal message, e.g. `Toyol curi Mat Rempit kau!` (**Claude's call**), so a disappearing card isn't confusing.
- **Simultaneous uses:** two take-aways landing at the same moment must never take the same power-up twice, and must never use up the stealer's power-up without taking something. The same atomic-update care as Plan 5's claims and uses applies.

### 6.3 New: Abang Grab (either side)

On use, the player taps a station on the map (or picks it from a list). The app claims that station for them as if they'd scanned it there:
- The distance and "fresh location" checks are skipped.
- Everything else applies as normal: chase phase only; the 60 s lock; once per player per station; jailed runners can't use it.
- They get a random power-up for their side, exactly as a scan would.

Details:
- **Refused, not used up,** if that station is locked or already claimed by this player. They see the usual station message ("recharging — 0:42" or "already used this station") and can pick another.
- **The hand limit:** Abang Grab is used up when the grab succeeds, freeing its own slot, so a full hand (3) can still grab.
- **Message:** `Abang Grab hantar dari Station 3! Dapat: Durian` to the user. The feed shows the existing pickup line, unchanged.
- **The sneaky tactic:** a grab locks the station for everyone for 60 s, so it can block someone walking there. That's intended.

## 7. Power-up wording

- Each power-up's **name and its messages** are the ones in §6. Those are the only Malaysian lines this adds.
- **Every power-up card** shows a short plain-English line under its local name saying what it does, e.g. `Blocks the next catch, up to 10 min` (**Claude's call**), so players who don't speak Malay can still play.
- **All other wording stays as it is today,** including the feed's existing lines for pickups, pings and catches, and the existing "Kejar" (chasers) and "Dikejar" (runners) naming.

## 8. Constraints

- **Brand colours:** Volt `#C6FF3D`, black and white only.
- **Fonts:** Geist and Geist Mono.
- **Free tiers only;** keep the single `api/game.ts` function.
- **Database:** the database only accepts the five current power-up kinds (`0004_powerups.sql` checks the kind), so the new ones need a numbered migration, which the owner runs in Supabase by hand.
  - The existing kinds can keep their internal names (`decoy`, `shield`, …) with only their display names changing (**Claude's call**). That avoids migrating existing rows.
- **Secrecy rules from Plan 5 still hold:** runner power-up uses stay secret, apart from the Durian block and the anonymous take-away feed lines above.

## 9. Open questions for the owner

1. **Icons.** The chat used emoji (🍈 Durian, 🏍️ Mat Rempit, 👶 Toyol, 💸 Ah Long, 🛵 Abang Grab, 🔙 Gostan, 🎒 Ponteng, 📹 Pak Guard). Emoji are full-colour, which breaks the "Volt, black and white only" brand rule.
   - **Default if unanswered:** simple monochrome icons drawn in the brand colours, with the emoji used only as a guide to what each icon shows.
2. **Ah Long's targets.** Should Ah Long also be able to take from jailed runners' hands? The default above is free runners only.

## 10. Left to the builder

- Exact screen layout for picking a station for Abang Grab (map tap or list), as long as it works by tapping on a phone.
- How the "taken" state is stored (e.g. a `taken_at` / `taken_by` column), as long as it's atomic and taken power-ups no longer appear in anyone's hand.
- Copy for power-up refusal edge cases not listed above, in the same voice as §6.
