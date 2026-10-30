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
2. **Add three new power-ups:** Toyol and Ah Long (a mirrored "take away" pair) and Abang Grab (choose your next power-up from the top of the deck, from anywhere; §6.3, revised 2026-10-30).

## 3. Non-goals

- **Malaysian lines anywhere outside the power-ups.** The chase start, catches, jail, jailbreaks, pings, claims, the hide phase, SOS and alerts, and the organiser and marshal screens keep their current wording (owner's decision). Lines floated in chat, like `Jom kejar!`, `KANTOI!`, `Lepak mamak dulu` and `Tapau`, are dropped.
- **Fixed power-ups per station.** Stations don't hold particular power-ups. They draw from a **shared deck per side** (§5b, owner's decision, 2026-10-30), which replaced the original "random roll on every scan".
  - No station is "the good one", so there's no camping.
  - "Fixed per station" (option B) and "shuffled once per game, shown on the map" remain rejected.
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
  - ~~at most 3 unused power-ups in hand~~ **replaced by one power-up slot (§5a, owner's decision 2026-10-30);**
  - jailed runners and marshals can't claim.
  - **Exception, owner's decision 2026-10-28:** Pak Guard's reveal radius drops from Focus's original 150 m to 75 m, to keep it clearly weaker than the chaser legendary power-up being designed alongside it (Bomoh/Pontianak, not yet finalised — see `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md` and ongoing chat). Since Pak Guard is just Focus renamed, this changes `FOCUS_M` in `app/shared/views.ts` immediately, ahead of the rename itself shipping.
- **Making stealing feel unfair.** A steal that finds nothing to take must not use up the stealer's power-up.
- **Power-ups that need a referee (owner's decision).** Every power-up's effect must be decided entirely by the app: no honour rules, no waiting periods players must count for themselves, no marshal judgement. Disputes in a physical chase get heated, and marshals should watch for safety, not settle arguments.
  - This is why Durian loses Shield's old "10 s head start". That replaces the base spec's §4.8 table row and §4.8.1 Shield rule. In the code, the chaser's `shielded` message in `ChaserChase.tsx` (and its test) changes accordingly.
  - Handing the tag back stays, because it happens after every scan anyway and needs no judgement.

## 5. How stations work (unchanged, restated for clarity)

- Stations are numbered QR cards placed around the park.
- Scanning one within 30 m during the chase **draws the top card of your side's shared deck** (§5b).
- Each player can claim each station once per game.
- A claim locks that station for everyone for 60 s.

## 5a. One power-up at a time (owner's decision, 2026-10-30)

Replaces the old "hand of 3".

- **Each player holds at most one power-up.** You can't claim at a station (or with Abang Grab) while your slot is full; the station refuses as "hand full", with copy like `Use your power-up first`.
- **Your slot stays busy while your power-up's effect is still running,** not just until you tap Use. This stops "use it, grab another, use that too" stacking:

  | Power-up | Slot busy until |
  |---|---|
  | Durian | it blocks a catch, or its 10 minutes end |
  | Ponteng, Gostan, Pak Guard | the reveal their effect lands on (the next ping, scheduled or surprise) |
  | Mat Rempit | its surprise ping has been revealed |
  | Toyol, Ah Long, Abang Grab | done the moment they succeed |

- **Mat Rempit: one at a time, team-wide.**
  - No chaser can use Mat Rempit while another surprise ping is still pending.
  - After each surprise ping is revealed, the chasers' team waits **3 minutes** before the next one.
  - A refused use isn't spent; the player sees when it can be used again.
  - This replaces today's behaviour, where two can run back to back.
- **Why:** with three slots, players could stack Durians (becoming uncatchable), bank power-ups for the finish, and chain surprise pings. One slot keeps the real strategy (timing and bluffing about what you hold) and drops the stockpiling.
- **Knock-on effects:**
  - Toyol and Ah Long now take a player's *only* card, and will more often find nothing to take (not spent, as before).
  - The jail design's Dato Seri simply occupies the one slot.
- **Watch at the first playtest:**
  - how often each power-up is used, including any that are dumped just to make room;
  - how often Toyol and Ah Long find nothing to take.

## 5b. The shared deck (owner's decision, 2026-10-30)

Replaces "a random roll with equal odds on every scan".

- **At game start the app shuffles one deck per side:** a runners' deck and a chasers' deck. Every station claim **draws the top card** of the claimer's side.
- **The deck's mix sets the balance** (**Claude's call** for the starting counts; tune after playtests):

  | Deck | Per 10 runners (or 5 chasers), rounded up |
  |---|---|
  | Runners | Gostan ×2, Durian ×2, Ponteng ×2, Toyol ×1, Abang Grab ×1 (8 cards) |
  | Chasers | Mat Rempit ×2, Pak Guard ×2, Ah Long ×1, Abang Grab ×1 (6 cards) |

  For example, 14 runners get two sets (16 cards) and 3 chasers get one set.
- **When a deck runs out,** the cards already used, or taken by Toyol or Ah Long, are reshuffled into a new deck. Cards still held in players' slots stay out.
- **Players see how many cards are left** (e.g. `DECK · 7 LEFT`), never which ones.
- **Two claims at the same moment must never draw the same card.** That needs the same atomic care as station claims (Plan 5's `claim_station`).
- **Dato Seri isn't in either deck.** It has its own quest (jail design).
- **Why:**
  - It keeps the surprise and no-camping of random draws.
  - It stops silly streaks, like four Abang Grabs in one game.
  - It adds strategy through scarcity ("both Toyols are gone").
  - It gives one clear balance dial: the counts.

## 6. The set

**Runners'** deck holds: Gostan, Durian, Ponteng, Toyol, Abang Grab.
**Chasers'** deck holds: Mat Rempit, Pak Guard, Ah Long, Abang Grab. (Counts in §5b.)

### 6.1 Renamed: same rules as today, new name and jokes

| New name | Was | Side | What it does | Messages |
|---|---|---|---|---|
| **Gostan** | Decoy | runner | Your next ping shows you 120–180 m from your real spot (inside the play area, not in a lake). | Kept secret. Only the user sees: `Gostan! Next ping tunjuk tempat lain.` |
| **Durian** | Shield | runner | Blocks the next catch; lasts up to 10 min. The catch simply doesn't count: the chaser hands the tag back and play carries on at once. **No 10 s head start** (owner's decision, see §4). | The chaser's catch screen says `Bau durian! Tak boleh dekat. Pulangkan tag.` The feed says `#07 kena durian!` |
| **Ponteng** | Cloak | runner | You're left off the next ping, and it looks like you never checked in. | Kept secret. The user sees `Ponteng ping!` |
| **Mat Rempit** | Flare | chaser | Every free runner gets "check in now"; an extra ping comes 30 s later. The regular schedule doesn't move. | The feed says `VROOOM! Mat Rempit buat round. Ping dalam 30 s!` |
| **Pak Guard** | Focus | chaser | At the next ping, runners within 75 m of you show exactly instead of fuzzy. | The feed says `Pak Guard tengah check CCTV…` |

### 6.2 New: Toyol (runner) and Ah Long (chaser), the "take away" pair

They mirror each other: the little thief for runners, the debt collector for chasers.

- **Toyol, on use:** pick a random chaser who holds at least one unused power-up, then a random one of theirs, and remove it from the game. The runner doesn't get it, because they couldn't use a chaser's power-up anyway.
- **Ah Long, on use:** the same, taking from a random **free** (not jailed) runner (**Claude's call**).
- **Only unused power-ups can be taken.** A Durian that is already switched on can't be taken.
- **A card delivered by Abang Grab is sealed** (§6.3) and can't be taken either. A player whose only card is sealed counts as having "nothing to take".
- **If there's nothing to take,** the power-up is not used up. The player sees `Tak ada apa nak curi` (Toyol) or `Semua dah bayar hutang` (Ah Long).
- **Messages:**
  - The feed shows `Toyol curi barang!` or `Ah Long datang! Hutang kena bayar.`, without saying who did it or who lost what.
  - The player who lost one sees a personal message, e.g. `Toyol curi Mat Rempit kau!` (**Claude's call**), so a disappearing card isn't confusing.
- **Simultaneous uses:** two take-aways landing at the same moment must never take the same power-up twice, and must never use up the stealer's power-up without taking something. The same atomic-update care as Plan 5's claims and uses applies.

### 6.3 New: Abang Grab (either side), revised 2026-10-30 for the shared deck

With a shared deck every station draws from the same cards, so claiming a particular station remotely no longer means much. Abang Grab is now **"order off the menu"** (owner's decision):

1. **The player draws Abang Grab** like any card, at random from the top of their side's deck. It sits in their one slot.
2. **On use, from anywhere,** during the chase, by anyone not jailed, the app shows the **top 3 cards** of the player's side's deck: `What should Abang Grab bring?`
3. **The player keeps one.** It **replaces Abang Grab in their slot** and is held like any card; choosing it doesn't switch it on. The other two go to the **bottom** of the deck.
4. **The kept card is sealed:** **Toyol and Ah Long can't take it** while it's held (owner's decision). A delivered card arrives sealed.

Details:
- **If the deck has fewer than 3 cards,** show what's there. If it's empty, reshuffle first (§5b). If there's still nothing, refuse without using Abang Grab up.
- **No buffed versions:** the delivered card works exactly like a drawn one (owner's decision, after rejecting a buff as too strong). Abang Grab's reward is the choice, the peek at the deck, no walk to a station, and the seal.
- **Message:** `Abang Grab hantar Durian!` to the user, and `The other two went to the bottom of the deck.` The feed shows the existing pickup line, without naming the card.
- **The old "pick a station on the map, which locks it for 60 s" version is dropped,** and so is its station-blocking tactic.
- **Simultaneous draws:** the peek, the choice and the deck reorder are one atomic step. Two Abang Grabs or a station claim at the same moment must never hand out the same card.

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

- Exact screen layout for Abang Grab's "top 3" choice, as long as it works by tapping on a phone (see the mockup `docs/superpowers/mockups/2026-10-30-motion/8-power-up-slot.html`).
- How the "taken" state is stored (e.g. a `taken_at` / `taken_by` column), as long as it's atomic and taken power-ups no longer appear in anyone's hand.
- Copy for power-up refusal edge cases not listed above, in the same voice as §6.
