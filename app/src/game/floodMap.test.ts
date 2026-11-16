import type { LineString, Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import { circlePolygon, distanceM } from '../../shared/geo.js'
import { floodFeatures } from './floodMap'

const C = { lat: 3.0, lng: 101.0 }
const arena = { boundary: circlePolygon(C, 300, 48) }
const f = (step: number, warning: boolean) => ({ center: C, radiusM: 300 - step * 50, step, next: step < 4 ? { at: 0, warnAt: 0, radiusM: 250 - step * 50 } : null, warning })

describe('floodFeatures', () => {
  it('draws nothing before the first rise, and nothing at all without a flood', () => {
    expect(floodFeatures(arena, null).water.features).toHaveLength(0)
    expect(floodFeatures(arena, f(0, false)).water.features).toHaveLength(0)
  })

  it('draws the water as the play area with the dry land cut out', () => {
    const w = floodFeatures(arena, f(2, false)).water.features
    expect(w).toHaveLength(1)
    const [outer, hole] = (w[0].geometry as Polygon).coordinates
    expect(outer).toHaveLength(arena.boundary.length + 1)
    for (const [lng, lat] of hole) expect(distanceM(C, { lat, lng })).toBeLessThanOrEqual(201)
  })

  it('shows the next waterline only in the minute before a rise', () => {
    expect(floodFeatures(arena, f(1, false)).next.features).toHaveLength(0)
    const line = floodFeatures(arena, f(1, true)).next.features[0].geometry as LineString
    const [lng, lat] = line.coordinates[0]
    expect(distanceM(C, { lat, lng })).toBeCloseTo(200, 0)
    expect(floodFeatures(arena, f(4, true)).next.features).toHaveLength(0)
  })
})
