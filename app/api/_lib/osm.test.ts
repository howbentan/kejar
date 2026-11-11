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
      limit: '10',
      polygon_threshold: '0.00001',
    })
    expect(calls[0].init?.headers?.['User-Agent']).toBe(OSM_USER_AGENT)
  })

  it('nothing found gives empty parks, no circle and no nearby lookup', async () => {
    replies.push([])
    expect(await searchParks('zzz', deps())).toEqual({ parks: [], around: null, nearby: [] })
    expect(calls).toHaveLength(1)
  })

  it('keeps the largest ring of a MultiPolygon, biggest park first, with no label', async () => {
    replies.push([
      { osm_type: 'way', osm_id: 10590000, name: 'KLCC Park', category: 'leisure', type: 'park', geojson: { type: 'Polygon', coordinates: [sq(101.71, 3.15, 0.003)] } },
      {
        osm_type: 'relation',
        osm_id: 7,
        name: 'Split Park',
        category: 'leisure',
        type: 'garden',
        geojson: { type: 'MultiPolygon', coordinates: [[sq(101.7, 3.1, 0.001)], [sq(101.72, 3.1, 0.004)]] },
      },
    ])
    const { parks } = await searchParks('park', deps())
    expect(parks.map((h) => [h.osmRef, h.name, h.pieces])).toEqual([
      ['relation/7', 'Split Park', 2],
      ['way/10590000', 'KLCC Park', 1],
    ])
    expect(parks[0].outline[0]).toEqual({ lat: 3.1, lng: 101.72 })
    expect(parks[1].areaHa).toBeCloseTo(11.1, 0)
    expect(Object.keys(parks[0]).sort()).toEqual(['areaHa', 'name', 'osmRef', 'outline', 'pieces'])
  })

  it('keeps every kind of playable outline and drops the rest', async () => {
    const poly = (lat: number) => ({ type: 'Polygon', coordinates: [sq(101.7, lat, 0.001)] })
    const playable: [string, string][] = [
      ['leisure', 'park'], ['leisure', 'garden'], ['leisure', 'recreation_ground'], ['leisure', 'common'],
      ['leisure', 'nature_reserve'], ['leisure', 'stadium'], ['leisure', 'sports_centre'], ['leisure', 'pitch'],
      ['leisure', 'playground'], ['landuse', 'recreation_ground'], ['landuse', 'grass'], ['landuse', 'village_green'],
      ['boundary', 'national_park'], ['boundary', 'protected_area'],
    ]
    const no: [string, string][] = [['railway', 'station'], ['building', 'yes'], ['highway', 'footway'], ['amenity', 'school'], ['shop', 'mall'], ['leisure', 'swimming_pool'], ['landuse', 'residential']]
    replies.push([
      ...playable.map(([category, type], k) => ({ osm_type: 'way', osm_id: k + 1, name: `P${k}`, category, type, geojson: poly(3 + k * 0.01) })),
      ...no.map(([category, type], k) => ({ osm_type: 'way', osm_id: 100 + k, name: `N${k}`, category, type, geojson: poly(4 + k * 0.01) })),
    ])
    const { parks } = await searchParks('x', deps())
    expect(parks).toHaveLength(14)
    expect(parks.every((h) => h.name.startsWith('P'))).toBe(true)
  })

  describe('Bukit Jalil', () => {
    const jalil = () => [
      { osm_type: 'way', osm_id: 5, name: 'SP17 Bukit Jalil', category: 'railway', type: 'station', lat: '3.0610', lon: '101.6990', geojson: { type: 'Polygon', coordinates: [sq(101.69, 3.06, 0.0007)] } },
      { osm_type: 'node', osm_id: 1, name: 'Bukit Jalil', category: 'place', type: 'suburb', lat: '3.0618', lon: '101.6993', geojson: { type: 'Point', coordinates: [101.6993, 3.0618] } },
      { osm_type: 'node', osm_id: 2, name: 'Bukit Jalil LRT', category: 'railway', type: 'stop', lat: '3.0620', lon: '101.6990', geojson: { type: 'Point', coordinates: [101.699, 3.062] } },
      { osm_type: 'node', osm_id: 3, name: 'Bukit Jalil', category: 'natural', type: 'peak', lat: '3.05', lon: '101.7' },
    ]

    it('no playable outline: parks empty, one circle around the suburb, stations gone', async () => {
      replies.push(jalil(), { elements: [] })
      const r = await searchParks('Bukit Jalil', deps())
      expect(r.parks).toEqual([])
      expect(r.around).toEqual({ name: 'Bukit Jalil', center: { lat: 3.0618, lng: 101.6993 } })
      expect(r.nearby).toEqual([])
    })

    it('a playable outline is kept beside the circle', async () => {
      replies.push(
        [{ osm_type: 'way', osm_id: 6, name: 'Taman Rekreasi', category: 'leisure', type: 'park', geojson: { type: 'Polygon', coordinates: [sq(101.7, 3.07, 0.002)] } }, ...jalil()],
        { elements: [] },
      )
      const r = await searchParks('Bukit Jalil', deps())
      expect(r.parks.map((p) => p.osmRef)).toEqual(['way/6'])
      expect(r.around?.name).toBe('Bukit Jalil')
    })

    it('with only stations and buildings, falls back to a station point rather than nothing', async () => {
      replies.push([jalil()[2]], { elements: [] })
      expect((await searchParks('LRT', deps())).around?.name).toBe('Bukit Jalil LRT')
    })

    it('a building outline never becomes the circle', async () => {
      replies.push([jalil()[0]])
      expect((await searchParks('SP17', deps())).around).toBeNull()
      expect(calls).toHaveLength(1)
    })
  })

  describe('parks nearby', () => {
    const suburb = [{ osm_type: 'node', osm_id: 1, name: 'Bukit Jalil', category: 'place', type: 'suburb', lat: '3.0618', lon: '101.6993' }]
    const way = (id: number, name: string | undefined, d: number, closed = true) => {
      const ring = sq(101.7, 3.06, d).map(([lng, lat]) => ({ lat, lon: lng }))
      return { type: 'way', id, tags: { leisure: 'park', ...(name ? { name } : {}) }, geometry: closed ? ring : ring.slice(0, 4) }
    }

    it('asks Overpass for playable areas within 1500 m of the circle centre', async () => {
      replies.push(suburb, { elements: [] })
      await searchParks('Bukit Jalil', deps())
      expect(calls[1].url).toBe('https://overpass-api.de/api/interpreter')
      expect(calls[1].init?.method).toBe('POST')
      const q = decodeURIComponent(String(calls[1].init?.body).replace(/^data=/, ''))
      expect(q).toContain('around:1500,3.0618,101.6993')
      expect(q).toContain('"leisure"')
      expect(q).toContain('"landuse"')
      expect(q).toContain('village_green')
      expect(q).toContain('out geom')
      expect(calls[1].init?.headers?.['User-Agent']).toBe(OSM_USER_AGENT)
    })

    it('parses ways and relations, drops under 0.5 ha, dedupes against the main list, sorts and keeps the top 6', async () => {
      const big = Array.from({ length: 8 }, (_, k) => way(10 + k, `Park ${k}`, 0.003 + k * 0.0005))
      replies.push(
        [{ osm_type: 'way', osm_id: 10, name: 'Park 0', category: 'leisure', type: 'park', geojson: { type: 'Polygon', coordinates: [sq(101.7, 3.06, 0.003)] } }, ...suburb],
        {
          elements: [
            ...big,
            way(50, 'Tiny', 0.0005), // ~0.3 ha
            way(51, 'Open way', 0.01, false), // not closed
            { type: 'node', id: 60, lat: 3.06, lon: 101.7, tags: { leisure: 'park', name: 'Pin' } },
            {
              type: 'relation',
              id: 70,
              tags: { leisure: 'garden', name: 'Rel Garden' },
              members: [
                { type: 'way', role: 'outer', geometry: sq(101.7, 3.06, 0.01).slice(0, 3).map(([lng, lat]) => ({ lat, lon: lng })) },
                { type: 'way', role: 'outer', geometry: [sq(101.7, 3.06, 0.01)[2], sq(101.7, 3.06, 0.01)[3], sq(101.7, 3.06, 0.01)[0]].map(([lng, lat]) => ({ lat, lon: lng })) },
              ],
            },
          ],
        },
      )
      const { nearby } = await searchParks('Bukit Jalil', deps())
      expect(nearby).toHaveLength(6)
      expect(nearby[0].osmRef).toBe('relation/70')
      expect(nearby[0].name).toBe('Rel Garden')
      expect(nearby.map((p) => p.areaHa)).toEqual([...nearby.map((p) => p.areaHa)].sort((x, y) => y - x))
      const refs = nearby.map((p) => p.osmRef)
      expect(refs).not.toContain('way/10') // already in the main list
      expect(refs).not.toContain('way/50')
      expect(refs).not.toContain('way/51')
      expect(refs).not.toContain('node/60')
      expect(refs).toEqual(['relation/70', 'way/17', 'way/16', 'way/15', 'way/14', 'way/13'])
      expect(nearby[1]).toMatchObject({ name: 'Park 7', pieces: 1 })
      expect(nearby[1].outline.length).toBeGreaterThanOrEqual(3)
    })

    it('Overpass failure gives nearby: [] and the search still works, and a retry asks again', async () => {
      replies.push(suburb, new Error('504'))
      const r = await searchParks('Bukit Jalil', deps())
      expect(r.around?.name).toBe('Bukit Jalil')
      expect(r.nearby).toEqual([])
      replies.push({ elements: [way(1, 'Taman A', 0.003)] })
      expect((await searchParks('Bukit Jalil', deps())).nearby.map((p) => p.name)).toEqual(['Taman A'])
      expect(calls).toHaveLength(3) // nominatim once (cached), overpass twice
    })

    it('the nearby cache key includes the rounded centre', async () => {
      replies.push(suburb, { elements: [way(1, 'Taman A', 0.003)] })
      await searchParks('Bukit Jalil', deps())
      expect([...cacheMap.keys()].some((k) => k.startsWith('overpassnear:') && k.includes('3.0618') && k.includes('101.6993'))).toBe(true)
      expect(cacheMap.has('nominatim3:bukit jalil')).toBe(true)
    })
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
