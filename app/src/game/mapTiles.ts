import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { kejarMapStyle, ownMapStyle } from './mapStyle'

export type MapTiles = 'own' | 'openfreemap'

/** Our Malaysia + Singapore map file on Cloudflare R2. Unset (tests, old deploys): OpenFreeMap only. */
export const MAP_FILE: string = import.meta.env.VITE_MAP_FILE ?? ''

let tiles: MapTiles = MAP_FILE ? 'own' : 'openfreemap'

/** Which tiles the next map should use. Our file unless it's unset or has failed in this visit. */
export function mapTiles(): MapTiles {
  return tiles
}

/** Our file didn't load: every map from now on uses OpenFreeMap. */
export function ownTilesFailed() {
  tiles = 'openfreemap'
}

export function styleFor(t: MapTiles) {
  return t === 'own' ? ownMapStyle(MAP_FILE) : kejarMapStyle
}

/** True when a map error came from our own file (so the next map should fall back). */
export function isOwnTilesError(t: MapTiles, e: unknown) {
  return t === 'own' && (e as { sourceId?: string } | undefined)?.sourceId === 'omt'
}

/** Checks our file's first bytes once, early, so a map opened later already knows whether to fall back. */
export async function checkOwnTiles(url: string = MAP_FILE, fetcher: typeof fetch = fetch): Promise<MapTiles> {
  if (!url) return 'openfreemap'
  try {
    const r = await fetcher(url, { headers: { Range: 'bytes=0-6' }, signal: AbortSignal.timeout(6000) })
    if (r.ok && (await r.text()).startsWith('PMTiles')) return 'own'
  } catch {
    // fall through
  }
  ownTilesFailed()
  return 'openfreemap'
}

if (MAP_FILE) {
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  void checkOwnTiles()
}
