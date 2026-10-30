# Kejar: jail gets a dare wheel and Dato Seri

**Status:** Design agreed with the owner in chat on 2026-10-28, revised substantially across two builder-check rounds, then revised again after the owner deliberately reversed the "no marshal judgement" direction for Dato Seri specifically, then re-checked against that latest version in a third builder-check round (resolved in §7). Not built. Two conflicts with a sibling spec are deliberate, not oversights (see §9). Ready for `writing-plans`.
**Builds on:**
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §4.7 (jail and jailbreak) and §4.8 (power-ups): the rules this extends.
- `docs/superpowers/plans/2026-10-24-kejar-plan-5-power-ups.md`: how power-ups are claimed and held today.
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: the sibling doc written earlier the same day. Dato Seri follows its naming conventions; §9 covers where this still pulls against it.

## 1. Why

Being jailed today is dead time: a caught runner just watches a spectator map delayed by 2 minutes, waiting for a teammate to risk a rescue run. The owner wants that wait to be fun, without weakening what makes getting caught matter — a chaser's catch should still cost the runner team something real, and most runners shouldn't be able to count on getting out.

## 2. Goals

1. Give every jailed player something fun to do in person while they wait, regardless of power-ups.
2. Give every jailed player a small, genuine flicker of hope of walking free on pure luck, without that hope ever being reliable enough to lean on.
3. Add a rare, powerful power-up — **Dato Seri** — that lets its holder guarantee their own release, plus one other jailed runner, instead of only waiting on a teammate. Themed as "making a call" the way a Dato Seri would in real life: not a gamble, just effort and connections.
4. Keep catches meaningful throughout: every way out of jail should be either risky for someone else (teammate rescue), low-odds (the wheel), or gated behind a genuinely scarce resource (Dato Seri) — never free, guaranteed, and available to everyone at once.

## 3. The dare wheel (every jailed player, every jail stay)

The moment a runner is jailed, they spin a wheel with **10–12 slices**:

- **Most slices are silly dares.** A starter set (**Claude's call, trivially swappable** — the owner only gave one example, "67"):
  1. Say "67" sixty-seven times in a row, fast, without stopping.
  2. Do 10 jumping jacks while singing the alphabet backwards.
  3. Hold a one-leg balance for 30 seconds without looking away from the marshal.
  4. Chicken-dance for 20 seconds.
  5. Rap your own name five times without laughing.
  6. Deliver "I got caught because I'm bad at this game" in the silliest voice you've got.
  - The runner performs the dare for the marshal on jail duty, who confirms it in the app with a single tap — the same shape of interaction as marshals already handling alerts. This is the one place a marshal is still involved, and it's deliberate: the dare wheel is pure entertainment, not a power-up, so the sibling doc's "no marshal judgement" rule (which is about power-up effects) doesn't apply to it.
  - **Zero effect on release.** Doing (or skipping) a dare never changes whether or when you get out.
- **One slice is "You're free."** Landing on it releases the spinner immediately — no marshal confirmation needed, since it's a random, app-decided outcome rather than a verified performance.
  - This is a genuinely small chance (roughly 1-in-10 to 1-in-12, set by however many slices the wheel ends up with), available to **every** jailed runner regardless of power-ups — this is what gives every jail stay real, if slim, hope.
  - **It still spends the runner's one lifetime "freed" flag**, the same flag ordinary jailbreak and Dato Seri's Settle both use (**Claude's call** — without this, the wheel would quietly break the base design's guarantee that games actually end, by giving every runner a repeatable, free way out). If a runner has already used their one lifetime "freed," landing on this slice does nothing (**left to the builder**: whether that's a different flavour message, or the slice is simply excluded from their wheel once they're used up).
- **Exactly one spin per jailing (Claude's call, fixes a contradiction a reviewer caught).** A jailed runner gets one spin for this jail stay, not unlimited re-rolls — otherwise the ~1-in-10 odds in the previous point are meaningless, since anyone could just keep spinning until they hit "free." This needs one small piece of per-jailing state (e.g. a flag that resets the next time that runner is caught again), which §7's "no new persistent state beyond an event when a dare is confirmed" undersold — that line is corrected in §7 below. A fresh jailing (i.e. being caught again later) resets it, so it's not a resource to ration across the whole game, just within one stay in jail.

## 3a. How the dare wheel looks and feels (decided with mockups, 2026-10-30)

Mockup: `docs/superpowers/mockups/2026-10-30-motion/9-penjara-dare-reel.html`. The owner chose a **reel**, not a wheel, after a round wheel looked cluttered. A split-flap "departure board" was the runner-up.

- **When:** the pull becomes available **once the jailed runner arrives at Penjara** (within 30 m, the same point the walk-to-Penjara guide hands over), so dares are performed where Pak Pulis is (**Claude's call**).
- **The screen:**
  - `PENJARA` eyebrow, `Your dare.` and `One pull. One slot sets you free.`;
  - one full-width lime-bordered **reel window**, with lime markers either side of the middle line;
  - the **Penjara lever** directly **underneath**: a wide lime handle with cell-bar grips that the player pulls straight down along a short track. A tap pulls it for them.
- **The pull:**
  - the handle ratchets down and springs back;
  - the reel scrolls dare cards upward, slows down over about 2.8 s, and stops with a small shake;
  - the lever then greys out: `ONE PULL PER STAY`.
- **The free slot** is the lime card in the reel; every other card is a dare (name plus a one-line description).
- **Landing on a dare:** a sad two-note "wah-wah", a short buzz, and a card `PERFORM IT FOR PAK PULIS` plus the dare. Pak Pulis's screen lists it with **Done ✓**. Once tapped, the runner's card updates to `PAK PULIS SAYS: DONE ✓ · NOW WAIT FOR A RESCUE`.
- **Landing on free:**
  - a lime flash and a long buzz, and the result card turns lime: `YOU'RE FREE` / `Keluar penjara! Walk away from Penjara and hide. This uses your one escape.`;
  - the sound is the **vine boom** (owner's choice; the owner supplied the clip). **Check its licence before shipping.** Until then the repo mockup uses a generated fanfare.
- **Sound:**
  - a click per card passing the markers, a ratchet when pulling, a clunk when it stops;
  - a **mute toggle** on the screen;
  - sound is fine here because jailed players aren't hiding. iPhones in silent mode may not play it.
- **No casino styling:** no fruit symbols, no "jackpot" wording. It's a dare, not a prize.
- **Not built yet.** It reuses the motion design's ground rules (Motion library, transform and opacity only, reduced motion respected).

## 4. Dato Seri (new, rare, runner power-up)

- **Side:** runner — joins Gostan, Durian, Ponteng and Toyol from the sibling doc's runner list.
- **Getting one — a real quest, verified by a person, not the app (owner's explicit, repeated decision — see §9):**
  1. **The organiser sets a fresh catchphrase** when creating the game, and teases the event on social media the day before — *without* giving the phrase away, e.g. "someone special is walking the park today — find them." This builds hype without handing the win to anyone who didn't show up.
  2. **A distinctly-vested quest-giver wanders the live event.** The app shows every player a **fuzzy, live-updating hint** of roughly where the quest-giver currently is, somewhere in the **100–200 m** range of fuzziness, refreshed about as often as a ping (**Claude's call on the exact numbers, consistent with similar numbers elsewhere in this doc**). This hint is **unconditional — the app never checks whether the player actually knows the phrase** (**Claude's call, resolving a self-contradiction a reviewer caught**): adding a phrase-check just to unlock a hint screen would mean building a whole second verification path for something that doesn't need one, since the real gate is step 3 below. Anyone can look at the hint; only someone who's actually heard the phrase will know what to say once they get there.
  3. **The player finds the quest-giver and says the phrase to them, in person.** The quest-giver listens and decides whether it's right — a real human verification, not an app check.
  4. **On granting it, the quest-giver taps a confirm action on their own device** (the same kind of admin action marshals already perform, like pause/resume), which puts Dato Seri in the player's one power-up slot in the game's actual state (updated 2026-10-30: power-ups are now one slot per player, see the Malaysian power-ups design §5a). They also hand the player a **physical coin** as proof.
  - Exactly **one** Dato Seri exists per game, not scaled by player count — the scarcity is the point, and the phrase changes every event so it never becomes stale trivia regulars just already know.
  - Claiming it **occupies the runner's one power-up slot**, so they can't hold anything else alongside it, and they can't claim it while their slot is full (**updated 2026-10-30** for one slot per player; previously "fills all three hand slots").
- **Using it — "Settle," verified by a person too:**
  - Only usable while jailed. The holder physically shows their coin to **Pak Pulis** at the jail — a different role from the wandering quest-giver, stationed where jailed players actually are.
  - **Pak Pulis looks at the coin, decides it's genuine, and taps "confirm Settle" on their own marshal screen** — another deliberate, conscious exception to "no app-decided power-up effects" (§9), made the same way as acquisition: because the owner wants Dato Seri's two key moments to feel like real human interactions, not phone taps.
  - **Pak Pulis keeps the coin afterward (Claude's call).** This is what actually makes it one-time-use — handing it back would let the same coin get passed between friends to fake multiple releases.
  - **Still "never fails" — for anyone still eligible.** The human verification step is about *whether this is genuinely the coin and the right moment*, not about rolling dice or making someone perform for approval. The base design's one-escape-per-runner rule still applies underneath it:
    - If the holder has already used their one lifetime "freed" (from an earlier jailbreak, the wheel, or a previous Settle), Settle can't free the holder themselves — same as the base game already treats a previously-freed runner who's caught again.
    - The holder can only choose a target among currently-jailed runners who **haven't** used their lifetime "freed" yet.
    - Settle frees whichever of {holder, chosen target} is still eligible — potentially just one of the two. If *neither* is eligible, Pak Pulis's confirm action should simply refuse (consistent with how `removePlayer`-style marshal actions already handle a no-op case).
  - Frees the holder, plus **one** other currently-jailed eligible runner, chosen by the holder if more than one eligible runner is jailed alongside them.
  - Spends the same lifetime "freed once" flag as everything else, for each person it actually frees.
  - If the holder is the only one in jail (or the only eligible one), Settle just frees them alone.
  - **Claiming Dato Seri stays secret**, like every other runner power-up. **Using Settle is visible** — it's a physical, in-person hand-off at the jail that anyone nearby can see, the same way an ordinary jailbreak already is, so there's nothing to hide there anyway (**Claude's call**).

## 5. Non-goals

- No random chance of failure for Settle.
- No exception to the one-slot limit: Dato Seri deliberately crowds out everything else while held.
- No scaling the badge... — there's no physical badge any more. No scaling the number of valid catchphrases or claims per game — always exactly one.
- No map marker, no station, no Abang Grab eligibility.
- No opening Settle (or the wheel's free slice) to everyone unconditionally — this was floated and rejected in brainstorming specifically because it guts the catch mechanic; see §2.4.
- **Dato Seri cannot be stolen by Toyol or Ah Long (Claude's call).** The sibling doc's Ah Long steals a random unused power-up from a random free runner, and an unused, hand-filling Dato Seri would technically qualify. Given how much ceremony this design puts around Dato Seri being rare, letting one unrelated dice roll permanently delete the only copy in the game would undercut the whole point, so Toyol and Ah Long's steal pool explicitly excludes it.

## 6. Anti-goals

- **Punching down or getting crude,** same bar as the sibling power-ups doc: cheeky-uncle level, nothing that mocks real people, groups, or real institutions. (This is also why the marshal's in-jail nickname landed on "Pak Pulis" — a generic word for police — rather than PRDM, the actual national police force's name; see §9.)
- **Making the dare wheel feel punishing.** Dares must stay quick, safe, and genuinely silly — nothing that singles a player out cruelly, nothing physically risky, nothing over about 30 seconds.
- **Letting any escape path feel guaranteed.** Every path out of jail costs someone something: a teammate's risk, long odds, or a resource that took real effort and luck to acquire.

## 7. Constraints

- **Brand colours:** Volt `#C6FF3D`, black and white only, matching every other screen.
- **Fonts:** Geist and Geist Mono.
- **Free tiers only;** keep the single `api/game.ts` function.
- **Database:** needs a numbered migration, run by hand in Supabase as usual. At minimum: a field for the game's current catchphrase (set at creation) and whether Dato Seri has been claimed yet (and by whom); the quest-giver's live position, for the fuzzy hint; and a small per-player flag marking whether this jailing has already had its one dare-wheel spin (reset each time that runner is caught again — corrects an earlier draft of this doc, which wrongly said the wheel needed no new state at all). Settle and the wheel's free slice both reuse the existing `jailed`/`freed_once` player fields exactly as ordinary jailbreak does today, so every escape path shares one source of truth for "has this runner already been freed."
- **The quest-giver and Pak Pulis need device access, but not full marshal permissions (Claude's call, closing a gap a reviewer caught).** The existing `marshal` role can pause the whole game, remove any player, and see SOS/reports — handing that whole toolkit to someone just to let them tap one "confirm" button is a much bigger trust footprint than the action itself needs, especially since §10 already anticipates these might be dedicated volunteers rather than existing trusted marshals. These two roles should get a narrower permission scoped to only their one confirm action each, not the full marshal role.
  - **Implementation shape (Claude's call, resolved in the third builder-check round): a scoped invite/token, not a new `Role` value.** The `Role` enum (`'runner' | 'chaser' | 'marshal'`) is load-bearing elsewhere — team-ratio checks, roster lists, and the map legend all assume every player is one of those three. Adding `'quest-giver'` or `'pak-pulis'` to it would mean threading exceptions through all of that for two people who never appear on a roster or a map dot. Instead, these follow the existing `createMarshalInvite`/`redeemMarshalInvite` pattern: a narrow-scoped invite link that, when redeemed, unlocks exactly one action (`grantDatoSeri` or `confirmSettle`) on that device, with no `Player` row created and no exposure to team balance or the map.
  - **The hint pipeline runs for the whole lifetime of the game, not just the chase phase (Claude's call, resolved in the third builder-check round).** Unlike station claims (§4.8.1, "chase phase only"), the quest-giver starts wandering and the fuzzy hint becomes visible as soon as the game exists — covering lobby and hide phase too — since the social-media tease goes out the day before and the whole point is to let early arrivers start hunting before the chase even begins. It stops once Dato Seri is claimed, or the game ends. This needs its own always-on feed rather than reusing the existing phase-gated position/location pipeline that chaser and marshal views rely on.
  - **Settle's confirm screen is a single Pak-Pulis-side action, not a two-device handshake (Claude's call, confirming what §4 already implies).** §4 already says the target is "chosen by the holder" — that's the holder telling Pak Pulis who to free out loud, the same in-person ceremony as showing the coin. Pak Pulis then picks that name from a list of currently-jailed eligible runners on their own screen and confirms, matching the existing single-device shape of `removePlayer`/`pause`/`resume`. No request needs to come from the holder's phone.
- **The physical coin** is a real printed/manufactured prop the organiser needs to produce and bring to every event, same category of cost as the printed station QR cards and tags already budgeted in the base design.

## 8. What changed from the first draft

This design went through several real pivots in brainstorming, not just wording tweaks:

- **Acquisition** started as a marshal physically handing out a printed badge, moved to a pure app-typed catchphrase (to drop marshal involvement entirely), then landed back on a human-verified hand-off — a distinct quest-giver role, found via an app-given fuzzy hint, who verifies the phrase in person and grants it. The owner's explicit reasoning for the final version: most of jail is already app-mediated (the dare wheel, the lucky slice), and Dato Seri should be the one thing that *isn't* — a real quest, not a phone interaction.
- **Settle** started as a 2-minute marshal-confirmed performance, moved to an instant no-confirmation tap (traded for freeing one fewer person), then landed back on a human-verified hand-off too — showing a physical coin to Pak Pulis at the jail, who confirms it in person. Same reasoning as acquisition: a deliberate, matching bookend to how Dato Seri was obtained.
- **A new, separate mechanic** — the dare wheel's rare "you're free" slice — was added to give *every* jailed runner some hope, not just Dato Seri holders, after concluding that opening Settle itself to everyone would break the catch mechanic entirely. This one stayed app-only throughout, since it's not a power-up and doesn't need the same ceremony.

## 9. Two deliberate conflicts with the sibling Malaysian power-ups doc

This design was brainstormed in a separate conversation from `2026-10-28-kejar-malaysian-powerups-design.md`, written the same day. Both of these were raised explicitly during brainstorming and confirmed by the owner more than once — they're documented here so they're conscious exceptions, not oversights, when the two specs get reconciled:

- **Dato Seri's two key moments both need a human to decide the outcome.** The sibling doc states as an anti-goal: *"Every power-up's effect must be decided entirely by the app: no honour rules... no marshal judgement... disputes in a physical chase get heated, and marshals should watch for safety, not settle arguments."* Both getting Dato Seri (the quest-giver verifies the phrase) and using it (Pak Pulis verifies the coin) run directly against that. The owner's reasoning, given directly in chat: most of jail is already app-mediated, and Dato Seri should be the one part of the game that's a genuine human quest rather than a phone interaction — not an oversight, a considered trade of "no referee needed" for "feels like a real quest."
- **The dare wheel extends Malaysian flavour to jail**, via the "Pak Pulis" nickname and the dares themselves, even though the sibling doc's own scope decision was "the Malaysian characters and slang apply to the power-ups only... every other piece of wording in the app stays exactly as it is today," explicitly naming jail and jailbreak as staying unchanged. The owner chose "Pak Pulis" directly in this conversation, so this is a conscious widening of that scope.

## 9a. Resolved: the catchphrase is mandatory, for now

Every game requires a Dato Seri catchphrase at creation — including quick, casual test games with friends. The organiser doesn't have to actually post it on social media for a casual game; they can just tell friends directly. The social-media reveal is one way to use the field, not a requirement of the mechanism itself.

**Owner's decision:** if Kejar ever adds a second rare, legendary-tier power-up alongside Dato Seri, making the catchphrase (or which rare power-ups are active) optional per game becomes worth revisiting then. Not worth building that toggle now for a power-up that doesn't exist yet (**left to a future spec, not this one**).

## 10. Left to the builder

- Exact screen for spinning the dare wheel and the marshal-confirmation tap for dares, as long as it works one-handed on a phone.
- How the game's current catchphrase, its claimed state, and the quest-giver's live position for the fuzzy hint are stored.
- Where in the app a player sees the fuzzy hint once they know the phrase (a dedicated screen vs. something on the existing map), as long as it's clearly just a hint, not a precise pin.
- The quest-giver's and Pak Pulis's own confirm-action screens (granting Dato Seri; confirming Settle), as long as they follow the existing pattern for marshal admin actions (e.g. remove-player, pause/resume).
- Copy for the wheel's dare-confirmation and "you're free" moments, and for the quest-giver's grant confirmation and Pak Pulis's Settle confirmation, in the same plain-English-plus-flavour style already used for power-ups.
- Whether the dare list needs a config knob for organisers who don't want certain dares at a given venue, or whether the starter six in §3 are fine as a fixed list for now.
- Physical design of the coin itself (material, printing), in the same cheap-prop spirit as the existing station cards and tags.
- Whether the quest-giver and Pak Pulis are dedicated volunteers or existing marshals doubling up, and how that's staffed per event.
