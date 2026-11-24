# Game board map: the arena as the playing field

**Date:** 2026-11-24
**Status:** design, chosen from the mockup; awaiting the owner's approval of this doc
**Mockup:** `app/mockups/map-brand/` (launch config `map-brand`, port 5184), look "game board", buildings "board tiles".
Throwaway; never committed. The "sketchbook" and "street doodles" looks there are not chosen and stay for reference only.

## Why

The Ink map (`docs/superpowers/specs/2026-11-23-kejar-map-look-design.md`) is on brand but could be any dark map. The
owner wants something added that makes it unmistakably kejar. Game board does that and also helps the game: at a glance a
player sees where they're allowed to run.

## Goals

1. **Outside the arena is dimmed and hatched.** Everything beyond the boundary sits under a black wash (opacity 0.68) and
   faint diagonal hand-drawn hatching. Inside stays the clear Ink map.
2. **A chalk edge.** The boundary is a broken, chalky white stroke (a line pattern, about 5 px) instead of today's thin
   white line.
3. **"out" ticks.** Short white ticks point outward from the edge every 22 m. Every fourth one has a small lowercase "out"
   just outside it, in Kejar Hand, slightly tilted.
4. **Stamped Penjara and start.** A worn rubber stamp reading "penjara" / "start" in the owner's handwriting sits just below
   each mark, tilted a few degrees, on the ground under the existing icons (which stay, flat and floating as today).
5. **A doodled compass** in the top-left corner of the map, its needle pointing north with "u" (utara) above it. My call:
   it turns with the map, so it stays true when the 3D view is rotated.
6. **Board-tile buildings.** Buildings are slightly lighter blocks (`#202023`) with a crisp chalk outline
   (`rgba(245,245,243,.42)`, 1.1 px). Outside the arena the wash makes them fade, so only the field's tiles stand out.

## Non-goals and anti-goals

- No new colours: black, white and greys only. Lime stays for game pieces (the Ink rule stands).
- Not changing any game rule, the boundary itself, or where anything is.
- **Anti-goal:** anything that hides or competes with a player, a station, a pin or a ring. All board layers sit under the
  game layers.
- **Anti-goal:** the hatching or ticks making the map look busy inside the arena. Inside stays clean.

## Approaches

- **Game board** (chosen): arena as a playing field. Picked because it adds brand character and makes the boundary
  obvious mid-chase.
- **Sketchbook** (not chosen): paper grain and hatching everywhere. Most hand-drawn, but busy over the whole map.
- **Street doodles** (not chosen): doodled mamak, surau, LRT and kedai icons. Local and fun, but competes with players
  and only works on our own Protomaps file.
- For buildings, **board tiles** was chosen over scribbled cross-hatch (fights the hatched outside) and pop-up shadows
  (barely visible flat, redundant in 3D).

## Where it applies (my calls)

- **Game map (`Map.tsx`)**: all six goals, for every role (Dikejar, Kejar, marshal, organiser watching).
- **Arena setup map (`PlaceMap.tsx`)**: board-tile buildings only (they live in the shared style). No wash, ticks or stamps
  there, because the organiser is still drawing the boundary and needs to see past it.
- **Both tile sources**: board tiles are part of the Ink style, so they work on our own file and on the OpenFreeMap
  fallback alike.
- **3D**: the wash, edge, ticks and stamps lie flat on the ground; 3D buildings keep today's extrusion colour.

## Left to the builder

- The hatch, chalk and stamp drawings are made at runtime on a canvas (as in the mockup) or as small PNGs in
  `public/map/`; either is fine. Seeded randomness so they look the same every time.
- Exact tick spacing and label frequency after a look on a real phone outdoors.
- Tests in the style of `Map.test.tsx` and `mapStyle.test.ts`: the board layers exist and sit under the first game layer,
  the old thin arena line is gone, building colours match, and the setup map gets tiles but no wash.
