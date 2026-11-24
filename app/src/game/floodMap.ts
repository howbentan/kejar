import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { clipToCircle, type FloodNow } from '../../shared/flood.js'
import { circlePolygon } from '../../shared/geo.js'
import type { Arena } from '../../shared/types.js'

/** Banjir Kilat's colour, as the CSS token --banjir. */
export const BANJIR = '#3D8BFD'

const ring = (points: { lat: number; lng: number }[]): number[][] => {
  const coords = points.map((p) => [p.lng, p.lat])
  return [...coords, coords[0]]
}
const collection = (features: Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features })

/**
 * Banjir Kilat on the map (design 2026-11-16): the flooded part of the play area (the play area with the dry land cut
 * out as a hole), its waterline (where the foam goes), and, in the 60 s before a rise, the next waterline as a line.
 * Nothing before the first rise.
 */
export function floodFeatures(arena: Pick<Arena, 'boundary'>, f: Pick<FloodNow, 'center' | 'radiusM' | 'step' | 'next' | 'warning'> | null) {
  const water: Feature<Geometry>[] = []
  const next: Feature<Geometry>[] = []
  const shore: Feature<Geometry>[] = []
  if (f && f.step > 0) {
    const dry = clipToCircle(arena.boundary, f.center, f.radiusM)
    water.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(arena.boundary), ring([...dry].reverse())] } })
    shore.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(dry) } })
  }
  if (f?.warning && f.next) {
    next.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(circlePolygon(f.center, f.next.radiusM, 64)) } })
  }
  return { water: collection(water), next: collection(next), shore: collection(shore) }
}
