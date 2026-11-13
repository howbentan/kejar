# Kejar: five new power-ups (Cheese Ais, Nasi Lemak KFC, Tuch and Ga, Super Ring, Mak Kau Hijau)

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game. Where this doc disagrees with it, this doc wins for the cards below, and the rules doc is updated to match when this is built.

**Status:** Designed with the owner in chat, 2026-11-12. Not built.
**Sequencing:** builds on the three plans in `2026-11-11-kejar-gameplay-audit-fixes-design.md` (built as of 2026-11-12: migrations 0016 to 0018). That doc's aim is a fair, complete Core game "before any more legendaries", and several rules below lean on what it adds (the new Durian, the late-ping rule, `Undo kejar`, the 60 s last-catch hold).
**Builds on:** `2026-10-28-kejar-malaysian-powerups-design.md` (the deck, one slot, card look, no-referee rule), `2026-10-28-kejar-jail-dato-seri-design.md` (Dato Seri), `2026-10-30-kejar-chaser-legendary-design.md` (Bomoh), `2026-10-30-kejar-organiser-setup-design.md` (secret cards, the walk).

## 1. Why

The owner wants more Malaysian flavour in Full mode: cards whose names local players recognise on sight (a cheese snack, a viral drink, a fast-food queue, the toll card, a playground game) and whose effects match the joke. Full is for regulars, so it can carry more variety than Core.

## 2. Goals

- Three new deck cards: **Cheese Ais** (runners), **Nasi Lemak KFC** (both decks), **Tuch and Ga** (chasers).
- Two new legendaries: **Super Ring** (runners) and **Mak Kau Hijau** (chasers).
- **One legendary per side per Full game, picked by the app** (owner's decision), so the organiser still hides at most two cards.
- Every effect decided entirely by the app.

## 3. Non-goals

- **No change to Core.** Core keeps Durian, Ponteng, Mat Rempit and Pak Guard only.
- **No change to the existing cards' effects** (apart from what the audit-fixes doc already changes, e.g. Durian).
- **No quest-giver or ritual mode for the new legendaries.** Stash only (owner: not enough crew).
- **Artefacts that carry across games, and riddle hints for legendaries.** Discussed and parked for later, once Kejar has regulars; not part of this design.
- **Final deck counts.** Starting counts are given (§7) and get tuned after playtests.

## 4. Anti-goals (a failure even if it technically works)

- **Any power-up that needs a marshal or an honour rule** (owner's decision, power-ups design §4). If the app can't check it, it isn't in. This is why the first "touch something green" idea for Mak Kau Hijau was dropped.
- **A card that loops, stacks forever, or breaks the one-slot rule** (e.g. doubling a doubler, or Abang Grab keeping two cards).
- **A card that leaks hidden information**, including through its own refusal message.
- **One player locking a whole team out**, e.g. one runner freezing every chaser at once (why Cheese Ais targets one chaser).
- **Jokes that mock real people, race or religion** (power-ups design §4). Super Ring's house arrest and 2.6 numbers are a nod; never name anyone, and keep away from anything touching royalty. Super Ring itself is the Oriental cheese ring snack.
- **Using a real brand's look.** "Tuch and Ga" is spelt that way on purpose; the card art must not copy Touch 'n Go's blue card or logo.

## 5. The new deck cards

All three are Full only, drawn from stations like any card, held in the one slot, and stealable by Toyol or Ah Long while unused (unless sealed by Abang Grab). Effects land through the same paths the existing cards use.

### 5.1 Cheese Ais (runners): brain freeze

- **On use:** the runner picks one chaser from a list. That chaser's power-up slot is **frozen for 3 minutes**.
- **Frozen means:** the chaser can't use the card they hold and can't claim from a station (or the Bomoh / Mak Kau Hijau stash) until the freeze ends. An effect they had already switched on keeps running (a pending Mat Rempit ping, a Pak Guard waiting for its ping, a toll gate).
- **The picker** shows chaser names only, never what they hold. It leaves out chasers who are frozen, Luar Garisan or removed. If no chaser can be picked, the card is refused and not spent.
- **No stacking:** a frozen chaser can't be picked again until their freeze ends.
- **A frozen card can still be stolen** by Toyol (freezing stops using, not losing).
- **Messages:** the frozen chaser sees `Brain freeze! A runner froze your power-up for 3 minutes.` (no name). The runner sees `Cheese Ais! {name} is frozen for 3 minutes.` Feed: `Brain freeze on a Kejar.` (no names). Exact wording is the builder's within the copy rules (§9).
- **Slot:** done the moment it succeeds (like Toyol), so the runner can claim again straight away.
- **A chaser's frozen state** must be visible to them as a slot state with a countdown (`FROZEN · 2:14`), reusing the Mat Rempit cooldown chip's look.

### 5.2 Nasi Lemak KFC (both decks): the combo

- **On use:** your **next deck card works twice**.
- **How (Claude's call):** using Nasi Lemak KFC frees your slot and marks you as "combo ready". The next deck card you get (from a station, or delivered by Abang Grab) arrives with **two uses**. You use it twice, each use following that card's normal rules, and your slot stays busy until both uses are spent and their effects have finished. The combo mark is shown on the slot (`COMBO READY`).
- **It can't double:** Abang Grab (would keep two cards), Nasi Lemak KFC itself (would loop), Dato Seri, Super Ring, Bomoh or Mak Kau Hijau. If the next card you get is one of these, it arrives as normal and the combo mark **stays** for the card after.
  - Abang Grab is excluded as the card being doubled; using Abang Grab *while* combo ready is fine, and the card it delivers gets the two uses.
- **Each card's limits still apply to the second use:** Mat Rempit's one-at-a-time rule and 3-minute team cooldown; Cheese Ais's no-stacking (the second use must pick a different, unfrozen chaser, or wait); Toyol/Ah Long's "nothing to take means not spent".
- **Doubled Durian:** two shields one after the other. The player taps Use once; the second shield **switches itself on** the moment the first blocks a catch, with its own fresh 10 minutes (so one quick double scan can't burn both). If the first shield runs out unused, the second switches itself on at once for its own 10 minutes (Claude's call: both uses were paid for). Each block applies the audit-fixes Durian effect (stung chaser locked off for the game, 15 s head start).
- **Doubled Gostan, Ponteng, Pak Guard, Tuch and Ga:** the second use lands on a later ping than the first; you can't spend both on the same ping.
- **The combo mark can't be stolen** (it isn't a card). An unused Nasi Lemak KFC card can be.
- **If the game ends or you're jailed** while combo ready, the mark stays with you until you next get a card or the game ends (Claude's call; jailed runners can't claim anyway).
- **Messages:** user: `Nasi Lemak KFC! Your next power-up works twice.` On delivery: `Combo! {card} x2.` Feed: the existing pickup line, no card named.

### 5.3 Tuch and Ga (chasers): the toll gate

- **On use:** a toll gate is dropped at **the chaser's own position at the moment of use**. At the **next ping reveal** (scheduled or Mat Rempit), any runner whose check-in is within **40 m** of the gate shows **exact**, not fuzzy.
- **Built like Pak Guard** (`app/shared/views.ts`, the `focusers` check): same "next reveal after use" window and same exact-dot treatment, but the centre is the chaser's position at `used_at`, not at the reveal, and the radius is 40 m. If the chaser has no position in the 60 s before use, the card is refused and not spent (Claude's call, matching the catch rule's "location from the last 60 s").
- **Order with other cards:** exactly as Pak Guard today. Ponteng beats it (the runner looks like they never checked in); Gostan beats it (the runner is drawn at the decoy spot, the same way Pak Guard and Bomoh draw a Gostan runner).
- **Hidden from runners** (owner's decision). Runners never see where the gate is. Chasers (the whole chaser team) see the gate as a pin on their map until the reveal it lands on.
- **Messages:** chaser: `Tuch and Ga! Toll gate up. Runners checking in near it get charged.` Exact dots it caused carry their own `revealedBy` value so the map can draw them distinctly from Pak Guard's. Feed for chasers: `A Kejar set a toll gate.` Runners' feed: nothing that hints where.
- **Slot:** busy until the reveal it lands on (same as Pak Guard).

## 6. The new legendaries

### 6.1 One legendary per side, picked by the app (owner's decision)

- A Full game has at most **one runner legendary** (Dato Seri **or** Super Ring) and **one chaser legendary** (Bomoh **or** Mak Kau Hijau).
- The organiser's setting changes from per-legendary (`legendaries: { dato, bomoh }`) to **per side**: runner legendary On/Off, chaser legendary On/Off. When a side is On, **the app picks which legendary at random** when the game is created, and assigns that legendary's secret card as today. Changing Full to Core and back re-picks (Claude's call, consistent with the mode switch releasing and re-assigning the card, organiser setup R8).
- **Players never learn which one is in play** until it's found, same as today (rules §9b). The hint zone's colour is the only difference they can see.
- **The organiser does know** (they hide the card). The walk and packing list name the colour to hide; nothing a player or marshal sees does.
- **If no free card of the picked colour exists,** fall back to the other legendary of that side if it has a free card; otherwise follow ruling R9 as today (`Reprint a card to use it.`). (Claude's call.)
- **Printed kit:** each organisation now has four secret card sets, A–C each: yellow (Dato Seri), **cheese orange (Super Ring)**, purple (Bomoh), **deep green (Mak Kau Hijau)**. `secret_cards.legendary`'s check widens to the four values. The green must read clearly apart from Kejar's Volt lime `#C6FF3D`; the orange apart from Dato Seri's yellow.
- **Card look:** both new legendaries use the legendary card structure, recoloured. **Restyled 2026-11-13 (owner's decision):** every legendary card and slot is now the ordinary flat dark card in its own colour with marker scribbles; the gradient face, foil and glow are gone. New stickers: Super Ring is a doodle of the snack packet, Mak Kau Hijau a mak cik dressed all in green.
- **Finding, scan limits, secrecy, immunity:** exactly as Dato Seri and Bomoh: stash only, fuzzy 100–200 m hint zone in the legendary's colour, the 3-missed-scans limit, `Something legendary was found.` in the feed, immune to Toyol and Ah Long, and Nasi Lemak KFC can't double them. A Luar Garisan player scanning it gets `Nothing here.`

### 6.2 Super Ring (runner legendary): house arrest

- **Claiming it:** the runner scans the hidden cheese-orange card. Super Ring **switches on at once and waits**, holding the runner's one slot until it fires (like Dato Seri holding the slot, audit-fixes non-goal M3).
- **It fires the next time the holder would go to Penjara, by any route:** a catch, auto-jail from missed check-ins, or Mak Kau Hijau.
- **House arrest instead of Penjara:**
  - The runner stays **free** (not jailed) but under house arrest for **2 minutes 36 seconds** (the 2.6 nod), inside a **26 m circle**.
  - **Where the circle goes (Claude's call, after the builder check):** on a catch, it's centred on the runner's position at the catch (the chaser's fix if the runner's is older than 20 s). On auto-jail or Mak Kau Hijau the runner didn't have Kejar open, so their last fix may be old and far away: instead they get a push, `Super Ring! Open Kejar within 60 s to start house arrest.`, and the circle is centred on their first fresh fix after it fired. The 2:36 starts then. If no fresh fix arrives within 60 s, they go to Penjara as normal and Super Ring is spent.
  - **Nobody can catch them** during house arrest (catches are refused: `House arrest. Can't catch them right now.`). Chasers don't see them on the map.
  - The runner's screen shows the circle, their position and the countdown, and asks them to keep Kejar open. It doesn't count down while the game is paused.
  - **The release check (key rule):** at 2:36 the runner's phone must report a fix inside the circle (26 m plus the fix's GPS error, using the same accuracy rules as Luar Garisan: a fix worse than 50 m doesn't count). If the latest fix is inside: free, Super Ring is spent. If it's outside, or there's no usable fix from the last 20 s: **straight to Penjara** (`Bail revoked. To Penjara.`). Without this, a runner could pocket the phone and walk away.
  - **Leaving early:** any usable fix outside the circle during house arrest sends them to Penjara at once (`Bail revoked.`).
  - **The catching chaser is locked off (owner's decision, after the builder check):** when Super Ring fires on a catch, that chaser hands the tag back and **can never catch that runner again this game**, exactly like the audit-fixes Durian lock (keyed to the two player ids, surviving `New phone`). Their catch screen says `Super Ring! You can't catch {name} again this game. Hand the tag back.` Other chasers don't know where the runner is (hidden from the map during house arrest), so nobody can wait outside the circle. This keeps the audit doc's anti-goal: no timer a chaser can beat by standing next to the runner and waiting. On auto-jail or Mak Kau Hijau there's no catching chaser, so no lock.
  - It **does not use** the runner's one "freed" for the game (they never went in).
  - If the game ends during house arrest, they count as free.
  - **Luar Garisan still applies.** A house-arrest circle that pokes outside the play area doesn't excuse leaving it.
- **With Durian:** can't happen together (one slot).
- **With Undo kejar:** undoing the catch that fired Super Ring ends the house arrest, lifts that chaser's lock, and gives the runner Super Ring back, still switched on (Claude's call: the undo means the catch never happened).
- **With the last-catch hold:** a runner under house arrest is free, so they stop the "no free runners" end.
- **Messages:** on claim (private): `Super Ring! Next time you'd go to Penjara, it's house arrest instead.` On firing: `Super Ring! House arrest: stay within 26 m for 2:36.` On release: `Free! Super Ring is spent.` Feed: `Something legendary saved a Dikejar.` (never names the card, rules §9b style).

### 6.3 Mak Kau Hijau (chaser legendary): touch green

**Rewritten 2026-11-13 (owner's decision): 20 s, tapping reveals you, Penjara locked for 3 minutes.** The 45 s version was too weak.

- **Claiming it:** the chaser scans the hidden deep-green card. Like Bomoh, it **triggers on claim** (Bomoh spec §2e), with no hand card.
- **On trigger:** every runner who is free, not Luar Garisan, and not under house arrest gets a push and an in-app takeover. The push says `Mak kau hijau! Tap the green in 20 s or go to Penjara.` The takeover's line (owner-approved with mockup A) says `Miss it and you go to Penjara. Tap and the Kejar see where you are.`
- **The tap screen (tap screen A):** full-bleed flat green with black type: `MAK KAU HIJAU · LEGENDARY`, the Mak Kau Hijau sticker, `mak kau hijau!` with black marker stars and underline, a black panel with `TAP IN`, the mono countdown and a 10-segment bar draining as the time runs out, the line `Miss it and you go to Penjara. Tap and the Kejar see where you are.`, and one black pill, `Tap the green`. After a good tap: `safe!`, the owner's bold tick on a big round button, and `Safe! You touched green. The Kejar can see where you tapped.`
- **One shared deadline (Claude's call, after the builder check):** the deadline is the moment it starts plus **20 s**, the same for every runner. Anyone who hasn't tapped by then goes to Penjara, exactly as if auto-jailed (same Penjara screens, walk and ticket; the auto-jailed variant's wording, adjusted to say Mak Kau Hijau). There's no free miss.
- **Tapping reveals you:** a tap carries the runner's fix (whatever fix the phone has ready within 300 ms; the tap never waits longer for GPS). If it has no usable fix (50 m or better), the server uses their latest usable stored fix from the 20 s before the tap; with none, the tap still counts but reveals nothing. Every Kejar then sees that Dikejar as an **exact dot at the tapped spot**, with a deep-green ring (`revealedBy: 'hijau'`), until the next ping reveal replaces it. Marshals already see everyone; runners never see these reveals.
- **Penjara is locked for 3 minutes** from the deadline, only when the run counts: no jailbreak rescue can start or succeed (a hold still running when the 20 s ends fails), no Dato Seri Settle and no reel pull, for anyone in Penjara. The pull isn't spent. The marshals' "Phone problem: undo" and `Undo kejar` still work: they're safety tools. Pausing holds the lock still. The Penjara screen shows `Penjara locked · 2:14` (mono, counting down), and refusals say `Penjara is locked for 2:14.`
- **Late-push rule (from the audit-fixes doc §1.1), adjusted for 20 s (Claude's call):** the server sends the push to all affected runners as one batch and records one send time (as `pings.alert_sent_at` does). If that send time is less than **15 s** before the deadline (the check-ins' 25 s could never fit in 20 s), or no push went out, the run is **void**: nobody is jailed, revealed or locked in (the card is still spent). A runner who has push turned off is **not** immune: like a check-in, the batch time is what counts, and the in-app takeover shows to anyone with Kejar open.
- **The tap must reach the server before the deadline.** A tap that arrives late counts as a miss. The phone retries quietly on a bad connection inside the 20 s.
- **Never overlapping a check-in window** (Claude's call): Mak Kau Hijau's 20 s must not overlap any scheduled or Mat Rempit check-in window. If one is open when the card is claimed, or would open during the 20 s, it starts when that window closes, so runners never face two buttons at once. The deferred start and its push go out on the first poll after that moment, as check-in alerts do (no server tick). If the 20 s can't fit before the end, it's void.
- **What doesn't save you:** Durian (it isn't a catch) and Ponteng (it isn't a ping). **What does:** Super Ring (house arrest instead).
- **Freed-once:** a runner jailed by Mak Kau Hijau can still be rescued or Settled, once the lock ends, if they haven't used their one freed.
- **Phone problems:** the marshals' existing "Phone problem: undo" for auto-jail also undoes a Mak Kau Hijau jailing, lock or no lock. That's a safety tool, not refereeing.
- **If it jails the last free runners,** the audit-fixes doc's 60 s last-catch hold applies (so a marshal can undo a phone problem), then the Kejar win is final.
- **Pausing** the game pauses the 20 s and the lock.
- **Messages:** chasers' feed: `Mak kau hijau! Dikejar have 20 s.`; afterwards `Mak kau hijau: {n} Dikejar to Penjara.` Runners who made it: `Safe! You touched green.` Card effect line: `Tap green in 20 s or Penjara`.

## 7. Deck counts (Claude's call, tune after playtests)

Full mode, one set per 10 runners or 5 chasers (as today, `app/shared/deck.ts`):

| Deck | Today | With this design |
|---|---|---|
| Runners | Gostan ×2, Durian ×2, Ponteng ×2, Toyol ×1, Abang Grab ×1 (8) | add Cheese Ais ×1, Nasi Lemak KFC ×1 (10) |
| Chasers | Mat Rempit ×2, Pak Guard ×2, Ah Long ×1, Abang Grab ×1 (6) | add Tuch and Ga ×2, Nasi Lemak KFC ×1 (9) |

Why: Cheese Ais and Nasi Lemak KFC are strong, so one copy each; Tuch and Ga is a Pak Guard cousin, so it gets Pak Guard's two. Runners have 7 kinds, chasers 6; the counts, not the kinds, set the balance.

## 8. All power-ups after this design (reference)

| Card | Side | Mode | Effect in one line |
|---|---|---|---|
| Durian | R | Core | Blocks the next catch (audit-fixes effect) |
| Ponteng | R | Core | Left off the next ping |
| Gostan | R | Full | Next ping shows you 120–180 m away |
| Toyol | R | Full | Steal a random chaser's card |
| Abang Grab | both | Full | See the top 3, keep one, sealed |
| **Cheese Ais** | R | Full | Freeze one chaser's slot for 3 min |
| **Nasi Lemak KFC** | both | Full | Your next card works twice |
| Mat Rempit | C | Core | Extra ping in 30 s |
| Pak Guard | C | Core | Runners within 75 m exact at next ping |
| Ah Long | C | Full | Steal a random free runner's card |
| **Tuch and Ga** | C | Full | Toll gate: runners within 40 m exact at next ping |
| Dato Seri | R legendary | Full | Settle: free yourself plus up to 2 |
| **Super Ring** | R legendary | Full | House arrest (26 m, 2:36) instead of Penjara |
| Bomoh | C legendary | Full | Every free runner exact for 2 pings |
| **Mak Kau Hijau** | C legendary | Full | Tap green in 45 s or go to Penjara |

## 9. Constraints

- Everything the audit-fixes doc lists still holds: free tiers only, the single `api/game.ts` function, the server as the authority, numbered idempotent migrations run by hand by the owner before merge, `MemoryStore` and `SupabaseStore` in step.
- New `PowerUpKind` values need the `powerups_kind_check` constraint widened (as `0011_full_mode.sql` did) and `secret_cards.legendary`'s check widened.
- All power-up state changes that two players can race (claims, steals, freezes, Abang Grab, stash claims) need the same atomic care as `draw_card` / `steal_card` / `claim_dato`.
- Copy: English with a light Malaysian twist, no em-dashes, legendaries never named to players before they're found.
- Card art: doodle stickers in the existing style (power-ups design §5c). Super Ring is a cheese ring; Mak Kau Hijau something green and playground; Tuch and Ga a toll card that doesn't copy Touch 'n Go's look; Cheese Ais a cup with cheese foam; Nasi Lemak KFC a nasi lemak with a drumstick.

## 10. Left to the builder

- Data structures (how a freeze, the combo mark, a toll gate, house arrest and Mak Kau Hijau's deadline are stored), as long as both stores and the SQL agree and the rules above hold.
- Exact copy within §9's rules, the slot-state chips, and how the takeover and house-arrest screens look (mock them up first, in the existing motion style).
- Legendary card gradients for orange and green, and the new sticker art.
- How the per-side legendary setting is stored and how older games' `legendaries` values are read.
- Whether the new deck cards ship in one plan or two (e.g. deck cards first, legendaries second).
