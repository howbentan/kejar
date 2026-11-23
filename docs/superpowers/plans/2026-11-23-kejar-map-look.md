# Kejar Map Look (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every map in the app gets the Ink look, Kejar Hand labels from our own glyph files, a slim credit, a flat/3D
button, floating j markers in 3D, volt diamond stations that go red with a countdown while locked, and gold/purple
Tupperware diamonds, in the game maps and in arena setup.

**Architecture:** The base style (`mapStyle.ts`) carries both the flat and the 3D building layers; a small helper flips
their visibility, so switching views never reloads the style or loses game layers. Game layers are added once, in flat
and floating pairs, and the same helper shows one set or the other. Marker art is static 2x PNGs in `app/public/map/`,
built by a script, like the existing j images. Station locks come from the server view as `lockedUntil`.

**Tech Stack:** React + TypeScript, MapLibre GL v5, Vitest + Testing Library, Python 3 (Pillow, NumPy, SciPy, fontTools)
for the two asset scripts.

**Spec:** `docs/superpowers/specs/2026-11-23-kejar-map-look-design.md` (reference mockup:
`docs/superpowers/mockups/2026-11-23-map-looks/index.html`, launch config `map-looks-mockups`).

**Not in this plan:** spec §11.2, our own map file on Cloudflare R2. It needs the owner's Cloudflare account and a
data-format check, and lands as its own plan. Tiles stay on OpenFreeMap here.

## Before starting

- The working tree has uncommitted work from another session in `app/src/game/Map.tsx`, `Map.test.tsx`,
  `PlaceMap.tsx` and others. Start only once that work is committed, and branch from it.
- Kejar Hand's file is `app/mockups/hand/kejar-hand.ttf` (owner's typography work, untracked). If that work has
  shipped the font elsewhere by now, use that path instead.

## Global Constraints

- MapLibre stays on v5. No new runtime dependencies.
- Brand: black `#0A0A0B`, white `#F5F5F3`, Volt `#C6FF3D`. No lime in any base-map layer.
- Claimed red is `--danger` `#E5484D`. Gold `#FFF27A / #FFD60A / #F5B800`, purple `#F0E0FF / #C9A4FF / #9B5DE5`
  (tokens.css legendary and bomoh values).
- Map labels: font stack `Kejar Hand Regular`, `text-transform: lowercase`, letter spacing 0.
- Phase 1 credit text, verbatim: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`, with links to
  `https://openfreemap.org`, `https://www.openmaptiles.org/` and `https://www.openstreetmap.org/copyright`.
- Station lock is `STATION_LOCK_MS` from `app/shared/powerups.ts` (60 000 ms). Never hard-code 60.
- Every animation is off under `useReducedMotion()` and while `document.hidden`.
- `localStorage` reads and writes are wrapped in try/catch; failure means flat.

## Review Focus

1. A station's lock runs out while the screen stays open with no new poll: the red diamond must turn volt by itself.
2. `localStorage` throws (private mode, blocked storage): the map opens flat and the button still works.
3. Reduced motion on: 3D markers sit still at their hover height; nothing bobs, drops or rises.
4. A map name in a script Kejar Hand and Geist both lack (for example Chinese street names): no 404 for glyph files,
   the rest of the map still draws.
5. A building with no `render_height`: it still rises (default height), never a flat hole in the 3D view.

---

### Task 1: Our own label fonts

**Files:**
- Create: `app/scripts/build-glyphs.py` (move in the mockup's working generator,
  `docs/superpowers/mockups/2026-11-23-map-looks/make_glyphs.py`: 24 px SDF, 3 px buffer, radius 8, cutoff 0.25,
  4x supersampling, each code point from the first font that has it)
- Create: `app/public/fonts/Kejar Hand Regular/{start}-{end}.pbf` (256 files, generated, committed)
- Modify: `app/package.json` (devDependency `geist` for the fallback TTF; script `"glyphs": "python -I scripts/build-glyphs.py"`)
- Test: `app/src/game/glyphs.test.ts`

**Interfaces:**
- Produces: glyph URL template `/fonts/{fontstack}/{range}.pbf` served from our own origin; font stack name
  `Kejar Hand Regular`.

- [ ] **Step 1: Write the failing test** `glyphs.test.ts`:
  - `it('ships every glyph range for Kejar Hand Regular')`: for `start` in `0, 256, … 65280` the file
    `public/fonts/Kejar Hand Regular/${start}-${start + 255}.pbf` exists (256 files).
  - `it('names the font stack inside the files')`: `0-255.pbf` contains the bytes `Kejar Hand Regular` and is larger
    than 20 000 bytes (letters, digits and the Geist fallback for punctuation are in it).
- [ ] **Step 2: Run** `npx vitest run src/game/glyphs.test.ts`. Expected: FAIL, files missing.
- [ ] **Step 3: Write `build-glyphs.py`** with usage
  `python -I scripts/build-glyphs.py <primary.ttf> "<Stack Name>" <out_dir> [fallback.ttf]`. Writes a glyph file for
  every one of the 256 ranges, empty ranges included (Review Focus 4). Run it with Kejar Hand as primary and
  `node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf` as fallback, output `public/fonts`.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: Kejar Hand map label fonts, served from our own origin`.

### Task 2: The Ink base style

**Files:**
- Modify: `app/src/game/mapStyle.ts`
- Test: `app/src/game/mapStyle.test.ts`

**Interfaces:**
- Consumes: Task 1's glyph files.
- Produces:
  - `kejarMapStyle: StyleSpecification` (same export name; Ink layers; `glyphs` =
    `` `${origin}/fonts/{fontstack}/{range}.pbf` `` with `origin = typeof location === 'undefined' ? '' : location.origin`)
  - `export const MAP_FONT = ['Kejar Hand Regular']`
  - `export const FLAT_BUILDING_LAYERS = ['buildings', 'buildings-line']`, `export const BUILDINGS_3D = 'buildings-3d'`

- [ ] **Step 1: Write the failing tests** (replace the file's lime/label tests, keep "names below the game layers"):
  - `it('paints the base map in Ink only')`: background `#0A0A0B`, landcover `#121213`, park `#161618`,
    water `#232428`, buildings `#1B1B1D` with line `#26262A`, roads `#2C2C2F`; no paint value anywhere matches
    `/c6ff3d|198, ?255, ?61/i`.
  - `it('draws footpaths as their own fine dashed lines')`: layer `paths` filters `class` in `path, track`, colour
    `rgba(245,245,243,.32)`, dasharray `[2, 1.5]`; `roads` excludes those classes.
  - `it('writes every name in Kejar Hand, lowercase')`: each symbol layer has `text-font` equal to `MAP_FONT`,
    `text-transform` `lowercase`, `text-letter-spacing` 0.
  - `it('has 3D buildings, hidden until asked for')`: layer `buildings-3d` is `fill-extrusion`, colour `#2E2E33`,
    opacity 0.9, height `['coalesce', ['get', 'render_height'], 8]`, base `['coalesce', ['get', 'render_min_height'], 0]`,
    `layout.visibility` `none` (Review Focus 5).
  - `it('loads its glyphs from our own origin')`: `glyphs` ends with `/fonts/{fontstack}/{range}.pbf` and does not
    contain `openfreemap`.
- [ ] **Step 2: Run** `npx vitest run src/game/mapStyle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Rewrite `mapStyle.ts`** with the spec §5.1 table and §5.2 sizes (park and water names 17 px, street
  names 15 px, place names 17 px). Keep the OpenMapTiles source as is.
- [ ] **Step 4: Replace `'Noto Sans Regular'`** with `MAP_FONT` in every text layer in `Map.tsx` and `PlaceMap.tsx`
  (toilets "WC", snapshot labels, and any others a search finds).
- [ ] **Step 5: Run** `npx vitest run`. Expected: all PASS (fix existing tests that asserted Noto).
- [ ] **Step 6: Commit** `feat: Ink map style with Kejar Hand names and hidden 3D buildings`.

### Task 3: The slim credit

**Files:**
- Create: `app/src/game/MapCredit.tsx`
- Modify: `app/src/game/Map.tsx` (map options: `attributionControl: false`; render `<MapCredit />` inside the map box),
  `app/src/game/PlaceMap.tsx` (same), the stylesheet that holds the old credit rule in `app/src/styles/tokens.css`
- Test: `app/src/game/MapCredit.test.tsx`, `Map.test.tsx`

**Interfaces:**
- Produces: `export default function MapCredit(): JSX.Element` (positioned absolute, bottom left; class `map-credit`).

- [ ] **Step 1: Write the failing tests:** `MapCredit` renders the exact Global Constraints text with its three links;
  `Map.test.tsx` asserts the `maplibregl.Map` constructor got `attributionControl: false` and the credit is in the
  document.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** CSS: Geist Mono, 8 px, letter spacing 0.04em, `rgba(245,245,243,.32)`, no background,
  `left: 14px; bottom: 10px`, links inherit colour. Remove the old `.maplibregl-ctrl-attrib` styling.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: slim map credit`.

### Task 4: Marker art

**Files:**
- Create: `app/scripts/build-map-markers.py`
- Create (generated, 2x pixels, committed) in `app/public/map/`: `dia-volt.png`, `dia-red.png`, `dia-gold.png`,
  `dia-purple.png`, `gem-volt-float.png`, `gem-gold-float.png`, `gem-purple-float.png`, `gem-red.png`,
  `j-runner-float.png`, `j-chaser-float.png`, `j-ghost-float.png`
- Modify: `app/src/game/Map.tsx` (`MAP_ICONS` gains all eleven names; export it)
- Test: `app/src/game/mapIcons.test.ts`

**Interfaces:**
- Produces: image names above, all loaded by `addMapIcons` with `pixelRatio: 2`. `export const MAP_ICONS`.

Art, ported from the mockup: flat diamond = 40×40 canvas, 20×20 square rotated 45°, 3 px `#0A0A0B` edge, fill volt
`#C6FF3D` / red `#E5484D` / gold `#FFD60A` / purple `#C9A4FF`. Gem = 44×58 octahedron, apex (22,3), equator
(3,25) (22,31) (41,25), foot (22,55); faces top-left, top-right, bottom-left, bottom-right = volt
`#DDFF85 #C6FF3D #8CBD20 #668A16`, red `#FF8A8D #E5484D #B8343A #8C252A`, gold `#FFF27A #FFD60A #F5B800 #B88700`,
purple `#F0E0FF #C9A4FF #9B5DE5 #6B35AD`; 2.5 px black outline. A `-float` image adds a 64 px dotted stem below the art
(2 px, dash 3/4) whose foot is the image's bottom edge: volt j and volt gem at alpha .5/.45, white j `rgba(245,245,243,.5)`,
ghost j `rgba(198,255,61,.25)`, gold `rgba(255,214,10,.45)`, purple `rgba(201,164,255,.45)`. `gem-red` has no stem.

- [ ] **Step 1: Write the failing test** `it('has a file for every map icon')`: for each name in `MAP_ICONS`,
  `public/map/${name}.png` exists and is a PNG whose width is even (2x art).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Write the script, generate the PNGs, extend `MAP_ICONS`.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: diamond, gem and floating j marker art`.

### Task 5: Stations carry their lock

**Files:**
- Modify: `app/shared/views.ts:197` (View type) and `:1255` (where stations are built)
- Test: `app/shared/views.test.ts`

**Interfaces:**
- Produces: `View['stations']: { n: number; lat: number; lng: number; lockedUntil: string | null }[]`.

- [ ] **Step 1: Write the failing tests:**
  - `it('marks a station locked until STATION_LOCK_MS after its latest claim')`: two claims at station 2 at
    `t` and `t+10s`, `now = t+20s` → station 2 `lockedUntil === new Date(t + 10_000 + STATION_LOCK_MS).toISOString()`,
    station 1 `null`.
  - `it('drops the lock once it has run out')`: `now = latest + STATION_LOCK_MS` → `null`.
  - `it('never puts other players\' claims in the hand')`: the existing `hand` still holds only `me`'s cards.
- [ ] **Step 2: Run** `npx vitest run shared/views.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with the same sum `judgeClaim` uses (latest `claimed_at` at that station +
  `STATION_LOCK_MS`), `null` when that is `<= i.now`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS (update fixtures that build `stations` literally).
- [ ] **Step 5: Commit** `feat: the view says how long each station stays locked`.

### Task 6: Flat markers: diamonds for stations and Tupperware

**Files:**
- Modify: `app/src/game/Map.tsx` (`StationMark`, `stationFeatures`, the `stations` and `station-numbers` layers, `Pin`,
  `pinFeatures`, the `stash` layer and props), `app/src/screens/Results.tsx`, `app/src/game/WalkGuide.tsx` /
  `app/src/screens/WalkPark.tsx` (wherever Tupperware pins get `tone`)
- Test: `app/src/game/Map.test.tsx`

**Interfaces:**
- Consumes: Task 4 images, Task 5 `lockedUntil`.
- Produces:
  - `type StationMark = { n: number; lat: number; lng: number; lockedUntil?: string | null }`
  - `stationFeatures(stations: StationMark[], now: number): FeatureCollection`, each feature with properties
    `locked: boolean`, `left: string` (`m:ss`, empty when open)
  - `Pin` gains `side?: TupperSide` (replaces `tone` for Tupperware steps); GameMap prop `stashSide?: TupperSide`
    replaces `stashTone`.

- [ ] **Step 1: Write the failing tests** in `Map.test.tsx`:
  - stations draw as one symbol layer `stations` with `icon-image` `['case', ['get', 'locked'], 'dia-red', 'dia-volt']`
    and there is no `station-numbers` layer.
  - `stationFeatures` with `lockedUntil = now + 42_000` gives `locked: true, left: '0:42'`; with `now - 1` gives
    `locked: false, left: ''`.
  - **Review Focus 1:** render a station locked until `now + 1500`, advance fake timers 2 s with no new props, and
    assert the `stations` source's last `setData` has `locked: false`.
  - a pin with `side: 'dikejar'` uses `dia-gold`, `side: 'kejar'` uses `dia-purple`; `stash` with `stashSide` likewise.
- [ ] **Step 2: Run** `npx vitest run src/game/Map.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** A 1 s interval re-runs `setData` on `stations` only while some station is locked; it stops
  when none is. Flat diamond `icon-size` 1.3, overlap allowed, placement ignored. Remove `tupperRed()` uses from the map
  only (the token stays for other screens).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: stations and Tupperware as diamonds; a claimed station goes red`.

### Task 7: The flat/3D button

**Files:**
- Create: `app/src/game/mapView.ts`, `app/src/game/MapViewButton.tsx`
- Modify: `app/src/game/Map.tsx` (render the button; call `applyMapView` on load and on change)
- Test: `app/src/game/mapView.test.ts`, `app/src/game/MapViewButton.test.tsx`, `Map.test.tsx`

**Interfaces:**
- Consumes: Task 2's `FLAT_BUILDING_LAYERS`, `BUILDINGS_3D`.
- Produces:
  - `useMapView(): [threeD: boolean, toggle: () => void]` — reads and writes `localStorage['kejar.map3d']` (`'1'`/`'0'`),
    default false, try/catch on both.
  - `applyMapView(m: maplibregl.Map, threeD: boolean, opts: { animate: boolean }): void` — sets visibility of the flat
    building layers vs `buildings-3d`, of every layer id in `FLAT_MARKER_LAYERS` vs `FLOAT_MARKER_LAYERS` (both exported
    from this file, filled in by Task 8; empty arrays now), and eases the camera to pitch 58 (1200 ms) or pitch 0
    (900 ms), `duration: 0` when `animate` is false.
  - `MapViewButton({ threeD, onToggle })`: 44 px round button, bottom right above the credit; cube icon and
    `aria-label="Show buildings in 3D"` while flat; white fill, flat-layers icon and `aria-label="Show buildings flat"`
    in 3D. Icons are the mockup's SVGs.

- [ ] **Step 1: Write the failing tests:**
  - `useMapView` defaults to flat; toggling writes `'1'`; a stored `'1'` starts in 3D.
  - **Review Focus 2:** with `localStorage.getItem`/`setItem` throwing, it starts flat and toggling still flips state.
  - `applyMapView(m, true, …)` sets `buildings-3d` visible and `buildings`, `buildings-line` none, and calls `easeTo`
    with pitch 58; `false` does the reverse with pitch 0.
  - `MapViewButton` shows the right label in each state and calls `onToggle` on click.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement**; GameMap passes `animate: !reduce`. The camera keeps its bearing.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: flat/3D map button`.

### Task 8: Floating markers, landed gems, countdown, motion

**Files:**
- Create: `app/src/game/floatMotion.ts`
- Modify: `app/src/game/Map.tsx`, `app/src/game/mapView.ts` (fill `FLAT_MARKER_LAYERS`, `FLOAT_MARKER_LAYERS`)
- Test: `app/src/game/floatMotion.test.ts`, `Map.test.tsx`

**Interfaces:**
- Consumes: Tasks 4, 6, 7.
- Produces:
  - Float layers added once on load, hidden in flat: `float-shadow` (circle, radius 8 for j and 13 for gems, `#000`,
    opacity .55, blur .7, pitch-alignment map), `float-j` (`['concat', <j image>, '-float']`, anchor bottom, size 0.85),
    `float-gem` (open stations, `gem-volt-float`, size 1.2), `float-tupper` (pins/stash by side, `gem-gold-float` /
    `gem-purple-float`), `landed-glow` (locked stations, `#E5484D`, radius 16, opacity .22), `landed-gem` (`gem-red`,
    size 1.2, anchor bottom, offset [0, 6]), `landed-timer` (text `['get', 'left']`, `MAP_FONT`, 11 px, `#E5484D`, halo
    `#0A0A0B` 2 px, anchor top, offset [0, 0.6]).
  - `FLAT_MARKER_LAYERS = ['points-j', 'fuzzy-j', 'stations', 'pins-tupper', 'stash']` (use the real ids in `Map.tsx`
    at execution time), `FLOAT_MARKER_LAYERS` = the seven above.
  - `startFloatMotion(m: maplibregl.Map, getEvents: () => { dropAt: number; riseAt: number }): () => void` — a
    requestAnimationFrame loop capped at 30 fps that sets `icon-translate` on `float-j` (`sin(t/650)*3`), `float-gem`
    and `float-tupper` (`sin(t/900 + phase)*4`, plus the rise offset), `landed-gem` (drop offset); returns a stop
    function. Drop: 650 ms ease-out-bounce from −38 px to 0. Rise: 700 ms ease-out-cubic from +38 px to 0.
- GameMap starts the loop only when in 3D, not `reduce`, and `!document.hidden`; stops it otherwise and on unmount.
  It records `dropAt` when a station's `locked` turns true and `riseAt` when it turns false.

- [ ] **Step 1: Write the failing tests:**
  - **Review Focus 3:** with `reduce.on = true` in 3D, no `requestAnimationFrame` is scheduled and no
    `icon-translate` is set.
  - `startFloatMotion` stops scheduling after its stop function is called; a `visibilitychange` to hidden stops it.
  - At `t = dropAt + 650` the `landed-gem` translate is `[0, 0]`; at `t = dropAt` it is `[0, -38]`.
  - In 3D, `applyMapView` shows the seven float layers and hides the flat marker layers; in flat, the reverse.
  - The `landed-timer` layer reads `left` and uses `MAP_FONT`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Markers are added after `buildings-3d` in layer order so they always draw over buildings.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: floating markers in 3D; a claimed gem lands with a countdown`.

### Task 9: Arena setup uses the same map

**Files:**
- Modify: `app/src/game/PlaceMap.tsx`
- Test: `app/src/game/PlaceMap.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 7, 8 (`useMapView`, `applyMapView`, `MapViewButton`, `MapCredit`, the gem images,
  `startFloatMotion`).

- [ ] **Step 1: Write the failing tests:** placed stations draw as the `stations` symbol layer with `dia-volt` and no
  `station-numbers` layer; the view button is rendered and toggles `buildings-3d`; tapping near a station in
  `stations` mode still removes it with the map pitched (mock `project` returns the same point; assert the station
  list shrinks).
- [ ] **Step 2: Run** `npx vitest run src/game/PlaceMap.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** In 3D, placed stations float as `gem-volt-float` with shadows, the same as in the game.
  The jail and start keep their images. Taps place and remove in both views.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: arena setup on the Ink map, with the flat/3D button`.

### Task 10: Check it in the app

- [ ] **Step 1:** `npx tsc -b` and `npx vitest run`. Expected: no errors, all PASS.
- [ ] **Step 2:** Start `kejar-dev` and open a local test game (launch config `kejar-local-test`). Check, with
  screenshots: Ink map with Kejar Hand names; slim credit; the button flips views and survives a reload; j's float and
  bob in 3D; claiming a station turns it red, in 3D it lands with a countdown and rises when the lock ends; the organiser
  walk shows gold and purple diamonds; arena setup has the button and diamonds.
- [ ] **Step 3:** In the browser's network panel: glyph requests go to our own origin, none to
  `tiles.openfreemap.org/fonts`; no CSP errors in the console.
- [ ] **Step 4:** Add a `docs/HANDOFF.md` entry: what changed, that phase 2 (own map file, credit down to
  "© OpenStreetMap") is a separate plan, and how to rebuild glyphs and marker art.
- [ ] **Step 5: Commit** `docs: HANDOFF entry for the Ink map`.
