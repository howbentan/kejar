# Kejar: Bomoh, the legendary power-up for chasers

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole (Core and Full modes, 2026-10-30). Where this doc disagrees with it, the rules doc wins; its §9 lists what changed.

**Status:** Design agreed with the owner in chat, 2026-10-28 through 2026-10-31, then the effect mechanism resolved against the real (now-built) codebase, 2026-11-10 (§2d). **The character is settled: Bomoh** (owner's decision, 2026-10-31), after the owner's own real-world cultural check. The grant mechanism mirrors Dato Seri's hidden-stash default, so it fits the crew of two (§2a), and the card gets its own colour, purple, rather than sharing Dato Seri's yellow (§2b) — doodle card art mocked up in `docs/superpowers/mockups/2026-10-31-chaser-legendary/`. Not yet builder-checked, not built.
**Builds on:**
- `docs/superpowers/specs/2026-10-28-kejar-malaysian-powerups-design.md`: Pak Guard's reveal radius (75 m, not 150 m) was dropped specifically to keep it clearly weaker than this power-up. §5c now also covers Bomoh's purple as its own brand exception alongside Dato Seri's yellow.
- `docs/superpowers/specs/2026-10-28-kejar-jail-dato-seri-design.md` §4b: this doc's stash-vs-staffed split is copied directly from there, same reasoning.

## 1. Why

Dato Seri gives runners a rare, ceremony-gated escape. The owner wants a chaser-side legendary of equal weight, "well incorporated into Malaysian culture," so the drama isn't one-sided.

## 2. Decided so far

- **Side:** chaser.
- **Rarity and slot cost, matching Dato Seri:** exactly one exists per game, and claiming it takes the chaser's one power-up slot. **Full mode only** (rules doc §3).
- **Location: stationary and hidden,** not wandering like Dato Seri's quest-giver mode — a deliberate mechanical difference between the two legendaries, kept in both grant modes below.
- **Effect: every free runner shows exact, not fuzzy, with no radius limit** (Pak Guard's mechanism, with the 75 m cap removed) — see §2d for what "live" actually means once checked against how runner positions really reach a chaser.
- **Duration: the next 2 ping reveals after activation, not a timer** — see §2d for why.
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
- **What stays the same in both modes:** one per game, chasers only, takes the one slot, immune to Toyol, the legendary look (§2b), and the effect itself (§2d).
- **This resolves the staffing blocker.** The old plan assumed a dedicated ritual performer was mandatory, which didn't fit the crew of two (rules doc §5). It's now optional, exactly like Dato Seri's quest-giver mode.

## 2b. How it looks: Bomoh, in purple (owner's decision, 2026-10-31)

- **Bomoh is a legendary card like Dato Seri, but purple, not yellow** — the two need to read as different legendaries at a glance, not share a "legendary tier" colour. Gradient face `#F0E0FF` → `#C9A4FF` → `#9B5DE5`, dark plum text `#2B0B45`, same structure as Dato Seri's card otherwise: iridescent foil, glow, the slot-claim pop-and-spin (jail design §4a; power-ups design §5c).
- **This solves the "two identical `?` zones" problem** a Full-mode game with both legendaries would otherwise have raised: Dato Seri's hint zone stays yellow, Bomoh's is purple, so a player can tell at a glance which one they're looking at even though both stay nameless (§2c).
- **Card art: a doodle sticker, same technique as the rest of the deck** (hand-drawn wobble, flat real-life colours, white sticker edge — power-ups design §5c, `13-card-art.html`'s `ART` object and filters). Bomoh is drawn as a seated, robed elder in a simple cloth head-tie (not the formal songkok `dato`'s card already uses, to keep the two human-figure legendaries visually distinct), cradling a split coconut with both hands, a small sparkle beside the head. Colours stay in the same "real-life" palette as the rest of the cast (skin tone, brown cloth, cream coconut flesh) — the card *frame* is purple, the character art isn't.
  - **Deliberate choice, worth stating plainly:** Bomoh is drawn holding the ritual object (the coconut) rather than leaning into any stereotyped gesture or expression, and keeps the same calm, dignified, "cheeky uncle not crude" treatment the deck's other human figure (`dato`, on Dato Seri's card) already gets. This isn't a new standard — it's the one already in use, applied here on purpose given Bomoh is a role real people still practice, not pure invented folklore like Toyol.
- **Mockups:**
  - `docs/superpowers/mockups/2026-10-31-chaser-legendary/1-stash-card.html` — the map hint zone, a chaser's scan-and-claim, a runner's refused attempt. Updated 2026-10-31 from a `???` placeholder to the real name, purple, and the doodle sticker.
  - `docs/superpowers/mockups/2026-10-31-chaser-legendary/2-bomoh-card-art.html` — the doodle sticker at full card size and at slot size, same gallery format as `13-card-art.html`. That gallery file itself should get Bomoh folded in during the next full motion-design pass, rather than being duplicated here.
  - `docs/superpowers/mockups/2026-10-31-chaser-legendary/3-bomoh-reveal-effect.html` (added 2026-11-10, §2d) — the reveal itself in use: activation, the "waiting for the next ping" slot state, the exact-dot reveal with the purple ring, the ageing stale dots between the two reveals, and expiry — shown on two phones side by side (the chaser who activated it, and a teammate who didn't) to make the whole-team sharing visible, not just asserted in prose.
- **Kept secret, same as Dato Seri (§2c below):** the hint zone carries no name, and the feed line stays generic regardless of which legendary it was.

## 2c. Kept secret, same as Dato Seri

Players are never told Bomoh exists, the same way Dato Seri is kept secret (jail design §4c, rules doc §9b): the hint zone is an unlabelled purple `?`, and the feed says `Something legendary was found.` without naming which one. The ritual mode's own moment (finding Bomoh in person) is naturally still a surprise either way.

## 2d. The reveal effect, resolved against the real codebase (2026-11-10)

This design was written before Dato Seri existed in code. Checking "a continuously-updating live reveal" against what's actually built changed it:

- **There's no continuous tracking to extend, anywhere in this game, on purpose.** Runner phones stay pocketed between pings (core design), and `views.ts` only computes any player's dots once, at each ping reveal. A literal continuous feed would be new, more invasive tracking infrastructure this game has deliberately avoided everywhere else — not something to add for one card.
- **What already exists and maps onto this almost exactly: Focus/Pak Guard.** `views.ts`'s `focused = focusers.some(f => distanceM(f, at) <= FOCUS_M)` already makes a runner show exact instead of fuzzy, at the next ping reveal, for whoever's holding an active Focus. Bomoh reuses this precisely, just with the `FOCUS_M` radius check dropped (every free runner qualifies, not only ones near the user) and its own, longer active window.
- **Already whole-chaser-team, for free.** `focusers` in `views.ts` isn't filtered to the viewing player — any chaser near an active Focus already shows every other chaser an exact dot too, not just the one who used it. Bomoh inherits this automatically. This is the right weight to match Dato Seri: Dato Seri doesn't just help its holder, it changes the whole runner team's win condition; Bomoh revealing to the whole chaser team at once is the equivalent swing the other way, and it costs nothing extra to build.
- **Duration is a ping count, not a timer, because a timer can silently do nothing.** The original "1 minute" proposal could span zero ping reveals if `pingMin` is 5 and the timing doesn't line up — Bomoh could be triggered and reveal nobody. **Decided: active through the next 2 ping reveals after activation**, however long that actually takes (as little as just over one `pingMin`, as much as two, depending when in the cycle it's triggered). This guarantees real value every time, never zero.
- **Between those 2 reveals, the exact dots stay up, aging, instead of reverting to fuzzy.** A client-side rendering choice only (grey out a revealed runner's dot and show "N min ago" until the next reveal replaces it) — no new data, no new tracking, just not discarding information the chaser team already legitimately received. This is what makes the window *feel* like one hunt instead of two disconnected flashes.
- **No changes needed to catching itself.** The worry was that a catch attempted after chasing down a reveal might get rejected as "too far" on a technicality. Checked `shared/catch.ts`: a catch can only be rejected as too-far when the runner's own position is **fresh** (`RUNNER_TRUSTED_MS`, 20s) and shows real distance — stale position data (which is exactly what a runner's last check-in will be, a ping cycle after the reveal) can't reject a catch at all; it just flags the catch for the existing post-catch dispute flow. By the time a chaser could plausibly act on a Bomoh reveal, the data's already past that 20-second window, so the rejection path was never actually reachable in this scenario. Nothing in `catch.ts` needs touching.
- **The grant mechanism (§2a) should mirror Dato Seri's schema exactly, as a parallel column, not a shared/generic one.** `games.dato_stash` (jsonb) and `claim_dato()` (`supabase/migrations/0011_full_mode.sql`) are both Dato-specific, not generalised, matching this codebase's existing style of parallel-not-merged columns (`runner_sets`/`chaser_sets`, `runner_draws`/`chaser_draws`). The plan should add `games.bomoh_stash` (same shape as `DatoStash`) and a `claim_bomoh()` function that's `claim_dato()` with `kind = 'bomoh'`. **`secret_cards` (migration `0014_setup.sql`) needs no changes at all** — it was already built generic (`legendary in ('dato', 'bomoh')`), ahead of this design actually landing.

## 2e. Activation is instant on claim — no hand card, correcting §2d's bullet 5 (resolved 2026-11-10)

Grounding the grant mechanism against the actual claim/activation code (`app/api/_lib/actions.ts`'s `claimDato`, `app/shared/powerups.ts`'s `judgeDatoClaim`, `usePowerup`'s explicit `if (u.kind === 'dato') return { ok: false, reason: 'settle-at-penjara' }`, and `PowerUpHand.tsx`'s non-interactive, non-clickable rendering of the Dato card) surfaced a real correction to §2d's last bullet:

- **Dato Seri is not "instant either" — it's claimed into the hand as a permanent, un-timed `powerups` row, then activated later through a separate, bespoke action (`settle`, gated on standing at Penjara).** It needs a hand card because its effect (freeing jailed teammates) has to happen at a specific place, possibly long after the find.
- **Bomoh has no such place-gated second step. Its effect is "reveal," full stop** — there's nothing to do with a Bomoh card except have found it. The lobby settings copy already shipped for it (`src/screens/HostNew.tsx`, the disabled "coming soon" toggle) reads *"The first chaser to find it sees every free runner live..."* — written as something that happens the moment it's found, not something a chaser carries around and triggers later.
- **Decided: `claimBomoh` activates on the spot. No `powerups` row, no hand card, no `usePowerup`/Settle-style second action.** `games.bomoh_stash` (mirroring `dato_stash`'s shape) gets its `claimedBy`/`claimedAt` stamped atomically by `claim_bomoh()`, exactly like `claim_dato()`'s locking and re-check logic — it just skips the `insert into powerups` that `claim_dato()` does. `claimedAt` alone is enough to compute "the next 2 ping reveals" in `views.ts` (count revealed pings with `reveal_at > claimedAt`, same comparison idiom already used by `landingAt`'s `usedAt`/`revealAt` window) — no separate counter or timer column needed.
- This also means Bomoh never touches `PowerUpKind`, `slotBusy`, `PowerUpHand.tsx`, `PowerCard.tsx`, or `powerInfo.ts` — none of the hand-card machinery applies. The "card" the organiser prints and hides, and the physical find itself, are real; what's not real is a card sitting in the finder's in-app hand afterward.
- Supersedes the "`claim_dato()` with `kind = 'bomoh'`" phrasing at the end of §2d's bullet 5 — the column and locking logic are still mirrored exactly; the `powerups` insert is not.

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
