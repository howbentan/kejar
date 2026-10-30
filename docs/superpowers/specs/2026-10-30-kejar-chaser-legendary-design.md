# Kejar: a legendary power-up for chasers (name TBD)

**Status:** Brainstorm in progress, **not finished and not approved**. The character (§3) is deliberately on hold pending the owner's own real-world cultural sanity check. This file exists so the brainstorm can continue from another device — it is notes, not a finished design doc, and nothing here should be built yet.
**Builds on:**
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: Pak Guard's reveal radius (already shipped at 75 m, was 150 m) was dropped specifically to keep it clearly weaker than this power-up.
- `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md`: this is conceived as the chaser-side mirror to Dato Seri (the runner legendary) — same scarcity rules, reuses its fuzzy-hint technique, and the two share a staffing budget (§2).

## 1. Why

Dato Seri gives runners a rare, ceremony-gated escape. The owner wants a chaser-side legendary of equal weight, "well incorporated into Malaysian culture," so the drama isn't one-sided.

## 2. Decided so far

- **Side:** chaser.
- **Rarity and hand cost, matching Dato Seri (owner's decision, 2026-10-30):** exactly one exists per game, and claiming it fills all 3 hand slots at once, same as Dato Seri.
- **Location: stationary and hidden,** not wandering like Dato Seri's quest-giver — a deliberate mechanical difference between the two legendaries.
- **Discovery: hybrid.** The app gives a broad fuzzy hint (reusing Dato Seri's hint tech) to narrow the search area; the actual spot is physically/atmospherically decorated for the payoff once found, rather than a full physical clue trail or a pure app-only reveal.
- **Grant: staffed, human-verified, same ceremony family as Dato Seri.** A person in character performs a ritual (a coconut-smashing ritual, if the character ends up being Bomoh) for the chaser who finds them, then grants the power-up in person — not an app-decided grant.
- **Effect: a continuously-updating live reveal of every free runner's exact position** (not a one-shot snapshot like Pak Guard) — different from Pak Guard on scope, locality, and live-vs-snapshot, all three.
- **Duration (owner's proposal, Claude agrees):** 1 minute if triggered with more than 5 minutes left in the game; extends to **last until the game ends** if triggered inside the final 5 minutes. The 5-minute threshold is a flat constant regardless of total game length, matching how every other number in this design works (`FOCUS_M`, the fuzzy-hint radius, etc.) — not yet explicitly confirmed by the owner, flag this when picking the brainstorm back up.
- **Staffing (locked together with the Dato Seri doc):** one dedicated person stationed at the hidden spot for the whole event (the "ritual performer"), separate from Dato Seri's wandering quest-giver. This only keeps total event staffing at 5 (organiser + 1 general marshal + jail-duty/Pak Pulis combined + quest-giver + ritual performer) because jail-duty and Pak Pulis are the same person — see the Dato Seri doc §7.
- **Tentative, not yet confirmed:** by the same logic that protects Dato Seri from Ah Long's steal pool (a single random dice roll shouldn't delete the only copy of something this rare), this power-up should probably also be immune to **Toyol**'s steal pool (Toyol is the mirror tool — it steals from chasers). Flagged as Claude's call, pending confirmation.

## 3. Still open

- **The character — the main blocker.** Candidates discussed:
  - **Bomoh** (traditional Malay shaman): fits the coconut-ritual mechanic perfectly, but is a role some people still genuinely practice/believe in today, not pure folklore — real cultural-sensitivity risk, flagged honestly rather than reassured away.
  - **Pontianak** (iconic Malay/Indonesian vampiric-ghost folklore figure): pure folklore, nobody "practices" being one, so safer on that specific axis — but her origin (death in childbirth) is a much darker root than, say, Toyol's mischievous-imp framing, and pop culture often sexualizes her portrayal, which risks the sibling doc's own "no sexual content" anti-goal. Already listed once in the sibling doc's own non-goals as "discussed but not picked," worth knowing before re-raising it.
  - **Hantu Rimba** (a forest spirit): pure folklore, lower risk, proposed as a backup.
  - **Cikgu Jejak** (a fully secular legendary tracker/mentor): zero spiritual content at all, proposed as the safest backup.
  - The owner wants to sanity-check this with actual Malaysian people before deciding. Both Bomoh and Pontianak stay on the table until then.
- **If the character ends up being Pontianak** (or another non-human-practitioner figure), the "a person in character performs a ritual for you" framing built around Bomoh may not map directly — a monster figure granting a boon isn't quite the same narrative shape as a human ritual-performer granting one. Not resolved.
- Exact fuzzy-hint radius/refresh numbers for this power-up's discovery hint. Dato Seri's doc gives Claude-call defaults of 100–200 m fuzziness, refreshed about as often as a ping — likely reusable here, but not explicitly confirmed for this power-up specifically.
- The name of the grant moment/ritual action itself, and of the power-up overall once the character is settled.

## 4. Related, already locked in and shipped elsewhere

- Pak Guard/Focus's reveal radius is 75 m, not 150 m (`app/shared/views.ts`, `FOCUS_M`) — done specifically to keep it clearly weaker than this power-up.
- Jail-duty (dare wheel confirmation) and Pak Pulis (Dato Seri's Settle confirmation) are the same person, which is what keeps the staffing math in §2 at 5.
