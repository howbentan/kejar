import type { Arena, LatLng } from '../../shared/types.js'
import type { MapDot } from '../../shared/views.js'

/** The wave takes this long to reach the edge of the map (motion design §8.1). */
export const RIPPLE_MS = 1_500

/**
 * When the wave passes a circle `distanceM` from the origin. The wave's radius eases out
 * (`1 − (1 − t)³`), so this inverts it: near circles appear first and quickly.
 */
export function revealDelay(distanceM: number, maxM: number): number {
  if (maxM <= 0 || distanceM >= maxM) return RIPPLE_MS
  const t = 1 - Math.cbrt(1 - Math.max(0, distanceM) / maxM)
  return t * RIPPLE_MS
}

/** The wave starts from my own dot, else from the middle of the play area (a marshal without GPS). */
export function rippleOrigin(dots: MapDot[], arena: Arena): LatLng {
  const me = dots.find((d) => d.kind === 'me')
  if (me) return { lat: me.lat, lng: me.lng }
  const b = arena.boundary ?? []
  if (b.length === 0) return arena.start
  return { lat: b.reduce((s, p) => s + p.lat, 0) / b.length, lng: b.reduce((s, p) => s + p.lng, 0) / b.length }
}
