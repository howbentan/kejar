# Game board map, comic panels and moments

**Date:** 2026-11-24
**Status:** design, chosen from the mockups; the owner said "looks perfect" to the page below
**Mockups:**
- The page the owner approved: https://claude.ai/artifact/7isweMABA4cXAcZEXGRmG3 (private to the owner). It is the
  reference for the compass, the panels, the moments and the flood.
- `app/mockups/map-brand/` (launch config `map-brand`, port 5184): the map look itself, "game board" with buildings
  "board tiles". Throwaway; never committed. "sketchbook" and "street doodles" there were not chosen.

## Why

The Ink map (`docs/superpowers/specs/2026-11-23-kejar-map-look-design.md`) is on brand but could be any dark map. The
owner wants it unmistakably kejar. Game board does that and helps the game: at a glance a player sees where they're
allowed to run. The comic panels and moments carry the same hand-drawn voice into everything else that happens on the
map, replacing generic chips and banners.

## 1. The map: Game board

1. **Outside the arena is dimmed and hatched.** Everything beyond the boundary sits under a black wash (opacity 0.68)
   and faint diagonal hand-drawn hatching. Inside stays the clear Ink map.
2. **A chalk edge.** The boundary is a broken, chalky white stroke (a line pattern, about 5 px) instead of today's thin
   white line.
3. **"out" ticks.** Short white ticks point outward from the edge every 22 m. Every fourth one has a small lowercase
   "out" just outside it, in Kejar Hand, slightly tilted.
4. **Stamped Penjara and start.** A worn rubber stamp reading "penjara" / "start" in the owner's handwriting sits just
   below each mark, tilted a few degrees, on the ground under the existing icons (which stay, flat and floating).
5. **Board-tile buildings.** Slightly lighter blocks (`#202023`) with a crisp chalk outline (`rgba(245,245,243,.42)`,
   1.1 px). Outside the arena the wash makes them fade, so only the field's tiles stand out.

## 2. The compass

- A doodled compass in the **top-right** corner of the map (moved from top left, which the panels now use): wobbly
  ring, tick marks, a white north half and dark south half on the needle, "u" (utara) at the top.
- It works: the needle always points north as the map turns (dragging to rotate, or the 3D view's bearing).
- Tap it and the map turns back to north (about 0.45 s, eased), then the needle gives a small wiggle.

## 3. Comic panels (top left of the map)

**The endgame panel.** When an endgame starts, its full-screen reveal plays as today; when it's dismissed it shrinks
into the top-left corner and becomes a comic panel (the sequel to the reveal). It stays until the whistle and replaces
today's endgame chip. The panel: thick black border with a white outline, the endgame's colour, halftone dots, a
slight tilt, a hard offset shadow, a white tilted caption with the time left ("4:12 left"), the endgame logo, its name
in Kejar Hand, and one live line:

| Endgame | Live line |
|---|---|
| Banjir Kilat | `water rises in 0:48`, then `dry land: last bit` |
| Bomba | `next ping 1:12`, then `last call: all shown` |
| Hang Hebat | `wanted: #07 aina` (or "wanted: you") |
| PKP | `penjara closed · ×2` |

Tapping it shows the rule in a speech bubble under it; tap again to close.

**State panels.** Every state that lasts gets a smaller comic panel in the same stack, under the endgame panel. Three
at most are shown (newest last), with a "+N more" tag for the rest. Each leaves when its state ends, and they replace
today's chips and banners on the map. Each has a caption, an icon (the power-up's own sticker where there is one, else a
doodled icon), a title and a live line:

| Who sees it | Panel | Look | Live line |
|---|---|---|---|
| Dikejar | kejar dekat! (Kejar within 100 m) | red, speed lines, "!!" | lari! |
| Dikejar | check in | white, clock | in 1:42 |
| Dikejar | balik! (luar garisan) | yellow, speed lines, back arrow | back in 0:24 or out |
| Dikejar | in the water! (Banjir) | blue, drips, water drop | dry land in 0:24 |
| Dikejar | durian | cream, Durian sticker | blocks 1 catch · 8:12 |
| Dikejar | ponteng | white, Ponteng sticker | skips your next ping |
| Dikejar | gostan | white, Gostan sticker | next ping shows you elsewhere |
| Kejar | brain freeze! (Cheese Ais) | ice blue, frosted edge, Cheese Ais sticker | slot frozen 2:41 |
| Kejar | mat rempit | volt, speed lines, sticker | extra ping in 0:30 |
| Kejar | toll gate up | white, Tee And Gee sticker | charges check-ins within 40 m |
| Kejar | snapshot taken | white, camera | everyone is on your map |
| In Penjara | in penjara | dark, bars | wait for a jailbreak · time |
| Penjara, marshals | breaking out (jailbreak hold) | volt, speed lines, key | hafiz · 7 s |

The full-screen takeovers (Mak Kau Hijau, SOS, Tupperware, role reveal) stay as they are.

## 4. One-off moments

A moment that happens once gets a pop: its art and words in Kejar Hand, **lowercase only** (the font has no capitals),
inside a **doodled burst** sized to just hold them (uneven points, a wobbly black outline drawn twice with a white line
just off it, a hand-drawn offset shadow, roughed up like the stickers). It pops in, holds, then flies off toward the
top-left corner.

| Moment | Art | Words | Burst |
|---|---|---|---|
| Someone caught | the volt kejar logo | `#07 aina dah kena kejar` (no "hailat!") | black |
| Jailbreak | the Penjara gate, redrawn as a vector, cracks down the middle, shakes and splits in half | `krak!` · `penjara pecah, everyone out` | dark grey |
| 5 minutes left | a doodled clock | `5 minit lagi!` · `last stretch` | yellow |
| Final whistle | a whistle doodle in the sticker style, red band, blows with puff lines | `pitpit!` · `final whistle, bossku` | red |

**Pause** is not a pop: it keeps today's pause screen (the shaq time-out photo, "game paused", the frozen clock, "stay
where you are") but over the game screen heavily shaded and slightly blurred, instead of plain black.

## 5. Banjir Kilat on the map

The flood looks like real water. Inside the arena, everything outside the dry circle is blue water (`#1D5CC9` at about
0.62) with moving wave strokes, rings of current drifting outward and dashed white foam on a wobbly waterline. At each
rise (8, 6, 4, 2 minutes left) the waterline creeps in over a second or two rather than jumping. A minute before each
rise a dashed blue line shows where the water will reach, with a `water rises in 0:43` label. Game pieces stay on top of
the water. Reduced motion: the water is still, and rises jump.

## Non-goals and anti-goals

- No new brand colours; the panel and burst colours are existing tokens. Lime stays for game pieces on the map.
- No change to any game rule, timing, the boundary or where anything is.
- **Anti-goal:** anything hiding a player, station, pin or ring. Board layers and water sit under the game layers;
  panels sit in the corner and never over the player's own dot.
- **Anti-goal:** the map inside the arena looking busy.
- **Anti-goal:** panels piling up so the map disappears: three at most.

## Approaches

- **Game board** (chosen) over Sketchbook (busy everywhere) and Street doodles (competes with players, only works on
  our own file). Board tiles over scribbled (fights the hatching) and pop-up (barely visible flat).
- **Panels in one stack** (chosen) over keeping today's chips plus a separate endgame panel: one place to look, one look.
- **Moments as logo pops** (chosen, owner's change) over sound-effect words in capitals, which fell back to another font.

## Where it applies (my calls)

- **Game map (`Map.tsx`)**: the map look, compass, flood and panels, for every role.
- **Arena setup map (`PlaceMap.tsx`)**: board-tile buildings only; no wash, ticks or stamps, because the organiser is
  still drawing the boundary.
- **Both tile sources**: everything works on our own file and on the OpenFreeMap fallback.
- **3D**: wash, edge, ticks, stamps and water lie flat on the ground.

## Left to the builder

- Hatch, chalk, stamp and burst drawings at runtime on a canvas or as small PNGs; seeded so they look the same each time.
- How the flood water is drawn in MapLibre (fill layers with a pattern plus an animated line, or a canvas layer), as
  long as it looks like the mockup and stays under the game layers.
- Exact tick spacing, panel sizes and timings after a look on a real phone outdoors.
- Tests in the style of `Map.test.tsx`, `mapStyle.test.ts` and the existing chip/banner tests: board layers sit under the
  first game layer, the setup map gets tiles but no wash, each state shows its panel and removes it when the state ends,
  three panels at most, each moment shows its words, pause keeps its photo.
