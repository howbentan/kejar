# Kejar: Bomoh, the legendary power-up for chasers

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole (Core and Full modes, 2026-10-30). Where this doc disagrees with it, the rules doc wins; its §9 lists what changed.

**Status:** Design agreed with the owner in chat, 2026-10-28 through 2026-10-31. **The character is settled: Bomoh** (owner's decision, 2026-10-31), after the owner's own real-world cultural check. The grant mechanism mirrors Dato Seri's hidden-stash default, so it fits the crew of two (§2a), and the card gets its own colour, purple, rather than sharing Dato Seri's yellow (§2b) — doodle card art mocked up in `docs/superpowers/mockups/2026-10-31-chaser-legendary/`. Not yet builder-checked, not built.
**Builds on:**
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: Pak Guard's reveal radius (75 m, not 150 m) was dropped specifically to keep it clearly weaker than this power-up. §5c now also covers Bomoh's purple as its own brand exception alongside Dato Seri's yellow.
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
| Placing it | The organiser hides a small printed Bomoh QR card somewhere subtle, then taps **`Drop Bomoh here`** on their phone to save the spot. | A person in character as Bomoh stations themselves at one hidden, decorated spot for the whole event. |
| Hint | A fuzzy purple zone (same 100–200 m default as Dato Seri's, **Claude's call, not yet explicitly confirmed for this card**), fixed around the stash, visible to everyone from the start of the chase phase. | The same fixed zone around Bomoh's spot — still stationary, unlike Dato Seri's wandering quest-giver. |
| Getting it | **The first chaser to scan the card** gets it, reusing the station scan and its within-30 m check. The card stops working after. Runners can see the hint too, and can walk over and try to scan it, but the app refuses them (`Not for your side`) — they can still loiter and guard the spot, same as chasers can for Dato Seri's stash. | The chaser finds Bomoh, who performs a **coconut-smashing ritual** for them and grants it on their own device — a staffed, human-verified hand-off, the same ceremony family as Dato Seri's quest-giver mode. |
| Proof | None needed: the app knows who scanned it. | Whatever physical token the ritual leaves behind (**left to the builder** — Dato Seri uses a coin; the obvious choice here is a piece of the smashed coconut shell, but that's messier to carry than a coin, so worth a cheaper prop instead). |
| Extra people | None — fits the crew of two. | One dedicated person, playing Bomoh, stationed for the whole event, on top of the base crew. |

- **Why the stash is the default:** same reasoning as Dato Seri §4b — a volunteer is one more thing the organiser has to arrange for every event, and the stash needs only a printed card.
- **What stays the same in both modes:** one per game, chasers only, takes the one slot, immune to Toyol, the legendary look (§2b), and the 1-minute/until-end effect duration.
- **This resolves the staffing blocker.** The old plan assumed a dedicated ritual performer was mandatory, which didn't fit the crew of two (rules doc §5). It's now optional, exactly like Dato Seri's quest-giver mode.

## 2b. How it looks: Bomoh, in purple (owner's decision, 2026-10-31)

- **Bomoh is a legendary card like Dato Seri, but purple, not yellow** — the two need to read as different legendaries at a glance, not share a "legendary tier" colour. Gradient face `#F0E0FF` → `#C9A4FF` → `#9B5DE5`, dark plum text `#2B0B45`, same structure as Dato Seri's card otherwise: iridescent foil, glow, the slot-claim pop-and-spin (jail design §4a; power-ups design §5c).
- **This solves the "two identical `?` zones" problem** a Full-mode game with both legendaries would otherwise have raised: Dato Seri's hint zone stays yellow, Bomoh's is purple, so a player can tell at a glance which one they're looking at even though both stay nameless (§2c).
- **Card art: a doodle sticker, same technique as the rest of the deck** (hand-drawn wobble, flat real-life colours, white sticker edge — power-ups design §5c, `13-card-art.html`'s `ART` object and filters). Bomoh is drawn as a seated, robed elder in a simple cloth head-tie (not the formal songkok `dato`'s card already uses, to keep the two human-figure legendaries visually distinct), cradling a split coconut with both hands, a small sparkle beside the head. Colours stay in the same "real-life" palette as the rest of the cast (skin tone, brown cloth, cream coconut flesh) — the card *frame* is purple, the character art isn't.
  - **Deliberate choice, worth stating plainly:** Bomoh is drawn holding the ritual object (the coconut) rather than leaning into any stereotyped gesture or expression, and keeps the same calm, dignified, "cheeky uncle not crude" treatment the deck's other human figure (`dato`, on Dato Seri's card) already gets. This isn't a new standard — it's the one already in use, applied here on purpose given Bomoh is a role real people still practice, not pure invented folklore like Toyol.
- **Mockups:**
  - `docs/superpowers/mockups/2026-10-31-chaser-legendary/1-stash-card.html` — the map hint zone, a chaser's scan-and-claim, a runner's refused attempt. Updated 2026-10-31 from a `???` placeholder to the real name, purple, and the doodle sticker.
  - `docs/superpowers/mockups/2026-10-31-chaser-legendary/2-bomoh-card-art.html` — the doodle sticker at full card size and at slot size, same gallery format as `13-card-art.html`. That gallery file itself should get Bomoh folded in during the next full motion-design pass, rather than being duplicated here.
- **Kept secret, same as Dato Seri (§2c below):** the hint zone carries no name, and the feed line stays generic regardless of which legendary it was.

## 2c. Kept secret, same as Dato Seri

Players are never told Bomoh exists, the same way Dato Seri is kept secret (jail design §4c, rules doc §9b): the hint zone is an unlabelled purple `?`, and the feed says `Something legendary was found.` without naming which one. The ritual mode's own moment (finding Bomoh in person) is naturally still a surprise either way.

## 3. Still open

Small and non-blocking, left for the next pass:
- The exact fuzzy-hint radius for this card specifically (currently reusing Dato Seri's 100–200 m default, unconfirmed).
- The physical token for the optional ritual mode (a coin works for Dato Seri; a smashed coconut shell doesn't travel as cleanly — needs a cheaper substitute, left to the builder).
- Exact copy for the grant moment and the card's effect line, in the same plain-English-plus-flavour style as the rest of the deck.
- Whether Bomoh's doodle gets folded into the main `13-card-art.html` gallery now or in a later motion-design pass (§2b).

## 4. Related, already locked in and shipped elsewhere

- Pak Guard/Focus's reveal radius is 75 m, not 150 m (`app/shared/views.ts`, `FOCUS_M`) — done specifically to keep it clearly weaker than this power-up.
- Dato Seri's own stash-vs-quest-giver split and crew-of-two staffing (jail design §4b, rules doc §5), which this doc's §2a copies directly.
- Legendary yellow is Dato Seri's alone; Bomoh's purple is its own separate brand exception, not a shared "legendary tier" colour (power-ups design §5c).
