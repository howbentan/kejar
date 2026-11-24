import { describe, expect, it } from 'vitest'
import { boardFeatures } from './boardMap'

// A square about 200 m a side.
const d = 200 / 111_320
const arena = {
  boundary: [
    { lat: 3, lng: 101 },
    { lat: 3, lng: 101 + d },
    { lat: 3 + d, lng: 101 + d },
    { lat: 3 + d, lng: 101 },
  ],
  jail: { lat: 3.0005, lng: 101.0005 },
  start: { lat: 3.001, lng: 101.001 },
}

describe('boardFeatures', () => {
  const b = boardFeatures(arena)

  it('covers everything outside the arena, with the arena as the hole', () => {
    const poly = b.outside.features[0].geometry as GeoJSON.Polygon
    expect(poly.coordinates).toHaveLength(2)
    expect(poly.coordinates[1]).toHaveLength(5)
  })

  it('ticks the edge every 22 m, pointing outward, with an "out" on every fourth', () => {
    // 800 m round: about 36 ticks.
    expect(b.ticks.features.length).toBeGreaterThanOrEqual(35)
    expect(b.ticks.features.length).toBeLessThanOrEqual(38)
    expect(b.labels.features.length).toBe(Math.ceil((b.ticks.features.length - 1) / 4))
    // The first tick is on the bottom edge (lat 3), so it points further south.
    const [from, to] = (b.ticks.features[0].geometry as GeoJSON.LineString).coordinates
    expect(to[1]).toBeLessThan(from[1])
  })

  it('stamps Penjara and the start on their spots', () => {
    expect(b.stamps.features.map((f) => f.properties)).toEqual([
      { image: 'stamp-penjara', rotate: -9 },
      { image: 'stamp-start', rotate: 7 },
    ])
  })

  it('dims a lake cut out of the arena too, since it is out of bounds', () => {
    const lake = [
      { lat: 3.0004, lng: 101.0004 },
      { lat: 3.0004, lng: 101.0008 },
      { lat: 3.0008, lng: 101.0008 },
    ]
    const withLake = boardFeatures({ ...arena, holes: [lake] })
    expect(withLake.outside.features).toHaveLength(2)
    expect((withLake.outside.features[1].geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(4)
  })

  it('draws no outside for an arena that is not a shape yet', () => {
    expect(boardFeatures({ ...arena, boundary: arena.boundary.slice(0, 2) }).outside.features).toEqual([])
  })
})
