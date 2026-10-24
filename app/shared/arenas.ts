import { circlePolygon, distanceM } from './geo.js'
import { MAX_STATIONS } from './ids.js'
import type { Arena, LatLng } from './types.js'

/**
 * Hardcoded test arenas until arena setup lands (plan 4).
 * Titiwangsa coordinates are APPROXIMATE — check them on a map and edit before a real game.
 */
export const ARENAS: Record<string, Arena> = {
  titiwangsa: {
    id: 'titiwangsa',
    name: 'Taman Tasik Titiwangsa (test)',
    boundary: [
      { lat: 3.1838, lng: 101.7042 },
      { lat: 3.1840, lng: 101.7090 },
      { lat: 3.1812, lng: 101.7118 },
      { lat: 3.1768, lng: 101.7112 },
      { lat: 3.1742, lng: 101.7080 },
      { lat: 3.1748, lng: 101.7030 },
      { lat: 3.1790, lng: 101.7016 },
    ],
    jail: { lat: 3.1762, lng: 101.7046 },
    start: { lat: 3.1762, lng: 101.7046 },
  },
}

/** A circular arena around the organiser — handy for testing anywhere. */
export function arenaAroundPoint(center: LatLng, radiusM = 200, stations: LatLng[] = []): Arena {
  if (stations.length > MAX_STATIONS) throw new Error(`At most ${MAX_STATIONS} stations`)
  if (stations.some((s) => distanceM(center, s) > radiusM)) throw new Error('Stations must be inside the play area')
  return {
    id: 'around-me',
    name: 'Around the organiser',
    boundary: circlePolygon(center, radiusM),
    jail: { ...center },
    start: { ...center },
    stations: stations.map((s) => ({ lat: s.lat, lng: s.lng })),
  }
}
