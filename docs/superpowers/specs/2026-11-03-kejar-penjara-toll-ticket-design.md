# Kejar: the Penjara toll/parking ticket

> **Current rules:** `docs/superpowers/specs/2026-10-30-kejar-rules.md` is the single source of truth for the game as a whole. Where this doc disagrees with it, the rules doc wins.

**Status:** Built, 2026-11-04. Locked in after an extended mockup-exploration pass (carnival ticket, booking slip, system receipt, jail-bars motion, organic-tear edge, queue-number ticket, toll/parking ticket — all built and clicked through as static HTML before converging) and one builder-check round (§6a, §7.1, and the "jailed for good" case in §5 all resolved from its findings). §6a's full cross-player version shipped too, including a real bug the GameScreen tests caught (an effect-driven state update left one real render where Jail unmounted, before `showingFreed` caught up) — fixed by moving it to render-phase state instead. 876/876 tests passing.
**Builds on:**
- `app/src/screens/Jail.tsx` — `Caught` and `AutoJailed`, the two screens this replaces the body of.
- `app/src/game/PenjaraArrival.tsx` / `Bars.tsx` / `Stamp.tsx` — the existing "dikejar!" catch motion, kept as-is (see §5, non-goal).
- `app/src/game/SettlePanel.tsx` / `WalkGuide.tsx` / `Map.tsx` — Settle's scan flow and the live walk-to-Penjara map, both kept, extended with one new visual (§6).
- `app/shared/ids.js` — no existing player-facing ticket-number concept; §7 proposes one.

## 1. Why

Across the whole "Malaysian touches" pass, the Penjara moment (getting caught, or auto-jailed, and the Settle release) was the one screen that stayed in a generic Western idiom — a plain headline and body copy — while Saman, Jom Mamak and the awards screen all carry specific local references. Mockups explored several directions (see Status); the toll/parking entry ticket won because it's the only one where the *visual metaphor matches the actual mechanic*, not just the skin: a real toll ticket is issued on entry and has to be physically carried to an exit gate to be cleared — which is exactly what already happens today (`WalkGuide.tsx` walks the caught runner to `arena.jail`, and clearing it is a real, separate action: Settle).

## 2. Goals

1. **Replace the plain headline/body copy in `Caught` and `AutoJailed`** (`Jail.tsx` lines 116–149, 40–87) with a toll/parking entry-ticket visual, reusing the same information those screens already compute (`caughtBy`, `me.caught_at`, distance from `WalkGuide`, `jailCheckins`).
2. **Give Settle a real visual payoff.** Today `SettlePanel.tsx` line 117 shows only `<p role="status">{message}</p>` on success — no motion, no moment. Add a stamp slam reusing `Stamp.tsx`'s existing mechanics (scale 3→1, −8°, `SLAM_EASE`, 0.35s), with ticket-appropriate copy (§6) instead of inventing a new animation system.
3. **English-first, Malay as a wink, not a requirement.** Every field a player needs to *understand their own status* reads in plain English; a smaller italic line underneath carries the Malay a local player will recognise. Decided explicitly after the owner flagged that the first all-Malay pass (queue-ticket mockup) would exclude non-Malay-speaking players — see §7's exact copy for the line-by-line split.
4. **One shared visual language for both ways into Penjara.** `Caught` and `AutoJailed` get the same ticket chrome (same card shape, same barcode, same "LEPAS" stamp), differing only in the fields that are actually different (who/how vs. when you were last seen) — mirroring how `Jail.tsx` already shares `Settle` and `WalkThenWatch` between both today.

## 3. Non-goals

- **No change to the catch/auto-jail trigger logic, Settle's server-side rules, or the geofencing in `WalkGuide.tsx`.** Purely a presentational layer over screens and data that already exist.
- **No change to `PenjaraArrival`/`Bars`/`Stamp`'s existing "dikejar!" moment.** That's the catch *impact* (shockwave, sparkles, shake) and stays exactly as built; the ticket is what the player sees *after* that moment resolves, replacing the plain headline underneath it.
- **Not replacing Saman.** Saman is a different object (a notice of violation, not a ticket you clear) and was already confirmed English-first and left alone earlier in this pass.
- **Not a second map or a new geofence UI.** `WalkThenWatch` (`Jail.tsx` §93–113) keeps doing exactly what it does today; the ticket sits above it, not instead of it.

## 4. Anti-goal

It would be a failure if a player who doesn't read Malay couldn't tell what their own ticket says. Every status a player needs to act on (what happened, what to do next) must be fully legible in the English line alone — the Malay echo is flavour, never the only copy carrying meaning.

## 5. The ticket itself

Static reference mockups, built and clicked through in this session, are the spec for this section — read them before implementing, don't re-derive the layout from this prose:
- Catch: `penjara-toll.html` (in the session's mockup scratchpad, not in the repo — ask the owner for the file, or treat the description below as complete enough to rebuild).
- Auto-jail: `pingticket-toll.html`.

**Card:** a short, wide, white paper card (not the full-bleed vertical card earlier mockups used), rounded 4px corners, sitting directly on the phone's black background — no outer phone chrome needed beyond what `Screen` already provides. A 16px-wide diagonal-hatch strip down the left edge (`repeating-linear-gradient(135deg, black 0 2px, transparent 2px 6px)` at 18% opacity) stands in for the perforated edge where the ticket tore off a dispenser roll.

**Header row:** `kejar. plaza tol` (brand, bold) with `TIKET MASUK` / *entry ticket* underneath (Malay primary + English echo — the one place Malay leads, because it's the venue signage, not a status the player must act on) on the left; `GERBANG` / **PENJARA** (gate: Penjara) right-aligned.

**The number:** the player's own ticket number, large (34px, 900 weight) — see §7 for where this number comes from.

**Fields**, English label + bold value, Malay echo only on the one field whose value changes (STATUS):

| Catch (`Caught`) | Auto-jail (`AutoJailed`) |
|---|---|
| MASUK (entry time) → `caught_at` | LAST SEEN → last successful check-in |
| JARAK KE GERBANG (distance to gate) → live from `WalkGuide` | DISTANCE TO GATE → same |
| STATUS: **BELUM BAYAR** / *unpaid — walk to the gate* | STATUS: **SESSION TIMED OUT** / *tempoh tamat — jalan ke gerbang* |

(The catch variant's field labels are Malay-led because they're describing the toll-plaza fiction itself, not the player's own status — only STATUS, the thing the player must read and act on, carries the bilingual split both ways.)

**Distance field sourcing (Claude's call, resolved after builder-check):** `WalkGuide.tsx` computes `metres` internally and renders its own `<p className="walk-distance">` — it isn't passed up today. Since §7.2 places the ticket *above* `WalkThenWatch`/`WalkGuide` rather than wrapping it, give `WalkGuide` an optional `onDistance?: (m: number | null) => void` prop that fires whenever `metres` changes, and have `Caught`/`AutoJailed` hold that value in state to feed the ticket's DISTANCE field. This is an interface addition, not a change to `WalkGuide`'s geofencing or its own rendering (§3's non-goal is about behaviour, not about the component staying untouched). Before a fix (`metres === null`) or on `lost`, the ticket field shows `—` rather than attempting to fit `WalkGuide`'s prose ("Finding you…") into a single bold value slot.

**The "jailed for good" case (`freed_once === true`, caught again) — Claude's call, resolved after builder-check:** `Jail.tsx` already branches this today (`Caught` lines 140–142, `AutoJailed`'s `outForGood`) — the player stays in Penjara to the round's end and gets the spectator map, not `WalkThenWatch`. For this player, neither existing STATUS value is true (walking changes nothing for them; `settle.canFreeSelf` is false), and they can never reach FREE. Add a third terminal STATUS, shown instead of BELUM BAYAR/SESSION TIMED OUT whenever `me.freed_once` is true: **HABIS · TIADA KELUARAN** / *no further exit this round*. No stamp, no FREE transition — this ticket never animates to LEPAS, matching that `outForGood` already skips `WalkThenWatch` entirely.

**Footer line:** `*** SIMPAN TIKET INI UNTUK KELUAR ***` / *keep this ticket to exit* (catch) or the existing `AutoJailed` marshal line, reused verbatim: `*** PHONE PROBLEM? ASK A MARSHAL ***` (auto-jail already has this exact affordance at `Jail.tsx` line 81–83 — the ticket surfaces it, doesn't duplicate new copy for it).

**Barcode:** a real 1D-barcode look — bars of **uniform height, varying only in width**, spaced with `justify-content:space-between` so they span the ticket's full printable width edge-to-edge. (An earlier draft varied bar *height* instead, which reads as an audio equaliser, not a barcode — flagged and fixed in this session; do not reintroduce the height-varying version.)

## 6. The Settle payoff: "LEPAS"

On a successful Settle (`SettlePanel.tsx`'s `r.ok` branch, currently line 70–71), show a stamp over the ticket reading **LEPAS** — the word a real Malaysian toll gate actually displays once you've paid and the barrier lifts. Visually: `Stamp.tsx`'s exact mechanics (scale 3→1, rotate −8°, 0.35s `SLAM_EASE`) but on a double border (`border: 4px double`) in the existing `--ink` red (`#B6291E`), `mix-blend-mode: multiply` so it reads as pressed ink on the white card rather than a flat sticker — distinct from the lime/volt plate style `Stamp.tsx` uses elsewhere, because this is marking a *document* (the ticket), not slamming over the full-bleed catch moment the way `dikejar!` does. STATUS flips to **FREE** / *bebas* at the same moment.

Both the catch and auto-jail tickets use the identical stamp and status flip — Settle doesn't distinguish why you were jailed, only that you now aren't.

### 6a. The LEPAS moment's reach — decided with the owner, 2026-11-04

Builder-check surfaced a real gap §6 didn't resolve: **`GameScreen.tsx:54` swaps away from `<Jail>` the instant `view.me.jailed` flips to `false`**, and `useGameState.ts` polls every 3s — so on the very next poll after a successful Settle, the Jail screen (and the LEPAS stamp on it) can be torn down before the player's seen it. This is exactly the race `shouldPlay()` / `PenjaraArrival`'s `onDone` already solves for *entering* Penjara (`moments.ts`, `Jail.tsx`), but nothing equivalent existed for *leaving*. Separately, Settle can free up to 2 **other** jailed players (`targetIds`/`freedIds`, `SettlePanel.tsx`) who never call `onScan` themselves — a purely local, scan-triggered animation would give them nothing; their `jailed` only flips on their own next poll. `Player.freed_at` already exists (`shared/types.ts`) and is exposed on `view.me` but is unused by any screen today.

**Decision: option B, the full version.** A server-driven moment window off `freed_at`, mirroring the existing entry-side `shouldPlay` pattern exactly — holding the Jail screen (or a brief transitional screen) open long enough for every freed player to see the LEPAS stamp, regardless of who triggered the scan or how the 3s poll lands relative to it. This covers the holder who scans *and* the up-to-2 others Settle frees alongside them, matching the effort already spent on the entry-side moment rather than leaving the exit side thinner. Concretely: add a `'freed'` moment kind alongside the existing `'caught'` / `'auto'` ones in `moments.ts`, gated on `freed_at` the same way those are gated on `caught_at`; the screen that currently unmounts on `jailed === false` needs to check this moment window before swapping away.

## 7. Open questions — left to the builder

1. **Where does the printed ticket number come from? — decided with the owner, 2026-11-04.** Not tag-ID-derived after all: the real scan/verification path already runs entirely through `tagQr`'s `KEJAR:TAG:NN` format (`ids.js`), untouched by this doc, so the printed ticket number carries no functional weight and is free to be a wink instead of an ID. **Decision: an easter-egg number**, picked from a small curated pool of numbers that mean something to a Malaysian player on sight — the owner's own examples: `19570831` (Merdeka Day, 31 Aug 1957) and `67676767` (meme repeat). Selection should reuse the exact pattern `Jail.tsx` already uses for `CAUGHT_LINES` — `pick(list, id)`, a deterministic hash of the player's id into a list index (`Jail.tsx` lines 90–91) — so the same player sees the same number consistently rather than it reshuffling on every render, with no new selection mechanism to build. The pool itself (which numbers go in it, how many) is content, not architecture — pick it when building, pattern-matched against the two examples above; `19630916` (Malaysia Day) is an obvious third candidate in the same spirit.
   **Noted for later, explicitly out of scope here:** the owner's idea that a legendary power-up (Dato Seri, Bomoh) could someday be unlocked by typing in a code — interesting, but a real mechanic with its own server-side validation, UI, and balance questions, not a numbering detail. Flagging so it isn't lost, not building it now.
2. **Exact placement inside `Caught`/`AutoJailed`.** The recommendation is: the ticket replaces lines 126–138 (`Caught`'s `h1`/`p.muted` block) and lines 52–65 (`AutoJailed`'s equivalent), sitting between `PenjaraArrival`'s moment and `Settle`/`WalkThenWatch`, unchanged. This needs a pass by whoever implements it to confirm it doesn't fight the existing `Screen`/`jail-title` CSS.
3. **Responsive sizing.** Mockups were built at a fixed 300px-ish ticket width inside a 390px phone frame; needs checking against Kejar's real supported viewport range (320px and up, per `CLAUDE.md`/prior fixes in git history) before implementation, not assumed.
4. **Fonts/colour tokens.** Mockups use Geist / Geist Mono and the existing `--volt` / `--black` / `--white` tokens in `src/styles/tokens.css`. `--ink` (`#B6291E`, the stamp red) is **not** defined there yet — checked directly, it needs adding as part of this work, not assumed present.
