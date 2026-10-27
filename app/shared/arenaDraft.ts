import { MAX_STATIONS } from './ids.js'
import { buildPlayArea, defaultPoint, inPlayArea, MAX_PLAY_AREA_HA } from './playArea.js'
import type { Arena, LatLng } from './types.js'

/** Where maps open when the phone can't say where it is (KLCC). */
export const KL_FALLBACK: LatLng = { lat: 3.1579, lng: 101.7116 }

/**
 * Everything an organiser chose for a play area, before it's turned into an Arena. Saved arenas keep
 * their draft so the lakes can be re-checked later and the area rebuilt.
 */
export interface ArenaDraft {
  name: string
  source: 'osm' | 'circle'
  /** e.g. 'way/10590000' */
  osmRef: string | null
  /** The park's outline; required when source is 'osm'. */
  outline: LatLng[] | null
  /** Use only the part of the park inside this circle; required when source is 'circle'. */
  circle: { center: LatLng; radiusM: number } | null
  water: LatLng[][]
  toilets: LatLng[]
  waterChecked: boolean
  /** null = put it somewhere sensible inside the play area. */
  jail: LatLng | null
  start: LatLng | null
  stations: LatLng[]
}

const outside = (what: string) => `${what} must be inside the play area`

/** The places that aren't inside the play area (or are in a lake), in the order an organiser fixes them. */
export function pointProblems(arena: Arena): string[] {
  const problems: string[] = []
  if (!inPlayArea(arena.jail, arena)) problems.push(outside('Jail'))
  if (!inPlayArea(arena.start, arena)) problems.push(outside('Start'))
  ;(arena.stations ?? []).forEach((s, k) => {
    if (!inPlayArea(s, arena)) problems.push(outside(`Station ${k + 1}`))
  })
  return problems
}

/** Builds and checks an arena; throws an Error with the message to show the organiser. */
export function arenaFromDraft(d: ArenaDraft, id: string): Arena {
  const name = d.name.trim()
  if (name.length < 1 || name.length > 40) throw new Error('Give the park a name')
  if (d.circle && (!(d.circle.radiusM >= 100) || d.circle.radiusM > 500)) {
    throw new Error('Play area must be 100–500 m across from the centre')
  }
  if (d.source === 'osm' && !d.outline) throw new Error('Pick a park first')
  if (d.source === 'circle' && !d.circle) throw new Error('Pick a centre for the circle')
  if (d.stations.length > MAX_STATIONS) throw new Error(`At most ${MAX_STATIONS} stations`)

  const area = buildPlayArea({ outline: d.source === 'osm' ? d.outline : null, water: d.water, circle: d.circle })
  if (area.areaHa > MAX_PLAY_AREA_HA) throw new Error('Too big — use part of the park (circle)')
  const shape = { boundary: area.boundary, holes: area.holes }
  const arena: Arena = {
    id,
    name,
    ...shape,
    jail: d.jail ?? defaultPoint(shape),
    start: d.start ?? defaultPoint(shape),
    stations: d.stations.map((s) => ({ lat: s.lat, lng: s.lng })),
    toilets: d.toilets.filter((t) => inPlayArea(t, shape)),
  }
  const [problem] = pointProblems(arena)
  if (problem) throw new Error(problem)
  return arena
}
