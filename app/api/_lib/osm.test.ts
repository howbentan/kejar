// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { joinWays, OSM_TIMEOUT_MS, OSM_USER_AGENT, parkFeatures, searchParks, type FetchJson, type OsmCache } from './osm.js'

type Call = { url: string; init?: Parameters<FetchJson>[1] }
let calls: Call[]
let replies: unknown[]
let cacheMap: Map<string, unknown>
const fetchJson: FetchJson = async (url, init) => {
  calls.push({ url, init })
  const r = replies.shift()
  if (r instanceof Error) throw r
  return r
}
const cache: OsmCache = {
  get: async (k) => cacheMap.get(k) ?? null,
  put: async (k, v) => void cacheMap.set(k, v),
}
const deps = () => ({ fetchJson, cache, now: () => 0, sleep: async () => {} })

beforeEach(() => {
  calls = []
  replies = []
  cacheMap = new Map()
})

// ~100 m squares around KLCC, as [lng, lat] like Nominatim's GeoJSON.
const sq = (lng: number, lat: number, d: number) => [
  [lng, lat],
  [lng + d, lat],
  [lng + d, lat + d],
  [lng, lat + d],
  [lng, lat],
]

describe('searchParks', () => {
  it('sends a Malaysia-only polygon search with an identifying User-Agent', async () => {
    replies.push([])
    await searchParks('  KLCC Park ', deps())
    const u = new URL(calls[0].url)
    expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      q: 'KLCC Park',
      countrycodes: 'my',
      format: 'jsonv2',
      polygon_geojson: '1',
      limit: '5',
      polygon_threshold: '0.00001',
    })
    expect(calls[0].init?.headers?.['User-Agent']).toBe(OSM_USER_AGENT)
  })

  it('drops point results and keeps the largest ring of a MultiPolygon', async () => {
    replies.push([
      { osm_type: 'node', osm_id: 1, name: 'A sign', geojson: { type: 'Point', coordinates: [101.71, 3.15] } },
      { osm_type: 'way', osm_id: 10590000, name: 'KLCC Park', geojson: { type: 'Polygon', coordinates: [sq(101.71, 3.15, 0.003)] } },
      {
        osm_type: 'relation',
        osm_id: 7,
        name: 'Split Park',
        geojson: { type: 'MultiPolygon', coordinates: [[sq(101.7, 3.1, 0.001)], [sq(101.72, 3.1, 0.004)]] },
      },
    ])
    const hits = await searchParks('park', deps())
    expect(hits.map((h) => [h.osmRef, h.name, h.pieces])).toEqual([
      ['relation/7', 'Split Park', 2],
      ['way/10590000', 'KLCC Park', 1],
    ])
    expect(hits[0].outline[0]).toEqual({ lat: 3.1, lng: 101.72 })
    expect(hits[1].areaHa).toBeCloseTo(11.1, 0)
  })

  it('a repeated search is served from the cache', async () => {
    replies.push([])
    await searchParks('KLCC', deps())
    await searchParks('klcc ', deps())
    expect(calls).toHaveLength(1)
  })
})

describe('parkFeatures', () => {
  const outline = [
    { lat: 3.15, lng: 101.71 },
    { lat: 3.15, lng: 101.713 },
    { lat: 3.153, lng: 101.713 },
    { lat: 3.153, lng: 101.71 },
  ]
  const g = (pts: number[][]) => pts.map(([lng, lat]) => ({ lat, lon: lng }))

  it('asks Overpass for water and toilets inside the outline', async () => {
    replies.push({ elements: [] })
    await parkFeatures(outline, deps())
    expect(calls[0].url).toBe('https://overpass-api.de/api/interpreter')
    expect(calls[0].init?.method).toBe('POST')
    const q = decodeURIComponent(String(calls[0].init?.body).replace(/^data=/, ''))
    expect(q).toContain('poly:"3.15 101.71 3.15 101.713 3.153 101.713 3.153 101.71"')
    expect(q).toContain('"natural"="water"')
    expect(q).toContain('"amenity"="toilets"')
    expect(calls[0].init?.headers?.['User-Agent']).toBe(OSM_USER_AGENT)
  })

  it('reads lakes from ways and relations and drops ponds under 0.05 ha', async () => {
    replies.push({
      elements: [
        { type: 'way', id: 1, tags: { natural: 'water' }, geometry: g(sq(101.711, 3.151, 0.001)) },
        { type: 'way', id: 2, tags: { natural: 'water' }, geometry: g(sq(101.712, 3.152, 0.0001)) }, // ~0.01 ha fountain
        {
          type: 'relation',
          id: 3,
          tags: { natural: 'water' },
          members: [
            { type: 'way', role: 'outer', geometry: g([[101.7105, 3.1505], [101.7115, 3.1505], [101.7115, 3.1515]]) },
            { type: 'way', role: 'outer', geometry: g([[101.7105, 3.1505], [101.7105, 3.1515], [101.7115, 3.1515]]) },
            { type: 'way', role: 'inner', geometry: g(sq(101.7108, 3.1508, 0.0001)) },
          ],
        },
      ],
    })
    const f = await parkFeatures(outline, deps())
    expect(f.waterChecked).toBe(true)
    expect(f.water).toHaveLength(2)
  })

  it('turns toilets into points', async () => {
    replies.push({
      elements: [
        { type: 'node', id: 9, lat: 3.151, lon: 101.711, tags: { amenity: 'toilets' } },
        { type: 'way', id: 10, tags: { amenity: 'toilets' }, geometry: g(sq(101.712, 3.152, 0.00005)) },
      ],
    })
    expect((await parkFeatures(outline, deps())).toilets).toEqual([
      { lat: 3.151, lng: 101.711 },
      { lat: 3.152, lng: 101.712 },
    ])
  })

  it('overpass failure imports without water and says so', async () => {
    replies.push(new Error('502 Bad Gateway'))
    expect(await parkFeatures(outline, deps())).toEqual({ water: [], toilets: [], waterChecked: false })
    expect(cacheMap.size).toBe(0)
    replies.push({ elements: [] })
    expect((await parkFeatures(outline, deps())).waterChecked).toBe(true)
    expect(cacheMap.size).toBe(1)
  })
})

describe('joinWays', () => {
  it('chains split ways into closed rings, flipping ones that run backwards', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 0, lng: 1 }
    const c = { lat: 1, lng: 1 }
    const d = { lat: 1, lng: 0 }
    const rings = joinWays([
      [a, b],
      [c, b],
      [c, d, a],
    ])
    expect(rings).toEqual([[a, b, c, d]])
  })

describe('review fixes', () => {
  const outline = [
    { lat: 3.15, lng: 101.71 },
    { lat: 3.15, lng: 101.713 },
    { lat: 3.153, lng: 101.713 },
    { lat: 3.153, lng: 101.71 },
  ]

  it('a lake with thousands of points comes back simplified', async () => {
    const n = 6000
    const ring = Array.from({ length: n }, (_, k) => ({
      lat: 3.1515 + 0.001 * Math.sin((2 * Math.PI * k) / n),
      lon: 101.7115 + 0.001 * Math.cos((2 * Math.PI * k) / n),
    }))
    replies.push({ elements: [{ type: 'way', id: 1, tags: { natural: 'water' }, geometry: [...ring, ring[0]] }] })
    const f = await parkFeatures(outline, deps())
    expect(f.water).toHaveLength(1)
    expect(f.water[0].length).toBeLessThanOrEqual(1000)
    expect(f.water[0].length).toBeGreaterThan(100)
  })

  it('an unclosed water way is not treated as a lake', async () => {
    const line = [
      { lat: 3.151, lon: 101.711 },
      { lat: 3.151, lon: 101.712 },
      { lat: 3.152, lon: 101.712 },
      { lat: 3.152, lon: 101.711 },
    ]
    replies.push({ elements: [{ type: 'way', id: 1, tags: { natural: 'water' }, geometry: line }] })
    expect((await parkFeatures(outline, deps())).water).toEqual([])
  })

  it('searches arriving together still go out at least 1 s apart', async () => {
    let t = 50_000
    const sent: number[] = []
    const timed = {
      fetchJson: async () => {
        sent.push(t)
        return []
      },
      cache,
      now: () => t,
      sleep: async (ms: number) => {
        await Promise.resolve()
        t += ms
      },
    }
    await Promise.all([searchParks('park one', timed), searchParks('park two', timed), searchParks('park three', timed)])
    expect(sent).toHaveLength(3)
    expect(sent[1] - sent[0]).toBeGreaterThanOrEqual(1000)
    expect(sent[2] - sent[1]).toBeGreaterThanOrEqual(1000)
  })
})

  it('the User-Agent names the app without its hosting domain, which Overpass refuses (406)', () => {
    expect(OSM_USER_AGENT).toMatch(/^Kejar\/\d/)
    expect(OSM_USER_AGENT).not.toMatch(/vercel\.app|https?:/)
  })

  it('waits long enough for a busy Overpass, which queues requests for 30 s or more', () => {
    expect(OSM_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000)
  })
})
