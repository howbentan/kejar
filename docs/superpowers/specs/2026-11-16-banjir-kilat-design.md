# Banjir Kilat (the flood): the fourth endgame

Settled with the owner in chat on 2026-11-16. This completes §10 of `2026-11-13-kejar-endgame-design.md`.

## Rules (decided by the owner)

- **Rolling it:** Banjir Kilat is one of the endgames the roll can pick (Full only, one endgame per game). It is on by default for new games.
- **The reveal:** it is revealed at **10 minutes left**. A random spot inside the play area is chosen and shown on the map, and the dry land is a circle around it.
- **How the water rises:** in **4 steps**, at **8, 6, 4 and 2 minutes left**. Before each step, the next waterline shows on the map **60 s** ahead. After the last step, about a **quarter** of the play area is still dry.
- **Getting caught in the water:** a free runner standing in the water has **30 s** to get back onto dry land. If they're still in the water after that, they go to **Penjara**, rescuable as usual. Super Ring gives house arrest instead, as for any route into Penjara.
- **Who it applies to:** chasers aren't affected and can wade in. Jailed runners aren't affected either.
- **Penjara** has no exception and can end up under water. Its rescue works as before: the 10-second hold fits inside a rescuer's 30 s.

## Claude's calls

- **The water is not Luar Garisan.** It never counts as leaving the play area, and never fires the marshals' outside alerts.
- **Stations under water close.** A claim there gets "That station is under water." A hidden legendary card under water can still be scanned.
- **Pausing** freezes the steps, because they sit on the pause-free clock and are then mapped to wall time, as Bomba's pings are. It also freezes a runner's 30 s.
- **The spot comes from the game's secret deck seed.** It is never sent before the reveal (masked like every endgame). No reveal-time storage is needed: the server works the spot out again whenever it needs it.
- **Sizes:**
  - The starting circle covers the whole play area: its radius is the distance from the spot to the farthest boundary point.
  - The final radius gives a circle of a quarter of the play area's size.
  - The steps shrink the radius in four equal amounts.
  - The spot is picked from random points inside the play area, preferring one far enough from the edge for the final circle to fit.
- **When someone counts as in the water:** a usable fix (50 m accuracy or better) more than 10 m beyond the current waterline.
  - The first such fix starts the runner's 30 s (`players.flooded_at`) and pushes a warning.
  - A usable fix back on dry land clears it.
  - A fix still in the water 30 s or more after the start (pauses not counted) sends them to Penjara.
  - A runner whose phone goes quiet is never jailed for silence.
- **Migration `0023_banjir.sql`** adds `players.flooded_at`.

## What players see

- **The takeover:** "Banjir kilat! The water rises at 8, 6, 4 and 2 min left. Caught in it for 30 s: Penjara."
- **The map:** the water drawn blue over the flooded part of the play area. During the 60 s warning, the next waterline shows as a dashed line.
- **A runner in the water** gets a blue banner, "Banjir! Get to dry land · 0:27", and a push.
- **Feed lines:**
  - for each step: "The water's rising. Dry land shrinks in 60 s." and "The water rose."
  - for a jailing: "{tag} got caught in the flood, sent to Penjara."
- **The Penjara ticket** reads "CAUGHT IN THE FLOOD".
