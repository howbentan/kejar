# Kejar Plan 4b: Real Park Outlines and Saved Arenas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers search a park by name and get its real OpenStreetMap outline with lakes cut out. They can optionally keep only the part inside a circle, then tap to place the jail, start and stations. The result is saved as a reusable arena for their organisation. Every map and safety rule uses that real play area.

**Architecture:**
- **Shared shape rules.** One pure module (`app/shared/playArea.ts`) turns *outline − water ∩ circle* into the play area, keeping the largest piece. It also answers "inside?" and "how far outside?". The future endgame shrink reuses it.
- **Arena drafts.** An arena draft (`app/shared/arenaDraft.ts`) is validated the same way on both sides: in the browser for instant feedback, and on the server before saving or creating a game.
- **OpenStreetMap is server-side.** Nominatim and Overpass are only called from the server (`app/api/_lib/osm.ts`), with an identifying User-Agent, a cache table and on-tap search only.
- **Saved arenas** live in a new `arenas` table owned by an organisation. A game still keeps its own copy in `games.arena`.

**Tech Stack:**
- Existing: Vite + React 19 + TS, Vitest, MapLibre v5, Supabase, Vercel.
- New dependency: `polyclip-ts` for polygon difference and intersection.

**Spec:** `docs/superpowers/specs/2026-10-27-kejar-plan4b-arenas-design.md`. Context:
- `docs/superpowers/specs/2026-10-26-kejar-plan4a-organiser-accounts-design.md`: organisations and `organiserToken` auth.
- `docs/superpowers/specs/2026-10-19-kejar-design.md` §5.1: the outside alert.

## Global Constraints

- **OpenStreetMap public services** ([policy](https://operations.osmfoundation.org/policies/nominatim/)):
  - Search runs only on a tap of **Search**, never as-you-type.
  - At most 1 Nominatim request per second per server instance.
  - Send `User-Agent: Kejar/1.0 (https://kejar-eosin.vercel.app)`.
  - Cache every response.
  - Show "© OpenStreetMap contributors" on every map.
- **Search parameters:** Nominatim `countrycodes=my`, `format=jsonv2`, `polygon_geojson=1`, `limit=5`. Keep only results whose geometry is a Polygon or MultiPolygon.
- **Water:** OSM `natural=water` areas inside the outline. Ignore features under **0.05 ha** (`MIN_WATER_HA = 0.05`).
- **Toilets:** OSM `amenity=toilets` nodes and ways inside the outline, stored as points.
- **Circle:** radius 100–500 m (unchanged).
- **Size cap:** a play area larger than a 500 m circle (`MAX_PLAY_AREA_HA = π·500²/10 000 ≈ 78.54`) is refused with `Too big — use part of the park (circle)`.
- **Several pieces:** keep the largest by area and report `pieces > 1`. Copy: `Only the largest part of the park is used`.
- **Failed lake check:** copy `Couldn't check for lakes. Look at the map before saving.`. The arena saves with `water_checked = false`. The saved list shows `Lakes not checked` plus a **Retry** button, and creating a game from it shows the same warning.
- **Point validation:** jail, start and stations (0–8) must be inside the play area and not in a hole. Copy: `<what> must be inside the play area` (e.g. `Station 3 must be inside the play area`).
- **Defaults:** jail and start default to `defaultPoint(area)` until moved.
- **Per-game overrides:** a game made from a saved arena may override jail, start and stations. Overrides are validated, then copied into the game only, never into the saved arena.
- **Ownership:** arenas belong to an organisation. Any organiser in it can list, use, edit and delete them. Other organisations get `404 Arena not found`.
- **Outside alert:** unchanged thresholds (alert when more than 20 m outside, re-armed back inside). "Outside" now includes being in a hole (lake).
- **Decoy** uses the same play-area rules. Jailbreak only measures distance to the jail, so it is unchanged.
- **Map styling:** colours Volt `#C6FF3D`, black `#0A0A0B` and white `#F5F5F3` only. The play-area outline is thin white, lakes are a white dashed outline, toilets are a small white `WC` label, and the start is a white ring with `S`.
- **Server limits:** free tiers only, a single `api/game.ts` function, RLS on with no policies on the new tables, and pure code in `app/shared/` with `.js` import extensions.
- **Legacy create kept:** the old `create { arenaId: 'around-me', center, radiusM, stations }` form keeps working, because tests and live scripts use it. `ARENAS.titiwangsa` is removed.

## Review Focus

1. **A circle that cuts a park into two pieces** (a road or lake across it). The largest piece is kept and the organiser is told. → Task 1 test `circle splitting the park keeps the largest piece`.
2. **Overpass down or timing out during import.** The outline still imports flagged as lakes not checked, and Retry fixes it later. → Task 3 test `overpass failure imports without water and says so`; Task 5 test `recheckWater clears the flag and reports misplaced points`.
3. **An organiser from another organisation guessing an arena id.** Using, editing, deleting or rechecking it gives 404. → Task 5 test `arenas are scoped to the organisation`.
4. **A runner wading or rowing into the lake.** 30 m from the shore alerts marshals, 10 m doesn't. → Task 5 test `standing in the lake counts as outside the play area`.
5. **The saved park is edited or deleted after a game was created from it.** The game's map, stations and alerts don't change. → Task 5 test `editing or deleting a saved arena leaves existing games alone`.

## File Structure

```
supabase/migrations/0007_arenas.sql        # arenas + osm_cache tables (RLS on, no policies)
app/package.json                (modify)   # + polyclip-ts
app/shared/types.ts             (modify)   # Arena.holes?, Arena.toilets?
app/shared/playArea.ts          (new)      # buildPlayArea, inPlayArea, distanceOutsidePlayArea, ringAreaHa, defaultPoint
app/shared/arenaDraft.ts        (new)      # ArenaDraft type, arenaFromDraft (validation + defaults)
app/shared/arenas.ts            (modify)   # drop ARENAS; arenaAroundPoint builds via arenaFromDraft
app/shared/powerups.ts          (modify)   # decoySpot takes the arena
app/api/_lib/osm.ts             (new)      # searchParks, parkFeatures (injected fetch + cache)
app/api/_lib/store.ts           (modify)   # arenas + osm cache in GameStore/MemoryStore
app/api/_lib/supabaseStore.ts   (modify)   # same, Supabase
app/api/_lib/actions.ts         (modify)   # Ctx.fetchJson; arena actions; create from draft/saved; outside uses play area
app/api/game.ts                 (modify)   # pass fetchJson into Ctx
app/src/game/Map.tsx            (modify)   # holes, toilets, start marker
app/src/game/PlaceMap.tsx       (new)      # tap map: circle centre / stations / jail / start
app/src/game/AreaPicker.tsx     (delete)   # replaced by PlaceMap
app/src/screens/ArenaSetup.tsx  (new)      # find a park or circle around me → place → name → save/use
app/src/screens/HostNew.tsx     (modify)   # saved parks list, Retry, delete, per-game adjust, new area
app/src/screens/Lobby.tsx       (modify)   # marshal setup map
app/src/screens/HostLobby.tsx   (modify)   # organiser setup map
```

---

### Task 1: Play-area geometry

**Files:**
- Create: `app/shared/playArea.ts`
- Modify: `app/shared/types.ts`, `app/shared/powerups.ts`, `app/shared/views.ts` (the `decoySpot` call), `app/package.json`
- Test: `app/shared/playArea.test.ts`, `app/shared/powerups.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `Arena.holes?: LatLng[][]`: water cut out of the play area. Absent means none.
  - `Arena.toilets?: LatLng[]`
  - `Arena.boundary` stays the play area's outer ring.
- Produces, in `playArea.ts`:
  - `MAX_PLAY_AREA_HA = (Math.PI * 500 ** 2) / 10_000`
  - `MIN_WATER_HA = 0.05`
  - `ringAreaHa(ring: LatLng[]): number`
  - `buildPlayArea(i: { outline: LatLng[] | null; water: LatLng[][]; circle: { center: LatLng; radiusM: number } | null }): { boundary: LatLng[]; holes: LatLng[][]; areaHa: number; pieces: number }`
    - Computes `(outline ?? circle polygon) − water`, then intersects with the circle polygon when both outline and circle are given.
    - Keeps the largest resulting polygon. `pieces` is the number of polygons before that choice.
    - Water under `MIN_WATER_HA` is ignored.
    - Throws `Error('Nothing left to play on')` when the result is empty.
  - `inPlayArea(p: LatLng, a: Pick<Arena, 'boundary' | 'holes'>): boolean`
  - `distanceOutsidePlayArea(p: LatLng, a: Pick<Arena, 'boundary' | 'holes'>): number`. It returns 0 inside; otherwise the distance to the boundary edge, or, when inside a hole, to that hole's edge.
  - `defaultPoint(a: Pick<Arena, 'boundary' | 'holes'>): LatLng`:
    - The boundary's vertex average if that point is in the play area.
    - Otherwise the first of 24 points walking inward from vertex 0 toward that average that is in the play area.
    - Otherwise vertex 0.
- Changes `decoySpot(p, arena: Pick<Arena, 'boundary' | 'holes'>, seed)`: the candidate must pass `inPlayArea`.

- [ ] **Step 1: Install** with `cd app && npm install polyclip-ts`. It is an exact npm release, so no CDN is needed.

- [ ] **Step 2: Write the failing tests in `playArea.test.ts`**

  Fixture: a 400 m × 400 m square park around `C = {lat: 3.15, lng: 101.7}` (build it with `offset` from `geo.ts`), and a 100 m × 100 m square lake at its centre.

  - `cuts the lake out as a hole`:
    - `holes.length === 1`.
    - `areaHa` ≈ 16 − 1 = 15 (±0.3).
    - `inPlayArea(C)` is false; a point 150 m north of C is true.
  - `ignores water under 0.05 ha`: a 15 m × 15 m pond gives `holes` = [].
  - `circle keeps only the overlap`: circle radius 100 m centred 150 m east of C, on a park with no lake. `areaHa` < π·100²/10 000 and every boundary point is within 101 m of the circle centre.
  - `circle splitting the park keeps the largest piece`:
    - Park as above, plus a 20 m wide water strip crossing it north–south 100 m west of C.
    - A circle of radius 200 m at C gives `pieces === 2`, and the kept boundary contains a point 150 m east of C.
  - `no outline means just the circle`: `buildPlayArea({ outline: null, water: [], circle: {center: C, radiusM: 200} }).areaHa` ≈ 12.57 (±0.2).
  - `distanceOutsidePlayArea`:
    - 0 inside.
    - ≈ 30 for a point 30 m outside the park edge.
    - ≈ 30 for a point 30 m inside the lake's edge.
  - `defaultPoint lands in the play area even when the centre is a lake`: `inPlayArea(defaultPoint(area), area) === true` for the lake fixture.

- [ ] **Step 3: Add a test to `powerups.test.ts`:** `decoy never lands in the lake`. Over seeds `s0`–`s49`, `inPlayArea(decoySpot(p, area, seed), area)` holds whenever any of the 12 candidates is in the play area.

- [ ] **Step 4: Run** `npx vitest run shared/playArea.test.ts shared/powerups.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 5: Implement `playArea.ts`.**
  - Convert to and from polyclip-ts `[lng, lat]` rings.
  - Measure areas with the same flat projection `geo.ts` uses.
  - Compute `distanceOutsidePlayArea` with `distanceOutsideM` against the boundary, or against the containing hole as an inverted check.

- [ ] **Step 6: Update `decoySpot` and its caller** in `views.ts` to pass `i.game.arena`.

- [ ] **Step 7: Run** `npx vitest run && npx tsc -b && npm run typecheck`. Expected: all pass.

- [ ] **Step 8: Commit** `feat: play area = park minus water, overlapped with a circle`

---

### Task 2: Arena drafts

**Files:**
- Create: `app/shared/arenaDraft.ts`
- Modify: `app/shared/arenas.ts`, `app/src/game/AreaPicker.tsx` (the `FALLBACK` constant only, until Task 7 deletes the file)
- Test: `app/shared/arenaDraft.test.ts`, `app/shared/arenas.test.ts` (adjust if present)

**Interfaces:**
- Consumes: `buildPlayArea`, `inPlayArea`, `defaultPoint`, `MAX_PLAY_AREA_HA` (Task 1).
- Produces:
  ```ts
  export interface ArenaDraft {
    name: string                       // 1–40 chars after trim
    source: 'osm' | 'circle'
    osmRef: string | null              // e.g. 'way/10590000'
    outline: LatLng[] | null           // required when source === 'osm'
    circle: { center: LatLng; radiusM: number } | null  // required when source === 'circle'
    water: LatLng[][]
    toilets: LatLng[]
    waterChecked: boolean
    jail: LatLng | null                // null = defaultPoint
    start: LatLng | null
    stations: LatLng[]
  }
  export function arenaFromDraft(d: ArenaDraft, id: string): Arena
  export function pointProblems(arena: Arena): string[]   // [] when jail, start and every station are in the play area
  export const KL_FALLBACK: LatLng = { lat: 3.1579, lng: 101.7116 } // where maps open without a location (KLCC)
  ```
  - `arenaFromDraft` throws `Error` with the exact copy from Global Constraints for:
    - radius out of 100–500;
    - an over-cap area;
    - more than `MAX_STATIONS` stations (`At most 8 stations`);
    - a point outside the play area;
    - an empty name (`Give the park a name`).
  - It sets `toilets` to only the toilets inside the play area.
  - `arenaAroundPoint(center, radiusM, stations)` becomes a thin wrapper over `arenaFromDraft` with `source: 'circle'`, name `Around the organiser` and id `around-me`. Its existing messages (`At most 8 stations`, `Stations must be inside the play area`) keep passing their current tests: map the per-station message to the old one inside the wrapper.
  - `ARENAS` is deleted. `AreaPicker`'s `FALLBACK` uses `KL_FALLBACK`.

- [ ] **Step 1: Write the failing tests:**
  - `defaults jail and start into the play area`
  - `rejects a station in the lake with "Station 2 must be inside the play area"`
  - `rejects an over-cap park without a circle` (a 1 km × 1 km square gives `Too big — use part of the park (circle)`)
  - `keeps only toilets inside the play area`
  - `pointProblems lists what moved out after the area shrank` (a jail now in a hole gives `['Jail must be inside the play area']`)
  - `arenaAroundPoint still builds a 200 m circle by default`

- [ ] **Step 2: Run** `npx vitest run shared/arenaDraft.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**, removing `ARENAS` and its imports.

- [ ] **Step 4: Run** `npx vitest run && npx tsc -b && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: arena drafts validated the same way in the browser and on the server`

---

### Task 3: OpenStreetMap client

**Files:**
- Create: `app/api/_lib/osm.ts`
- Test: `app/api/_lib/osm.test.ts`

**Interfaces:**
- Consumes: `ringAreaHa`, `MIN_WATER_HA` (Task 1). It also needs a cache, supplied as plain functions so this task doesn't depend on Task 4.
- Produces:
  ```ts
  export type FetchJson = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<unknown>
  export interface OsmCache { get(key: string): Promise<unknown | null>; put(key: string, body: unknown): Promise<void> }
  export interface ParkHit { osmRef: string; name: string; areaHa: number; outline: LatLng[]; pieces: number } // pieces > 1: a MultiPolygon, largest kept
  export const OSM_USER_AGENT = 'Kejar/1.0 (https://kejar-eosin.vercel.app)'
  export async function searchParks(q: string, deps: { fetchJson: FetchJson; cache: OsmCache; now: () => number }): Promise<ParkHit[]>
  export async function parkFeatures(outline: LatLng[], deps: { fetchJson: FetchJson; cache: OsmCache }): Promise<{ water: LatLng[][]; toilets: LatLng[]; waterChecked: boolean }>
  ```
  - `searchParks`:
    - Calls `https://nominatim.openstreetmap.org/search` with the Global Constraints parameters and the `User-Agent` header.
    - Keeps Polygon and MultiPolygon results, using the largest outer ring of a MultiPolygon.
    - Sorts by `areaHa` descending.
    - The cache key is `nominatim:` plus the lower-cased, trimmed query.
    - Waits so calls are at least 1000 ms apart within this process, using a module-level timestamp.
  - `parkFeatures`:
    - Makes one Overpass POST to `https://overpass-api.de/api/interpreter` with a `poly:"lat lon …"` filter built from the outline, and `[timeout:20]`.
    - Requests `way["natural"="water"]`, `relation["natural"="water"]`, `node["amenity"="toilets"]` and `way["amenity"="toilets"]` with `out geom;`.
    - Relation water uses each `outer` member's geometry as a ring.
    - Way toilets use their first point.
    - On any thrown error or non-JSON response it returns `{ water: [], toilets: [], waterChecked: false }` and doesn't cache.
    - The cache key is `overpass:` plus a hash of the poly string.

- [ ] **Step 1: Write the failing tests** with a fake `fetchJson` recording calls and a Map-backed cache:
  - `searchParks sends a Malaysia-only polygon search with an identifying User-Agent`
  - `searchParks drops point results and keeps the largest ring of a MultiPolygon` (that hit has `pieces: 2`)
  - `a repeated search is served from the cache` (one fetch for two calls)
  - `overpass failure imports without water and says so` (fetch throws, giving `waterChecked: false` and nothing cached)
  - `parkFeatures reads lakes from ways and relations and drops ponds under 0.05 ha`
  - `parkFeatures turns toilets into points`

- [ ] **Step 2: Run** `npx vitest run api/_lib/osm.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `osm.ts`.**

- [ ] **Step 4: Run** `npx vitest run && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: server-side OpenStreetMap park search and lake lookup`

---

### Task 4: Schema and store for saved arenas

**Files:**
- Create: `supabase/migrations/0007_arenas.sql`
- Modify: `app/api/_lib/store.ts`, `app/api/_lib/supabaseStore.ts`
- Test: `app/api/_lib/store.test.ts`, `app/api/_lib/supabaseStore.test.ts`

**Interfaces:**
- Consumes: `ArenaDraft`, `Arena` (Task 2).
- Produces, on `GameStore`:
  ```ts
  export interface SavedArenaRow {
    id: string; organisation_id: string; name: string
    draft: ArenaDraft          // what was imported/chosen, so Retry can rebuild
    arena: Arena               // built from draft
    water_checked: boolean
    created_at: string; updated_at: string
  }
  addArena(r: Omit<SavedArenaRow, 'id' | 'created_at' | 'updated_at'>): Promise<SavedArenaRow>
  updateArena(id: string, patch: Partial<Pick<SavedArenaRow, 'name' | 'draft' | 'arena' | 'water_checked'>>): Promise<void>
  arenaById(id: string): Promise<SavedArenaRow | null>
  arenasFor(organisationId: string): Promise<SavedArenaRow[]>   // newest updated first
  deleteArena(id: string): Promise<void>
  osmCacheGet(key: string, maxAgeMs: number): Promise<unknown | null>
  osmCachePut(key: string, body: unknown): Promise<void>
  ```
  - The cache max age is 30 days (`OSM_CACHE_MS = 30 * 24 * 3600_000`, exported from `osm.ts` or `store.ts`).
- The migration contains:
  - `arenas (id uuid pk default gen_random_uuid(), organisation_id uuid not null references organisations on delete cascade, name text not null, draft jsonb not null, arena jsonb not null, water_checked boolean not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`, plus an index on `organisation_id`.
  - `osm_cache (key text pk, body jsonb not null, fetched_at timestamptz not null)`.
  - RLS enabled on both, with no policies.

- [ ] **Step 1: Write the failing `MemoryStore` tests:**
  - `arenas are listed per organisation, newest first`
  - `updateArena bumps updated_at`
  - `osm cache returns nothing once older than maxAge`

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement both stores.** Supabase timestamps use the store clock, following the existing `nowIso()` pattern.

- [ ] **Step 4: Add a `supabaseStore.test.ts` test:** `osmCachePut upserts on key with the store clock`.

- [ ] **Step 5: Run** `npx vitest run && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** `feat: saved arenas and OpenStreetMap cache tables`

---

### Task 5: Arena actions and creating games from arenas

**Files:**
- Modify: `app/api/_lib/actions.ts`, `app/api/game.ts`
- Test: `app/api/_lib/actions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `Ctx.fetchJson: FetchJson`. In production, `api/game.ts` wraps global `fetch`, throwing on a non-2xx response. Tests pass a fake that is unused by default.
  - New actions. All require `organiserToken` (`requireAnyOrganiser`); arena ids are checked against the organiser's `organisation_id`, else `404 Arena not found`.
    - `searchParks { query }` → `{ results: ParkHit[] }`. The query must be 3–80 characters, else 400 `Type at least 3 letters`.
    - `parkFeatures { outline }` → `{ water, toilets, waterChecked }`.
    - `saveArena { arenaId?, draft }` → `{ arenaId }`. It runs `arenaFromDraft`, turning errors into 400 with the same message. It creates the arena, or updates it when `arenaId` is given.
    - `listArenas {}` → `{ arenas: { id, name, areaHa, waterChecked, arena: Arena, problems: string[] }[] }`, where `problems` is `pointProblems(arena)`.
    - `deleteArena { arenaId }` → `{ ok: true }`.
    - `recheckWater { arenaId }` → `{ waterChecked: boolean; problems: string[] }`.
      - It reruns `parkFeatures(draft.outline)` for OSM arenas (circle arenas are always checked) and, on success, rebuilds the arena from the draft with the new water.
      - The rebuild must not throw on misplaced points: build the area, then compute `problems`.
      - It saves `water_checked: true` along with the rebuilt arena and draft.
  - `create` additionally accepts either:
    - `{ draft }`: same validation as `saveArena`, not saved; or
    - `{ savedArenaId, overrides?: { jail?, start?, stations? } }`: loads the saved arena, applies the overrides to a copy of its draft, then runs `arenaFromDraft`. The copy goes into `games.arena`; the saved row is never written.
  - The legacy `around-me` form keeps working.
  - The outside alert uses `distanceOutsidePlayArea(here, game.arena)` instead of `distanceOutsideM(here, game.arena.boundary)`, and re-arms when it returns 0.

- [ ] **Step 1: Write the failing tests:**
  - `arenas are scoped to the organisation`. A second organisation's organiser (create it through the existing 4a invite helpers in this test file) gets 404 on `create {savedArenaId}`, `saveArena {arenaId}`, `deleteArena`, `recheckWater` and `listArenas` (an empty list).
  - `saved arena round trip`: `saveArena` then `listArenas` shows its name and `areaHa`, and `create { savedArenaId }` makes a game whose `state` arena has the saved stations.
  - `per-game overrides change the game, not the saved arena`
  - `editing or deleting a saved arena leaves existing games alone`
  - `standing in the lake counts as outside the play area`:
    - A game from a draft with a 100 m square lake.
    - A runner 10 m inside the lake edge raises no alert.
    - 30 m inside the lake raises an `outside` alert.
    - Back on land re-arms the alert.
  - `recheckWater clears the flag and reports misplaced points`:
    - Saved with `waterChecked: false`, no water, and the jail where a lake will be.
    - The fake Overpass returns that lake.
    - The result is `{ waterChecked: true, problems: ['Jail must be inside the play area'] }`, and `listArenas` shows the same.
  - `searchParks needs at least 3 letters and goes through the cache` (two identical searches give one `fetchJson` call)
  - `create refuses an over-cap park without a circle`: 400 `Too big — use part of the park (circle)`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement the actions,** registering them in the `actions` map. Wire `Ctx.fetchJson` and the store-backed `OsmCache` in `api/game.ts`.

- [ ] **Step 4: Run** `npx vitest run && npx tsc -b && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: saved arenas, park search and games created from them`

---

### Task 6: Maps show the real play area; marshal setup map

**Files:**
- Modify: `app/src/game/Map.tsx`, `app/src/screens/Lobby.tsx`, `app/src/screens/HostLobby.tsx`
- Test: `app/src/game/Map.test.tsx`, `app/src/screens/HostLobby.test.tsx`, `app/src/screens/Lobby.test.tsx` (new)

**Interfaces:**
- Consumes: `Arena.holes`, `Arena.toilets`, `arena.start` (Task 1).
- Produces:
  - `GameMap` draws the following layers:
    - `holes`: white dashed line (`line-dasharray: [2, 2]`).
    - `toilets`: a symbol layer with the text `WC`, white, size 10.
    - `start`: a circle with white stroke and black fill, plus a `S` label.
  - **Setup map in the lobby:** a `<GameMap>` with the arena's stations, under the heading `Setup: where things go`. Each listed station reads `Station 1`…, followed by `Jail` and `Start`. It shows on `Lobby` when `view.me.role === 'marshal'` and always on `HostLobby`.

- [ ] **Step 1: Write the failing tests:**
  - Map: `lakes, toilets and the start are drawn on their own layers`. Use the existing MapLibre mock with `load` capture from Plan 3, and assert the layer ids and that the `holes` source has one LineString per hole.
  - Lobby: `marshals see the setup map with numbered stations; runners don't`. Mock `../game/Map`, and assert on the text `Setup: where things go` and `Station 1`.
  - HostLobby: `the organiser sees the setup map`.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx vitest run && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: maps show lakes, toilets and the start; marshal setup map`

---

### Task 7: Arena setup screen

**Files:**
- Create: `app/src/game/PlaceMap.tsx`, `app/src/screens/ArenaSetup.tsx`
- Delete: `app/src/game/AreaPicker.tsx`
- Test: `app/src/screens/ArenaSetup.test.tsx`, `app/src/game/PlaceMap.test.tsx`

**Interfaces:**
- Consumes:
  - the actions `searchParks`, `parkFeatures`, `saveArena` (Task 5);
  - `buildPlayArea`, `arenaFromDraft`, `KL_FALLBACK` (Tasks 1–2);
  - `loadOrganiserSession` (4a) for `organiserToken`.
- Produces:
  - `<PlaceMap>`, a tap map:
    ```ts
    props: {
      boundary: LatLng[] | null; holes: LatLng[][]; outline: LatLng[] | null
      circle: { center: LatLng; radiusM: number } | null
      mode: 'circle' | 'stations' | 'jail' | 'start'
      stations: LatLng[]; jail: LatLng | null; start: LatLng | null; toilets: LatLng[]
      onTap: (p: LatLng) => void
      onStationRemove: (index: number) => void   // tap within 25 px of a station in 'stations' mode
    }
    ```
    - It draws the outline faintly, the play area in white, holes dashed, the circle in lime, and numbered stations, the jail and the start.
    - It fits the map to the outline or circle when either changes.
    - It carries the existing `AreaPicker` behaviours: locate-me on open, falling back to `KL_FALLBACK`, and the 25 px station removal.
  - `<ArenaSetup onDone={(r: { arenaId?: string; draft: ArenaDraft }) => void} initial?: SavedArena>` shows these steps in one screen:
    1. **Source pills:** `Find a park` | `Circle around me`.
    2. **Find a park:**
       - A text field, then a **Search** button. Only the button calls `searchParks`; typing never does.
       - A results list (`name · 15.7 ha`).
       - Picking a result calls `parkFeatures` and shows the outline.
       - If `waterChecked` is false it shows `Couldn't check for lakes. Look at the map before saving.`
       - If the hit's `pieces > 1` it shows `Only the largest part of the park is used`.
    3. **Use part of the park** toggle, or always on for circle-around-me: radius pills `100 m`–`500 m` (the existing `SIZES`) plus `mode: 'circle'` tap to move the centre.
    4. **Place pills:** `Stations` | `Jail` | `Start`, setting the `mode`.
    5. **Live feedback:**
       - `buildPlayArea` with the area in hectares.
       - `Only the largest part of the park is used` when `pieces > 1`.
       - Any `arenaFromDraft` error shown inline, with Save disabled while there's an error.
    6. **Name** field (max 40) and two buttons:
       - `Save park` → `saveArena`, then `onDone({ arenaId, draft })`.
       - `Use once` (circle source only) → `onDone({ draft })` without saving.
    - With `initial` set (editing a saved arena), it opens on step 4 with the saved draft, and Save updates via `arenaId`.

- [ ] **Step 1: Write the failing tests** (mock `../game/api` and `../game/PlaceMap`, where the PlaceMap stand-in exposes buttons that call `onTap` with fixed points):
  - `typing a park name never searches; tapping Search does once`
  - `picking a result loads lakes and shows the area in hectares`
  - `a failed lake check shows the warning but still allows saving`
  - `Save park sends the draft with placed jail, start and stations`
  - `an error from the draft disables Save` (a jail tapped in the lake shows `Jail must be inside the play area`)
  - `Use once is offered for a circle around me and does not save`
  - PlaceMap: `taps go to onTap; a tap near a station in stations mode removes it` (reuse the MapLibre mock pattern)

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement both.** Delete `AreaPicker.tsx` and move any of its unique tests into `PlaceMap.test.tsx`.

- [ ] **Step 4: Run** `npx vitest run && npx tsc -b`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: find a park, use part of it, and place the jail, start and stations`

---

### Task 8: New-game screen uses saved parks

**Files:**
- Modify: `app/src/screens/HostNew.tsx`
- Test: `app/src/screens/HostNew.test.tsx`

**Interfaces:**
- Consumes: `listArenas`, `deleteArena`, `recheckWater`, `create` (Task 5); `ArenaSetup`, `PlaceMap` (Task 7).
- Produces: a `HostNew` play-area section with three parts.
  - **Saved parks list** (from `listArenas`), one row each: `name · 15.7 ha · 3 stations`.
    - It shows `Lakes not checked` plus a **Retry** button when `!waterChecked`. Retry calls `recheckWater`, then reloads the list, then shows any `problems`.
    - It shows the `problems` lines when present.
    - **Edit** opens `ArenaSetup` with `initial`.
    - **Delete** needs a confirm (`Delete <name>? Games already made keep their map.`).
  - **Picking a saved park:**
    - Shows a `PlaceMap` in `stations` | `jail` | `start` modes for per-game adjustment.
    - Repeats the `Lakes not checked` warning when needed.
    - Create sends `{ savedArenaId, overrides }`, where `overrides` holds only the fields that changed.
  - **New play area** opens `ArenaSetup`:
    - its `onDone` with an `arenaId` refreshes the list and selects that park;
    - with only a `draft`, Create sends `{ draft }`.
- The game settings, the laptop tip and the invite-organiser card stay as they are.

- [ ] **Step 1: Write the failing tests** (mock the api, `ArenaSetup` and `PlaceMap`):
  - `lists saved parks with size and station count`
  - `Retry rechecks the lakes and shows what needs moving`
  - `creating from a saved park sends only the overrides that changed`
  - `delete asks first and says existing games keep their map`
  - `a one-off circle from ArenaSetup creates with the draft`
  - Keep the existing `HostNew` tests passing, updating their AreaPicker mock to the new flow.

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `npx vitest run && npx tsc -b && npm run typecheck && npm run build`. Expected: PASS, and the build succeeds.

- [ ] **Step 5: Check it in the browser.** Start the `kejar-dev` preview at 375 px width with `fetch` patched to fake `listArenas`, `searchParks` and `parkFeatures` responses (the Plan 3 technique). Then:
  - search;
  - pick a park;
  - toggle the circle;
  - place points;
  - save;
  - check that nothing needs horizontal scrolling and that every control is tappable.

- [ ] **Step 6: Commit** `feat: new games start from saved parks, with per-game adjustments`

---

### Task 9: Ship and live check (owner + Claude)

- [ ] **Step 1: The owner runs `supabase/migrations/0007_arenas.sql`** in the Supabase SQL editor. Claude points to the file to copy.
- [ ] **Step 2: Merge to `main`, push,** and wait for the new `/assets/index-*.js`.
- [ ] **Step 3: Run a scripted live check** against `https://kejar-eosin.vercel.app/api/game` with an organiser token the owner provides or creates through the bootstrap script. Never print the token.
  - `searchParks "KLCC Park"` returns a ~15.7 ha hit.
  - `parkFeatures` reports `waterChecked: true` with at least one hole (Lake Symphony).
  - `saveArena` returns an id.
  - `create { savedArenaId }` creates the game.
  - A runner location in the middle of Lake Symphony is more than 20 m from the shore and raises an `outside` alert.
  - The same search repeated is served from the cache: the second call returns quickly, and an `osm_cache` row exists (the owner checks in Supabase).
- [ ] **Step 4: Update `docs/HANDOFF.md`.** Plan 4b is done, `0007` has been applied, and the endgame shrink can reuse `buildPlayArea` with a smaller circle. Commit and push.
