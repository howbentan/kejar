import type { LatLng } from './types.js'

const EARTH_RADIUS_M = 6_371_000
const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Ray casting; treats lng as x and lat as y (fine at park scale). */
export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const crosses = a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (crosses) inside = !inside
  }
  return inside
}

/** 0 inside the polygon; otherwise metres to its nearest edge (flat projection, fine at park scale). */
export function distanceOutsideM(p: LatLng, poly: LatLng[]): number {
  if (poly.length < 3 || pointInPolygon(p, poly)) return 0
  const k = Math.cos(rad(p.lat))
  const xy = (q: LatLng) => ({ x: rad(q.lng - p.lng) * k * EARTH_RADIUS_M, y: rad(q.lat - p.lat) * EARTH_RADIUS_M })
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = xy(poly[j])
    const b = xy(poly[i])
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    // Closest point on segment ab to the origin (where p sits).
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2))
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy))
  }
  return best
}

/** The point `distM` metres from `from` along `bearingRad` (0 = north). */
export function offset(from: LatLng, distM: number, bearingRad: number): LatLng {
  const d = distM / EARTH_RADIUS_M
  const lat1 = rad(from.lat)
  const lng1 = rad(from.lng)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad))
  const lng2 =
    lng1 + Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: deg(lat2), lng: deg(lng2) }
}

export function circlePolygon(center: LatLng, radiusM: number, sides = 24): LatLng[] {
  return Array.from({ length: sides }, (_, i) => offset(center, radiusM, (2 * Math.PI * i) / sides))
}

/** FNV-1a 32-bit. */
export function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic offset of at most `radiusM`, so the same runner and ping always fuzz the same way. */
export function fuzz(p: LatLng, radiusM: number, seed: string): LatLng {
  const h = hash(seed)
  const angle = ((h & 0xffff) / 0x10000) * 2 * Math.PI
  const dist = ((h >>> 16) / 0x10000) * radiusM
  return offset(p, dist, angle)
}
