# Kejar map look: Ink, our own fonts and map file, 3D buildings, floating markers

**Date:** 2026-11-23
**Status:** design, approved in conversation from the mockup; not built
**Mockup:** `docs/superpowers/mockups/2026-11-23-map-looks/index.html` (launch config `map-looks-mockups`, port 5183). It is
the reference for every look below. The palettes of the three looks not chosen (Now, Blueprint, Volt shade) stay in the
file for reference only.

## 1. Why

- The game map is the screen players stare at all game. Today it is a generic dark-green map with blue water
  (`app/src/game/mapStyle.ts`), outside the brand's colours, with OpenFreeMap's font and a long credit line.
- The owner wants the map to look like kejar.: brand colours only, the owner's own hand-drawn typography, and room for
  game pieces to stand out.
- The owner also wants the map to stop depending on outside map services during a game, as a safety measure. Nothing
  has failed yet and no test run has been played; this is done before launch on purpose.
- 3D buildings and floating markers make the map feel like a game board, not a navigation app.

## 2. Goals

1. **The Ink look** on every map in the app: black, white and greys only. Lime stays reserved for game pieces.
2. **Map names in Kejar Hand**, lowercase, from font files we host ourselves.
3. **A slim map credit**: a tiny, dim line in the corner, as small as the map data's licence allows.
4. **Flat and 3D views**, switched with one round button on the map.
5. **The logo's j as player markers** in both views; in 3D they float above their spot.
6. **Power-up stations as volt diamonds**: flat diamond in 2D, floating gem in 3D, red while claimed, and in 3D the gem
   lands with a countdown.
7. **Tupperware on the organiser's map** in the station design, gold for Dikejar and purple for Kejar.
8. **Arena setup uses the same look**, including 3D buildings and the textured map, so organisers plan the arena on the
   map players will see.
9. **Our own map file** (phase 2): the map's data served from our storage, not from OpenFreeMap, during a game.

## 3. Non-goals and anti-goals

**Non-goals**
- Google Maps in any form, including scraping or replaying its private requests (owner asked; it breaks Google's terms
  and is less stable, not more).
- Removing the map credit entirely. OpenStreetMap's licence requires credit wherever its data is shown, whoever hosts
  it. The goal is the smallest legitimate credit, not none.
- Changing any game rule: claim distance, the 60 s station lock, who may claim, ping timing, who sees the Tupperware.
- The organiser's park lookups (Nominatim and Overpass). They run only during setup and already handle failures.

**Anti-goals** (failure even if it technically works)
- A player can't see a j or a station because a building hides it.
- The map competes with the game: bright map colours, lime anywhere on the map itself.
- Labels in handwriting so small or thin they can't be read on the move.
- Breaking OpenStreetMap's, OpenFreeMap's or any other provider's terms.
- The animation drains phones during a 45-minute game.

## 4. Constraints

- **Free tiers only**, as for the whole project. Cloudflare R2's free tier is accepted for phase 2; the owner agreed to
  open a Cloudflare account.
- **MapLibre v5**, as today (v6's separate worker broke production builds; see `docs/HANDOFF.md`).
- **The strict Content Security Policy** in `app/vercel.json` must keep working. Today `connect-src` allows
  `https://tiles.openfreemap.org`; any new origin (the R2 bucket's domain) must be added, and fonts served from our own
  origin need nothing new.
- **Brand rules** (`docs/superpowers/specs/2026-10-19-kejar-design.md` §9): black `#0A0A0B`, white `#F5F5F3`, Volt
  `#C6FF3D`; lime never as text on white. The red, gold and purple in this design are existing tokens in
  `app/src/styles/tokens.css`, used here as map marks, not new brand colours (see §8 and §9).
- **Reduced motion**: the app already has `useReducedMotion()`; every animation here respects it.

## 5. The look (decided)

### 5.1 Ink palette

These are the mockup's values. They replace the layer colours in `mapStyle.ts`.

| Layer (OpenMapTiles name today) | Ink |
|---|---|
| background | `#0A0A0B` |
| landcover | `#121213` |
| park | `#161618` |
| water | `#232428` |
| building (flat) | fill `#1B1B1D`, outline `#26262A` |
| building (3D) | `#2E2E33`, opacity 0.9, vertical gradient on |
| roads (everything that isn't a path or track) | `#2C2C2F`, width 1 px at z14 to 6 px at z18 |
| footpaths (`class` path or track) | `rgba(245,245,243,.32)`, dashed `[2, 1.5]`, width 0.6 px at z14 to 2 px at z18 |
| labels | `rgba(245,245,243,.42)`; park names `rgba(245,245,243,.62)`; halo `#0A0A0B` 1.2 px |

Footpaths are drawn as their own fine dashed lines on purpose: they are a runner's escape routes.

### 5.2 Typography

- Every map label (park, water, street, place names) uses **Kejar Hand**, lowercase, letter spacing 0.
- Kejar Hand has only `a–z` and `0–9`. Anything else (punctuation, accents, `:` in the countdown) falls back to Geist
  inside the same glyph files, so a label never breaks.
- Handwriting needs more size than the old labels: about 5 px larger than today's sizes (park and water names 17 px,
  street names 15 px). The builder tunes this on real phones; readability wins over matching the mockup.
- The source font is `app/mockups/hand/kejar-hand.ttf`, from the owner's typography work in another chat. **This map
  work follows that typography decision**: if Kejar Hand ships with a different file or name, the map uses that.
- The map credit stays in **Geist Mono**, following the owner's rule that tiny labels and map credits stay in Geist.

### 5.3 Our own label fonts

MapLibre can't read a `.ttf`. It needs "glyph" files: signed-distance-field PBFs, one file per 256 characters. The
mockup builds them with a small Python script (Pillow, NumPy, SciPy, fontTools), drawing each character from Kejar Hand
first and Geist second. It wrote `docs/superpowers/mockups/2026-11-23-map-looks/fonts/Kejar Hand Regular/0-255.pbf` and
so on, 256 files.

- The builder turns that script into a repo script (for example `app/scripts/build-glyphs.py`) and commits its output
  under `app/public/fonts/` so the fonts ship with the app, from our own origin.
- The style's `glyphs` becomes our own URL, not `https://tiles.openfreemap.org/fonts/...`.
- Geist Regular and Geist Mono glyph files are built the same way; the slim credit is HTML, not a map label, so it
  doesn't need them, but station numbers or any other map text in Geist would.

## 6. Flat and 3D views

- A **round 44 px button** sits at the bottom right of every game map (above the credit), dark glass like the app's
  other map buttons.
- It shows **what a tap switches to**: a **cube** while flat; while in 3D the button turns white and shows a **flat
  layers** icon.
- **Flat** is the default. **3D** tilts the camera to about 58° and draws every building at its real height
  (`render_height`, base `render_min_height`) as a `fill-extrusion` layer.
- Switching animates the camera (about 1.2 s into 3D, 0.9 s back). Players can still tilt and turn with two fingers.
- **My call:** the choice is remembered per device (`localStorage`, wrapped in try/catch), so a player who likes 3D
  keeps it game to game.

## 7. Player markers

These are the existing images in `app/public/map/`, already used by `Map.tsx`:

| Who | Image | Colour |
|---|---|---|
| Dikejar (runners) | `j-runner.png` | volt |
| Kejar (chasers) | `j-chaser.png` | white |
| A pinged runner (last ping) | `j-ghost.png` | faded volt |
| Marshals | ring, unchanged | white |

- **Flat:** exactly as today: the j stands on its spot.
- **3D:** every j (including pinged runners) **floats** above its spot on a faint **dotted stem**, with a soft dark
  **shadow** on the ground marking the exact spot. The stem's colour matches the j at about half strength.
- They **bob** gently (about 3 px).
- **Markers are always drawn above buildings.** A j can float in front of a tower even when the player is behind it.
  That is deliberate: a player must never lose sight of a dot. The float is a screen-space offset, not real height.

## 8. Power-up stations

- **No numbers on the map** (owner's call).
- **Open, flat:** a **volt diamond**: a plain square turned 45°, thin black edge.
- **Open, 3D:** a faceted **volt gem** (lit faces on top, shaded below, black edge) floating above the spot on a dotted
  stem, with a shadow, bobbing on a slower beat than the j's so the two read differently.
- **Claimed:** during the station's lock (`STATION_LOCK_MS`, 60 s after each claim, `app/shared/powerups.ts`) the
  station is **red** (`--danger`, `#E5484D`, the SOS and cancel red players already know):
  - **Flat:** the diamond turns red.
  - **3D:** the gem **drops to the ground** with a small bounce (about 0.65 s), turns red with a soft red glow on the
    ground, and shows a **small countdown** under it (`m:ss`, Kejar Hand digits, red, 11 px, black halo).
  - When the lock ends the gem turns volt again and **rises** back to its hover (about 0.7 s).
- Everyone who sees stations sees the claimed state: the lock applies to everyone. The once-per-player rule
  ("already claimed by you") is unchanged and isn't shown on the map.
- **The view needs one new field.** Today each player's view carries stations as `{ n, lat, lng }` only
  (`app/shared/views.ts`), with no lock. Add a `lockedUntil` (ISO time or null) per station, worked out on the server
  from the latest `claimed_at` at that station plus `STATION_LOCK_MS`, the same sum `judgeClaim` uses. The countdown
  then matches what the server will accept, and no player's own power-ups list leaks other players' claims.

**Note on red:** the original brand spec says to avoid red (so kejar. isn't confused with the owner's other brand). The
app already uses red for SOS and cancel, and the owner chose red for "claimed". Recorded here so it's a known choice.

## 9. Tupperware (organiser's map only)

- Who sees it doesn't change: only the organiser's map shows where each box was dropped. Players still find boxes only
  by the side quest, with no map hint (`docs/superpowers/specs/2026-11-17-tupperware-legendaries-design.md`).
- Each box uses the **station design** in its side's legendary colour:
  - **Dikejar's box: gold** (Dato Seri's yellow, `--legendary-1/2/3`: `#FFF27A`, `#FFD60A`, `#F5B800`)
  - **Kejar's box: purple** (Bomoh's purple, `--bomoh-1/2/3`: `#F0E0FF`, `#C9A4FF`, `#9B5DE5`)
  - Flat: a diamond in that colour (`#FFD60A` and `#C9A4FF`). 3D: a floating gem in that colour, with stem and shadow.
- This replaces today's red disc, so the organiser's map no longer has two different reds (the Tupperware red and the
  claimed-station red).
- `tokens.css` says the legendary yellow and purple are "never on any other card". These are map marks, not cards, and
  each box leads to its side's legendary, so the colours point the right way. Recorded as a known choice.
- Where boxes appear today: the organiser's walk-the-park guide (where to drop each box) and, after the game, the
  "wasn't opened. Bawa balik!" map for unclaimed boxes (`Results.tsx`). Both use the new diamond. No live map shows a
  claimed box, so no claimed state is needed for boxes.

## 10. Arena setup uses the same map

Owner's call: **planning and setting up an arena uses the 3D and textured map too.**

- The organiser's setup map (`app/src/game/PlaceMap.tsx`, used by `ArenaSetup` and `HostNew`) gets the Ink look, Kejar
  Hand labels, the dashed footpaths and the same flat/3D button.
- Why: organisers see building heights, covered walkways and footpaths while they choose the boundary, no-go and
  walk-only zones, stations, the jail and the start. They plan on the map players will play on.
- Stations they place show as volt diamonds (gems in 3D); the jail and start keep their existing drawn markers.
- **My call:** placing and editing work in both views (MapLibre reads taps correctly on a tilted map). If a drag edit
  (moving a boundary point) proves fiddly when tilted, the builder may drop back to flat while an edit is in progress.
- "Texture" here means the drawn surfaces of the map: the 3D buildings and the dashed footpaths. Patterned fills (for
  example hatching on water) are possible in MapLibre but aren't in the mockup; the builder may propose them later.

## 11. Our own map file and the slim credit

### 11.1 Phase 1: look, fonts, 3D, markers (no new account)

- Everything in §5 to §10, on OpenFreeMap's tiles as today.
- The credit uses the **slim style** (Geist Mono, about 8 px, dim, bottom left, no box), but must still carry what
  OpenFreeMap requires: *"OpenFreeMap © OpenMapTiles Data from OpenStreetMap"* with OpenStreetMap linked. MapLibre's
  built-in attribution control is replaced by our own small element.

### 11.2 Phase 2: our own map file

- Build a **Malaysia** map file as a single **PMTiles** file and serve it from **Cloudflare R2**. MapLibre reads it
  through the `pmtiles` protocol. During a game no outside map service is involved.
- **Data format:** the credit can only shrink to *"© OpenStreetMap"* if the file is built in a format whose terms don't
  require their own credit. OpenMapTiles' format (what `mapStyle.ts` uses today) requires "© OpenMapTiles". Protomaps'
  basemap format is believed to need only the OpenStreetMap credit, **but the builder must confirm the current terms
  before relying on it**. If the format changes, the style's layer names change with it, and §5.1's table is remapped
  to the new names.
- Add the R2 domain to `connect-src` in `app/vercel.json`.
- **My call:** refresh the file by hand every few months with a documented script; parks change slowly.
- Size is expected to be a few hundred MB, which is why it can't live in Vercel or Supabase storage.

## 12. Motion and battery

- Bobbing, the drop and the rise run only in 3D, only while the map is on screen, and never under reduced motion
  (markers then sit still at their hover height).
- The mockup animates by changing a layer's `icon-translate` every frame. In the app, cap it (for example 30 fps) and
  stop it when the page is hidden.

## 13. Left to the builder

- Exact label sizes, stem lengths and bob amounts after trying them on real phones outdoors.
- Whether any other screen refers to stations by number now that the map doesn't show it (claim prompts, printed
  station QR tags), and how those read without a number on the map.
- How the floating markers handle crowding (many players close together).
- The order of work. Suggested: Ink style and fonts first, then markers and stations, then 3D, then arena setup, then
  phase 2.
- Tests: the existing `Map.test.tsx` covers layers and images; new states (claimed station, landed gem, 3D layers)
  need the same coverage.
