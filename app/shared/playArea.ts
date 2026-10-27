import { difference, intersection, type Geom } from 'polyclip-ts'
import { circlePolygon, distanceOutsideM, distanceToEdgeM, pointInPolygon } from './geo.js'
import type { Arena, LatLng } from './types.js'

/** Spec (Plan 4b §5.2): nothing bigger than a 500 m circle. */
export const MAX_PLAY_AREA_HA = (Math.PI * 500 ** 2) / 10_000
/** Fountains and small pools aren't worth cutting out (§5.4). */
export const MIN_WATER_HA = 0.05

type Ring = [number, number][]
type Area = Pick<Arena, 'boundary' | 'holes'>

const toRing = (pts: LatLng[]): Ring => pts.map((p) => [p.lng, p.lat])
/** polyclip closes its rings; ours stay open like the rest of the app's polygons. */
function fromRing(ring: Ring): LatLng[] {
  const [first, last] = [ring[0], ring[ring.length - 1]]
  const open = ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
  return open.map(([lng, lat]) => ({ lat, lng }))
}

/** Area of a ring in hectares, on a flat projection (fine at park scale). */
export function ringAreaHa(ring: LatLng[]): number {
  if (ring.length < 3) return 0
  const k = Math.cos((ring[0].lat * Math.PI) / 180)
  const M = 111_195
  let twice = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += ring[j].lng * k * M * (ring[i].lat * M) - ring[i].lng * k * M * (ring[j].lat * M)
  }
  return Math.abs(twice) / 2 / 10_000
}

const polygonHa = (rings: LatLng[][]) => ringAreaHa(rings[0]) - rings.slice(1).reduce((sum, h) => sum + ringAreaHa(h), 0)

/**
 * The play area: the park (or the circle on its own), minus water, overlapped with the circle when
 * both are given. Keeps the largest piece if the cut leaves several. The endgame shrink reuses this
 * with a smaller circle.
 */
export function buildPlayArea(i: {
  outline: LatLng[] | null
  water: LatLng[][]
  circle: { center: LatLng; radiusM: number } | null
}): { boundary: LatLng[]; holes: LatLng[][]; areaHa: number; pieces: number } {
  const circle = i.circle ? circlePolygon(i.circle.center, i.circle.radiusM, 48) : null
  const base = i.outline ?? circle
  if (!base) throw new Error('Nothing left to play on')
  const water = i.water.filter((w) => ringAreaHa(w) >= MIN_WATER_HA).map((w) => [toRing(w)])

  let shape: Geom = [[toRing(base)]]
  if (water.length) shape = difference(shape, ...water)
  if (i.outline && circle) shape = intersection(shape, [toRing(circle)])

  const polygons = (shape as Ring[][]).map((rings) => rings.map(fromRing)).filter((rings) => rings[0].length >= 3)
  if (polygons.length === 0) throw new Error('Nothing left to play on')
  const largest = polygons.reduce((a, b) => (polygonHa(b) > polygonHa(a) ? b : a))
  return { boundary: largest[0], holes: largest.slice(1), areaHa: polygonHa(largest), pieces: polygons.length }
}

export function inPlayArea(p: LatLng, a: Area): boolean {
  return pointInPolygon(p, a.boundary) && !(a.holes ?? []).some((h) => pointInPolygon(p, h))
}

/** 0 inside the play area; otherwise metres to the nearest dry edge (the shore, if in a lake). */
export function distanceOutsidePlayArea(p: LatLng, a: Area): number {
  if (!pointInPolygon(p, a.boundary)) return distanceOutsideM(p, a.boundary)
  const hole = (a.holes ?? []).find((h) => pointInPolygon(p, h))
  return hole ? distanceToEdgeM(p, hole) : 0
}

/** A sensible spot for the jail or start: the middle, or the nearest dry point out from it. */
export function defaultPoint(a: Area): LatLng {
  const n = a.boundary.length
  const mid = {
    lat: a.boundary.reduce((s, p) => s + p.lat, 0) / n,
    lng: a.boundary.reduce((s, p) => s + p.lng, 0) / n,
  }
  if (inPlayArea(mid, a)) return mid
  const edge = a.boundary[0]
  for (let k = 1; k <= 24; k++) {
    const t = k / 25
    const p = { lat: mid.lat + (edge.lat - mid.lat) * t, lng: mid.lng + (edge.lng - mid.lng) * t }
    if (inPlayArea(p, a)) return p
  }
  return edge
}
