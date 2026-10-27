import { arenaFromDraft } from './arenaDraft.js'
import type { Arena, LatLng } from './types.js'

/** A circular arena around the organiser — the quick option when a park isn't saved yet. */
export function arenaAroundPoint(center: LatLng, radiusM = 200, stations: LatLng[] = []): Arena {
  try {
    return arenaFromDraft(
      {
        name: 'Around the organiser',
        source: 'circle',
        osmRef: null,
        outline: null,
        circle: { center, radiusM },
        water: [],
        toilets: [],
        waterChecked: true,
        jail: { ...center },
        start: { ...center },
        stations,
      },
      'around-me',
    )
  } catch (e) {
    // Older callers expect one message for any misplaced station.
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(/^Station \d+ must be inside/.test(message) ? 'Stations must be inside the play area' : message)
  }
}
