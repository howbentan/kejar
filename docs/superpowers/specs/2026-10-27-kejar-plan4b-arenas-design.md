# Kejar Plan 4b: real park outlines and a saved arena library

**Status:** Draft for the owner's review (2026-10-27).
**Part of:** Plan 4 (arena setup), piece 2. Piece 1, Plan 4a, is already built: organiser accounts, invites and marshal links (`2026-10-26-kejar-plan4a-organiser-accounts-design.md`).
**Related:**
- `2026-10-19-kejar-design.md`: base design. §5 and §5.1 cover safety; §4.8.1 covers stations.
- `2026-10-26-kejar-endgame-intensity-design.md`: the shrinking-zone idea this has to leave room for.
- `docs/HANDOFF.md`.

## 1. Why

Today every game's play area is a plain circle (100–500 m radius) around a point the organiser picks. The jail and start point both sit at the circle's centre, and stations are tapped in fresh for every game.

Real parks aren't circles. At Titiwangsa or KLCC, a circle takes in lakes and roads. The Plan 3 "left the play area" marshal alert is only as good as the boundary it checks against: a circle can't warn anyone heading for Jalan Kuantan, and it counts a lake as playable ground.

The owner also runs games at the same few parks repeatedly, so setting up a park should happen once.

The owner's own words on the approach:
- Don't make organisers draw on a phone.
- Annotate stations by tapping their exact spots, and have marshals place the QR codes there.

## 2. Goals

1. **Real park shapes, with no drawing.**
   - The organiser types a park name and taps Search. The app pulls the park's real outline from OpenStreetMap, with mapped lakes and ponds cut out.
   - The organiser checks it on the map and taps Use.
2. **Use part of a big park.**
   - The organiser can drop the existing size circle (100–500 m radius) onto the park.
   - The play area becomes where the park and the circle overlap.
   - This is how the KL Sports City grounds (85 ha) or half of Taman Rekreasi Bukit Jalil get used.
3. **Tap to place** the jail, the start point and the 0–8 power-up stations on the play area.
4. **Save once, reuse every game.**
   - Each saved park ("arena") belongs to the organiser's organisation, so every organiser in it can pick it from a list.
   - Picking a saved arena makes creating a game a few taps.
5. **A setup map for marshals.** Before the game, marshals can open a map on their own phones showing where each numbered station QR card goes, plus the jail and the start point.
6. **Toilets marked on the map** wherever OpenStreetMap has them, which supports the code-of-conduct rule against following anyone into a toilet.
7. **Ready for the endgame.**
   - The rule "the play area is the park, minus water, overlapped with a circle" must be one reusable piece of shared code.
   - A later shrinking-zone feature should be able to reuse it unchanged, passing a smaller circle over time.

## 3. Non-goals

- **Walk-only zones.** These become a rule in the code of conduct and the marshal briefing (owner's decision).
- **Hand-drawn no-go areas, and drawing or tracing outlines by hand,** on a phone or anywhere else.
- **Uploading a photo or image of a park map to trace from.** Discussed and rejected: a photo has no real-world coordinates, lining it up is fiddlier than drawing, and AI tracing would cost money and still need checking.
- **The shrinking endgame zone itself.** That's separate work; this plan only leaves room for it.
- **A play-area size guide or player-count hints.** Offered and declined by the owner.
- **Raising the 500 m circle limit.** The owner kept 500 m as the maximum.
- **Editing an imported outline point by point.** If an outline is wrong, delete the arena and re-import it, or use a circle.

## 4. Anti-goals (would make this a failure even if it technically works)

- **Setup that's fiddly on a phone.** Every step must work with taps on a 375 px wide screen, and nothing should need precise dragging.
- **Breaking OpenStreetMap's rules for their free search service** ([policy](https://operations.osmfoundation.org/policies/nominatim/)): no search-as-you-type, no more than 1 request per second app-wide, an identifying User-Agent or Referer, cached results, and visible attribution. Getting the app blocked would break game setup.
- **Changing a running or finished game.** Editing or deleting a saved arena must never affect a game that's running or already finished.
- **Weakening safety alerts.** Lakes inside a park must count as outside the play area for the "left the play area" alert. Existing alert rules (more than 20 m outside, re-armed once back inside) stay as they are.

## 5. How it works (decided)

### 5.1 Creating a game: three ways to get a play area
On the new-game screen the organiser picks one of:
1. **Saved parks.** A list of their organisation's arenas. Picking one skips straight to game settings, with stations, jail and start already placed.
   - The organiser can still move the stations, jail and start point for this game only (**Claude's call**).
   - Those moves are never written back to the saved arena. To change the park itself, they edit the saved arena (§5.5).
   - The server re-checks every point against the arena's play area.
2. **Find a park.**
   - Type a name, then tap **Search**. There are no live suggestions.
   - Pick a result from the list (name and area shown).
   - The outline appears on the map with lakes cut out, and the area is shown in hectares.
   - Optionally drop the size circle on it (see 5.2).
   - Place the jail, start and stations (see 5.3).
   - Name it and save it.
3. **Circle around me.** Today's flow, kept as the fallback for unmapped places.

A "Circle around me" area can also be saved as an arena, with its stations, jail and start (**Claude's call**). That way a park OpenStreetMap doesn't have still gets the save-once benefit.

### 5.2 Using part of a park
- After importing, the organiser can turn on **"Use part of the park"**. This shows the existing size circle (100–500 m radius, centre placed by tapping).
- The play area is the overlap of the park (minus water) and the circle.
- If the overlap comes out as several separate pieces, keep only the largest piece and say so on screen (**Claude's call**). A play area split across a road is unsafe and confusing.
- If a park without a circle is larger than a 500 m circle (about 79 ha), the app requires a circle (**Claude's call**, following the owner's decision to keep 500 m as the maximum).

### 5.3 Placing points
- Tap to place the **jail** and the **start point**. Both default to a point inside the play area until moved.
- Tap to place **stations** (0–8), as today. They're numbered in placement order, and tapping one removes it.
- Every point must sit inside the final play area, not in water. Points that fall outside are rejected with a clear message, and the server checks this too.

### 5.4 Where the outline comes from (OpenStreetMap)
- **Search** goes through the existing server function (`api/game.ts`, new actions), not straight from the browser. That gives one place to set the User-Agent, cache results and keep to 1 request per second.
  - Results are limited to Malaysia (`countrycodes=my`).
  - Only area results are shown (parks, sports grounds and the like), not points.
- **Outline:** the chosen place's polygon. Parks mapped as several separate pieces (MultiPolygons) are allowed; the largest piece is used and the organiser is told.
- **Water and toilets:** a second lookup (Overpass) finds `natural=water` areas and `amenity=toilets` inside the outline.
  - Water features smaller than 0.05 ha (fountains, small pools) are ignored (**Claude's call**).
  - If the water lookup fails or times out, import the outline without cut-outs and tell the organiser "Couldn't check for lakes. Look at the map before saving." Toilets are then simply left off.
  - An arena saved this way is marked **"lakes not checked"** (**Claude's call**):
    - The saved-arena list shows the mark, with a **Retry** button. Retry re-runs the lookup, recomputes the play area and re-checks that the jail, start and stations are still on dry land inside it. It points out any that need moving.
    - Creating a game from that arena repeats the warning.
    - The mark clears once a lookup succeeds.
- **Attribution:** "© OpenStreetMap contributors" is visible on every map. The map tiles already show it.

Checked against the owner's candidate parks (2026-10-27):

| Park | Outline | Water |
|---|---|---|
| KLCC Park | 161 points, 15.7 ha | Lake Symphony mapped |
| Taman Tasik Titiwangsa | 98 points, 39.7 ha | Tasik Barat 10.8 ha and Tasik Timur 3.9 ha mapped |
| Taman Rekreasi Bukit Jalil | 29 points, 31.7 ha | Water lookup timed out; retry when building |
| KL Sports City | 85 ha | Needs a circle |
| TM Stadium Nasional | 5 ha | The building only |

### 5.5 Saved arenas and games
- A saved arena belongs to an **organisation** (from Plan 4a). Every organiser in that organisation can list it, use it, rename it, re-place its points and delete it.
- A game **copies** the arena when it's created, as it does today (`games.arena` JSON). Later edits or deletion of the saved arena never touch existing games.
- The hardcoded test arena (`ARENAS.titiwangsa`, with approximate coordinates) is retired (**Claude's call**).

### 5.6 What players and marshals see
- Every map draws the real play-area outline, with lakes shown as outside it.
- Toilets appear as small markers for everyone.
- **Marshal setup map:** marshals and the organiser get a "Setup" map in the lobby. It shows numbered stations, the jail and the start point, so each marshal knows where each QR card goes. A marshal can open it before the game starts.

### 5.7 Rules that use the play area
- **"Left the play area"** (§5.1 of the base spec): the distance outside is measured against the final play area, with lakes counting as outside. The thresholds are unchanged: alert when more than 20 m outside, re-armed once back inside.
- **The Decoy power-up's fake spot,** station placement and jailbreak distances use the same play area.
- All of this goes through **one shared play-area helper**. The endgame shrinking zone will later supply a smaller circle to the same helper.

## 6. Constraints

- **Free tiers only.** OpenStreetMap's public Nominatim and Overpass services, Supabase and Vercel Hobby (12 functions max), with everything on the existing `api/game.ts` router.
- **Brand colours:** Volt `#C6FF3D`, black and white only. The play-area outline stays thin white; lakes read as outside; toilets are a small neutral marker.
- **Maps:** MapLibre v5 with the existing dark OpenFreeMap style.
- **Server:** shared rules stay as pure code in `app/shared/` (`.js` import extensions); all database access goes through the `GameStore` interface, with both the `MemoryStore` and `SupabaseStore` implementations.
- **Database changes:** a new numbered migration. The owner runs it in Supabase by hand. RLS stays on with no policies, as on every other table.
- **Data licence:** OpenStreetMap data is ODbL, so attribution is required. Saved arenas are a small extract, which is fine.

## 7. Left to the builder

- The polygon library: `@turf/intersect` and `@turf/difference`, or `polyclip-ts`. Pick on bundle size and robustness with real park shapes.
- How the play area is stored in the arena JSON: an outer ring plus holes, or GeoJSON. Existing code reads `arena.boundary` as one ring, so either migrate every reader or add a field and keep `boundary` as the outer ring.
- Where the OpenStreetMap search cache lives (a small table, or in the saved arena only) and how the 1-per-second limit is enforced across server instances.
- How the default jail and start positions are chosen inside the play area.
- The exact screen layout, as long as everything is reachable by tapping on a phone.
