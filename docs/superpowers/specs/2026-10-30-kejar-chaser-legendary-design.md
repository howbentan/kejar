# Kejar: a legendary power-up for chasers (name TBD)

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole (Core and Full modes, 2026-10-30). Where this doc disagrees with it, the rules doc wins; its §9 lists what changed.

**Status:** Brainstorm in progress, **not finished and not approved**. The character (§3) is deliberately on hold pending the owner's own real-world cultural sanity check. **Updated 2026-10-31:** the grant mechanism is resolved — it now mirrors Dato Seri's hidden-stash default, so it fits the crew of two (§2a), with mockups (§2b). The character is the only remaining blocker. Nothing here should be built yet.
**Builds on:**
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: Pak Guard's reveal radius (75 m, not 150 m) was dropped specifically to keep it clearly weaker than this power-up. §5c now treats legendary yellow as a reusable tier look, not Dato-Seri-exclusive, anticipating this card.
- `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md` §4b: this doc's stash-vs-staffed split is copied directly from there, same reasoning.

## 1. Why

Dato Seri gives runners a rare, ceremony-gated escape. The owner wants a chaser-side legendary of equal weight, "well incorporated into Malaysian culture," so the drama isn't one-sided.

## 2. Decided so far

- **Side:** chaser.
- **Rarity and slot cost, matching Dato Seri:** exactly one exists per game, and claiming it takes the chaser's one power-up slot. **Full mode only** (rules doc §3).
- **Location: stationary and hidden,** not wandering like Dato Seri's quest-giver mode — a deliberate mechanical difference between the two legendaries, kept in both grant modes below.
- **Effect: a continuously-updating live reveal of every free runner's exact position** (not a one-shot snapshot like Pak Guard) — different from Pak Guard on scope, locality, and live-vs-snapshot, all three.
- **Duration (owner's proposal, Claude agrees):** 1 minute if triggered with more than 5 minutes left in the game; extends to **last until the game ends** if triggered inside the final 5 minutes. The 5-minute threshold is a flat constant regardless of total game length, matching every other number in this design (`FOCUS_M`, the fuzzy-hint radius, etc.) — not yet explicitly confirmed by the owner, flag this when picking the brainstorm back up.
- **Immune to Toyol's steal pool (Claude's call, confirming the earlier tentative note).** Same reasoning as Dato Seri's immunity to Ah Long: a single random dice roll shouldn't delete the only copy of something this rare. Toyol is the mirror tool here since it steals from chasers.

## 2a. Two ways to grant it, mirroring Dato Seri (resolved 2026-10-31)

Dato Seri solved "how does a two-person crew run a staffed ritual" by making the staffed version optional and defaulting to a hidden stash. This power-up copies that split exactly:

| | **Hidden stash** (the default; build this first) | **The ritual** (when there's a spare volunteer) |
|---|---|---|
| Placing it | The organiser hides a small printed QR card somewhere subtle, then taps **`Drop [legendary] here`** on their phone to save the spot. | A person in character (the ritual performer) stations themselves at one hidden, decorated spot for the whole event. |
| Hint | A fuzzy yellow zone (same 100–200 m default as Dato Seri's, **Claude's call, not yet explicitly confirmed for this card**), fixed around the stash, visible to everyone from the start of the chase phase. | The same fixed zone around the performer's spot — still stationary, unlike Dato Seri's wandering quest-giver. |
| Getting it | **The first chaser to scan the card** gets it, reusing the station scan and its within-30 m check. The card stops working after. Runners can see the hint too, and can walk over and try to scan it, but the app refuses them (`Not for your side`) — they can still loiter and guard the spot, same as chasers can for Dato Seri's stash. | The chaser finds the spot, the performer does the ritual (e.g. a coconut-smashing ritual, if the character ends up being Bomoh) and grants it on their own device — a staffed, human-verified hand-off, the same ceremony family as Dato Seri's quest-giver mode. |
| Proof | None needed: the app knows who scanned it. | Whatever physical token the ritual leaves behind (**left to the builder**, once the character is settled — Dato Seri uses a coin; this doesn't need the same prop). |
| Extra people | None — fits the crew of two. | One dedicated person, stationed for the whole event, on top of the base crew. |

- **Why the stash is the default:** same reasoning as Dato Seri §4b — a volunteer is one more thing the organiser has to arrange for every event, and the stash needs only a printed card.
- **What stays the same in both modes:** one per game, chasers only, takes the one slot, immune to Toyol, the legendary look (§2b), and the 1-minute/until-end effect duration.
- **This resolves the staffing blocker.** The old plan assumed a dedicated ritual performer was mandatory, which didn't fit the crew of two (rules doc §5). It's now optional, exactly like Dato Seri's quest-giver mode.

## 2b. How it should look, following Dato Seri's pattern (not yet mocked up)

- **Legendary yellow**, the same tier look as Dato Seri (power-ups design §5c, updated 2026-10-31 to be a reusable tier, not Dato-Seri-exclusive): the yellow gradient face, iridescent foil, glow, and the slot-claim pop-and-spin.
- **A placeholder mockup exists** at `docs/superpowers/mockups/2026-10-31-chaser-legendary/1-stash-card.html`, showing the map hint zone, a chaser's scan-and-claim, and a runner's refused attempt — using a `???` placeholder name and art, since the character isn't chosen. It reuses the CSS straight from `10-dato-seri.html` so the two stay visually consistent.
- **Open, flagged in the power-ups doc §5c:** if Dato Seri and this card are both live in the same Full-mode game, their two hint zones are both unlabelled yellow `?` circles, indistinguishable from each other on the map. Not solved here — a third brand-colour exception seems like the wrong fix given "one exception, each with a single job" (rules doc §7); the cheaper fix is probably that walking up and trying to scan just tells you which is which, the same way a wrong-side scan already refuses cleanly. Revisit if playtests say this is actually confusing.
- **Kept secret, same as Dato Seri (§4c of the jail design):** the hint zone carries no name, and the feed line stays generic (`Something legendary was found.`) regardless of which legendary it was.

## 3. Still open

- **The character — the only real blocker now.** Candidates discussed:
  - **Bomoh** (traditional Malay shaman): fits a ritual-grant mode naturally, but is a role some people still genuinely practice/believe in today, not pure folklore — real cultural-sensitivity risk, flagged honestly rather than reassured away.
  - **Pontianak** (iconic Malay/Indonesian vampiric-ghost folklore figure): pure folklore, nobody "practices" being one, so safer on that specific axis — but her origin (death in childbirth) is a much darker root than, say, Toyol's mischievous-imp framing, and pop culture often sexualizes her portrayal, which risks the sibling doc's own "no sexual content" anti-goal. Already listed once in the sibling doc's own non-goals as "discussed but not picked," worth knowing before re-raising it.
  - **Hantu Rimba** (a forest spirit): pure folklore, lower risk, proposed as a backup.
  - **Cikgu Jejak** (a fully secular legendary tracker/mentor): zero spiritual content at all, proposed as the safest backup.
  - The owner wants to sanity-check this with actual Malaysian people before deciding. All four stay on the table until then.
  - **Now lower-stakes than before:** since the ritual is an optional mode rather than the only way to grant it, the character choice no longer blocks shipping the stash default — it only matters for the optional staffed mode and the card's name/art.
- **If the character ends up being Pontianak** (or another non-human-practitioner figure), the ritual mode's "a person in character performs a ritual for you" framing, built around Bomoh, may not map directly — a monster figure granting a boon isn't quite the same narrative shape as a human ritual-performer granting one. Not resolved; doesn't block the stash default either way.
- The two yellow-zone-ambiguity and exact hint-radius questions noted in §2b.
- The name of the card and its grant moment, once the character is settled.

## 4. Related, already locked in and shipped elsewhere

- Pak Guard/Focus's reveal radius is 75 m, not 150 m (`app/shared/views.ts`, `FOCUS_M`) — done specifically to keep it clearly weaker than this power-up.
- Dato Seri's own stash-vs-quest-giver split and crew-of-two staffing (jail design §4b, rules doc §5), which this doc's §2a copies directly.
