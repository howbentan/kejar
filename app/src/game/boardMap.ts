import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Arena, LatLng } from '../../shared/types.js'

/** Game board (design 2026-11-24 §1): a tick every this many metres along the edge, and an "out" on every fourth. */
export const TICK_EVERY_M = 22
const TICK_M = 6
const LABEL_M = 16
const M_PER_DEG = 111_320

type Pt = [number, number]
const collection = (features: Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features })
const closed = (b: LatLng[]): Pt[] => [...b, b[0]].map((p) => [p.lng, p.lat])
const WORLD: Pt[] = [[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]]

/**
 * The board's shapes for an arena: everything outside the boundary (to dim and hatch), short ticks pointing out of
 * the edge, the "out" labels just beyond some of them, and the spots for the Penjara and start stamps.
 */
export function boardFeatures(arena: Pick<Arena, 'boundary' | 'jail' | 'start'>) {
  const b = arena.boundary
  const pts = closed(b)
  const cx = b.reduce((s, p) => s + p.lng, 0) / b.length
  const cy = b.reduce((s, p) => s + p.lat, 0) / b.length
  const ticks: Feature<Geometry>[] = []
  const labels: Feature<Geometry>[] = []
  let carry = 0
  let n = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, c] = [pts[i], pts[i + 1]]
    const len = Math.hypot((c[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), c[1] - a[1]) * M_PER_DEG
    let d = carry
    for (; d < len; d += TICK_EVERY_M) {
      const t = d / len
      const p: Pt = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]
      const vl = Math.hypot(p[0] - cx, p[1] - cy) || 1
      const out = (m: number): Pt => [p[0] + ((p[0] - cx) / vl) * (m / M_PER_DEG), p[1] + ((p[1] - cy) / vl) * (m / M_PER_DEG)]
      ticks.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [p, out(TICK_M)] } })
      if (n++ % 4 === 1) labels.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: out(LABEL_M) } })
    }
    carry = d - len
  }
  const point = (p: LatLng, image: string, rotate: number): Feature<Geometry> => ({
    type: 'Feature',
    properties: { image, rotate },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  })
  return {
    outside: collection(b.length >= 3 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, pts] } }] : []),
    ticks: collection(ticks),
    labels: collection(labels),
    stamps: collection([point(arena.jail, 'stamp-penjara', -9), point(arena.start, 'stamp-start', 7)]),
  }
}
