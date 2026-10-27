import { hash } from '../../shared/geo.js'
import { MIN_WATER_HA, ringAreaHa } from '../../shared/playArea.js'
import type { LatLng } from '../../shared/types.js'

/**
 * OpenStreetMap lookups for park setup. Server-side only, so the app keeps to the public services'
 * rules (https://operations.osmfoundation.org/policies/nominatim/): an identifying User-Agent, no
 * search-as-you-type (searches only run when the organiser taps Search), at most one Nominatim
 * request a second, and every answer cached.
 */
export type FetchJson = (
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
) => Promise<unknown>

export interface OsmCache {
  get(key: string): Promise<unknown | null>
  put(key: string, body: unknown): Promise<void>
}

export interface ParkHit {
  osmRef: string
  name: string
  areaHa: number
  outline: LatLng[]
  /** More than 1: the park is mapped in several pieces and only the largest is used. */
  pieces: number
}

interface Deps {
  fetchJson: FetchJson
  cache: OsmCache
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export const OSM_USER_AGENT = 'Kejar/1.0 (https://kejar-eosin.vercel.app)'
export const OSM_CACHE_MS = 30 * 24 * 3600_000
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_GAP_MS = 1_000
/** Lakes are traced at full detail; this many points is plenty for "is a runner in the water?". */
const MAX_WATER_POINTS = 1_000

let lastNominatimAt = -Infinity
/** Searches in this process take turns, so ones arriving together still go out a second apart. */
let nominatimTurn: Promise<void> = Promise.resolve()

const toLatLng = ([lng, lat]: number[]): LatLng => ({ lat, lng })
const openRing = (ring: LatLng[]) =>
  ring.length > 1 && ring[0].lat === ring.at(-1)!.lat && ring[0].lng === ring.at(-1)!.lng ? ring.slice(0, -1) : ring

interface NominatimResult {
  osm_type: string
  osm_id: number
  name?: string
  display_name?: string
  geojson?: { type: string; coordinates: unknown }
}

/** Parks (and other mapped areas) in Malaysia matching the name, largest first. */
export async function searchParks(query: string, deps: Deps): Promise<ParkHit[]> {
  const q = query.trim()
  const key = `nominatim:${q.toLowerCase()}`
  const cached = (await deps.cache.get(key)) as ParkHit[] | null
  if (cached) return cached

  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const turn = nominatimTurn.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_GAP_MS - now()
    if (wait > 0) await sleep(wait)
    lastNominatimAt = now()
  })
  nominatimTurn = turn.catch(() => undefined)
  await turn

  // polygon_threshold simplifies outlines on Nominatim's side (~1 m), keeping them small.
  const params = new URLSearchParams({
    q,
    countrycodes: 'my',
    format: 'jsonv2',
    polygon_geojson: '1',
    limit: '5',
    polygon_threshold: '0.00001',
  })
  const results = (await deps.fetchJson(`${NOMINATIM}?${params}`, { headers: { 'User-Agent': OSM_USER_AGENT } })) as NominatimResult[]
  const hits: ParkHit[] = []
  for (const r of results ?? []) {
    const g = r.geojson
    let rings: LatLng[][] = []
    if (g?.type === 'Polygon') rings = [(g.coordinates as number[][][])[0].map(toLatLng)]
    else if (g?.type === 'MultiPolygon') rings = (g.coordinates as number[][][][]).map((poly) => poly[0].map(toLatLng))
    else continue
    rings = rings.map(openRing)
    const outline = rings.reduce((a, b) => (ringAreaHa(b) > ringAreaHa(a) ? b : a))
    hits.push({
      osmRef: `${r.osm_type}/${r.osm_id}`,
      name: r.name || (r.display_name ?? '').split(',')[0] || 'Unnamed area',
      areaHa: ringAreaHa(outline),
      outline,
      pieces: rings.length,
    })
  }
  hits.sort((a, b) => b.areaHa - a.areaHa)
  await deps.cache.put(key, hits)
  return hits
}

/** Chains the separate ways of an OSM relation into closed rings (open form, no repeated last point). */
export function joinWays(ways: LatLng[][]): LatLng[][] {
  const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng
  const left = ways.filter((w) => w.length >= 2).map((w) => [...w])
  const rings: LatLng[][] = []
  while (left.length) {
    const ring = left.shift()!
    while (!same(ring[0], ring.at(-1)!)) {
      const end = ring.at(-1)!
      const k = left.findIndex((w) => same(w[0], end) || same(w.at(-1)!, end))
      if (k < 0) break
      const [next] = left.splice(k, 1)
      ring.push(...(same(next[0], end) ? next : next.reverse()).slice(1))
    }
    if (ring.length >= 4 && same(ring[0], ring.at(-1)!)) rings.push(ring.slice(0, -1))
  }
  return rings
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

const pts = (g: { lat: number; lon: number }[] = []) => g.map((p) => ({ lat: p.lat, lng: p.lon }))
const isClosed = (g: { lat: number; lon: number }[] = []) =>
  g.length >= 4 && g[0].lat === g.at(-1)!.lat && g[0].lon === g.at(-1)!.lon

/** Keeps every nth point so a ring has at most `max` points. */
function thin(ring: LatLng[], max = MAX_WATER_POINTS): LatLng[] {
  if (ring.length <= max) return ring
  const step = Math.ceil(ring.length / max)
  return ring.filter((_, k) => k % step === 0)
}

/**
 * Lakes and toilets inside a park's outline. If Overpass fails, says so (waterChecked: false) rather
 * than failing the import, and caches nothing so a retry asks again.
 */
export async function parkFeatures(
  outline: LatLng[],
  deps: Deps,
): Promise<{ water: LatLng[][]; toilets: LatLng[]; waterChecked: boolean }> {
  const poly = outline.map((p) => `${p.lat} ${p.lng}`).join(' ')
  const key = `overpass:${hash(poly)}:${outline.length}`
  const cached = (await deps.cache.get(key)) as { water: LatLng[][]; toilets: LatLng[] } | null
  if (cached) return { ...cached, waterChecked: true }

  const f = `(poly:"${poly}")`
  const query = `[out:json][timeout:20];(way["natural"="water"]${f};relation["natural"="water"]${f};node["amenity"="toilets"]${f};way["amenity"="toilets"]${f};);out geom;`
  let elements: OverpassElement[]
  try {
    const res = (await deps.fetchJson(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'User-Agent': OSM_USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    })) as { elements?: OverpassElement[] }
    if (!res || !Array.isArray(res.elements)) throw new Error('Unexpected Overpass reply')
    elements = res.elements
  } catch {
    return { water: [], toilets: [], waterChecked: false }
  }

  const water: LatLng[][] = []
  const toilets: LatLng[] = []
  for (const e of elements) {
    if (e.tags?.natural === 'water') {
      // An unclosed way tagged as water is a piece of a bigger outline, not a lake of its own.
      const rings =
        e.type === 'way'
          ? isClosed(e.geometry)
            ? [openRing(pts(e.geometry))]
            : []
          : joinWays((e.members ?? []).filter((m) => m.role === 'outer').map((m) => pts(m.geometry)))
      water.push(...rings.filter((r) => r.length >= 3 && ringAreaHa(r) >= MIN_WATER_HA).map((r) => thin(r)))
    } else if (e.tags?.amenity === 'toilets') {
      if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) toilets.push({ lat: e.lat, lng: e.lon })
      else if (e.geometry?.length) toilets.push({ lat: e.geometry[0].lat, lng: e.geometry[0].lon })
    }
  }
  await deps.cache.put(key, { water, toilets })
  return { water, toilets, waterChecked: true }
}
