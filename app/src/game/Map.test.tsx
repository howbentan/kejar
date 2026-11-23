import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  count: 0,
  flights: [] as unknown[],
  fits: [] as unknown[],
  fitOpts: [] as unknown[],
  load: null as null | (() => void),
  error: null as null | (() => void),
  layers: [] as { id: string; source: string; before?: string }[],
  data: {} as Record<string, unknown>,
  markers: [] as { el: HTMLElement; lngLat?: number[]; removed: boolean }[],
  options: [] as Record<string, unknown>[],
  vis: [] as string[],
  eases: [] as Record<string, unknown>[],
  paints: [] as { id: string; prop: string; v: unknown }[],
}))
const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))
vi.mock('maplibre-gl', () => ({
  default: {
    Marker: class {
      rec: { el: HTMLElement; lngLat?: number[]; removed: boolean }
      constructor(o: { element: HTMLElement }) {
        this.rec = { el: o.element, removed: false }
        created.markers.push(this.rec)
      }
      setLngLat(l: number[]) {
        this.rec.lngLat = l
        return this
      }
      addTo() {
        return this
      }
      remove() {
        this.rec.removed = true
      }
    },
    Map: class {
      constructor(o: Record<string, unknown>) {
        created.options.push(o)
        created.count++
      }
      on(event: string, cb: () => void) {
        if (event === 'load') created.load = cb
        if (event === 'error') created.error = cb
      }
      removed = false
      remove() {
        this.removed = true
      }
      // Like MapLibre: a removed map has no style, so setFilter throws.
      setFilter() {
        if (this.removed) throw new TypeError("Cannot read properties of undefined (reading 'setFilter')")
      }
      getContainer() {
        return { getBoundingClientRect: () => ({ width: 360, height: 480 }) }
      }
      project() {
        return { x: 180, y: 240 }
      }
      unproject() {
        return { lat: 3.001, lng: 101.001 }
      }
      addSource(id: string, s: { data: unknown }) {
        created.data[id] = s.data
      }
      addLayer(l: { id: string; source: string }, before?: string) {
        created.layers.push(before ? { ...l, before } : l)
      }
      getSource(id: string) {
        return created.data[id] === undefined ? undefined : { setData: (d: unknown) => (created.data[id] = d) }
      }
      getLayer(id: string) {
        return id.startsWith('buildings') || created.layers.some((l) => l.id === id) ? { id } : undefined
      }
      setPaintProperty(id: string, prop: string, v: unknown) {
        created.paints.push({ id, prop, v })
      }
      setLayoutProperty(id: string, prop: string, v: string) {
        created.vis.push(`${id}:${prop}:${v}`)
      }
      easeTo(o: Record<string, unknown>) {
        created.eases.push(o)
      }
      flyTo(opts: unknown) {
        created.flights.push(opts)
      }
      fitBounds(bounds: unknown, opts?: unknown) {
        created.fits.push(bounds)
        created.fitOpts.push(opts)
      }
    },
  },
}))

import GameMap, { stationFeatures } from './Map'
import { MAP_FONT } from './mapStyle'
import { FLOAT_MARKER_LAYERS } from './mapView'
import { FLOAT_TRANSLATE_LAYERS } from './floatMotion'
import { featureFilter, type FilterSpecification } from '@maplibre/maplibre-gl-style-spec'

afterEach(cleanup)

const arena = {
  id: 'around-me',
  name: 'Around',
  boundary: [{ lat: 3, lng: 101 }],
  jail: { lat: 3, lng: 101 },
  start: { lat: 3, lng: 101 },
}

describe('GameMap', () => {
  it('drops MapLibre own attribution box for the slim credit', () => {
    created.options = []
    render(<GameMap arena={arena} dots={[]} />)
    expect(created.options.at(-1)!.attributionControl).toBe(false)
    expect(screen.getByText(/OpenMapTiles/).closest('.map-credit')).toBeInTheDocument()
  })

  it('applies the stored view at load without animation, then on each toggle', () => {
    created.vis = []
    created.eases = []
    localStorage.setItem('kejar.map3d', '1')
    try {
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(created.vis).toContain('buildings-3d:visibility:visible')
      expect(created.eases).toEqual([{ pitch: 58, duration: 0 }])
      fireEvent.click(screen.getByRole('button', { name: 'Show buildings flat' }))
      expect(created.eases.at(-1)).toEqual({ pitch: 0, duration: 900 })
      expect(localStorage.getItem('kejar.map3d')).toBe('0')
    } finally {
      localStorage.clear()
    }
  })

  it('runs a small j over the map until its first load, then takes it away', () => {
    render(<GameMap arena={arena} dots={[]} />)
    const loading = screen.getByTestId('map-loading')
    expect(loading).toHaveAttribute('aria-hidden', 'true')
    expect(loading.querySelector('[data-testid="mini-runner"]')).not.toBeNull()
    act(() => created.load!())
    expect(screen.queryByTestId('map-loading')).toBeNull()
  })

  it("takes the small j away after 8 s if the map never loads", () => {
    vi.useFakeTimers()
    try {
      render(<GameMap arena={arena} dots={[]} />)
      act(() => vi.advanceTimersByTime(7900))
      expect(screen.getByTestId('map-loading')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByTestId('map-loading')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the small j away at once on a map error', () => {
    render(<GameMap arena={arena} dots={[]} />)
    expect(screen.getByTestId('map-loading')).toBeInTheDocument()
    act(() => created.error!())
    expect(screen.queryByTestId('map-loading')).toBeNull()
  })

  it('leaving the screen mid-ripple never touches the removed map', () => {
    const { rerender, unmount } = render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    rerender(<GameMap arena={arena} dots={[]} ripple={{ at: Date.now(), origin: { lat: 3, lng: 101 } }} />)
    expect(() => unmount()).not.toThrow()
  })

  it('keeps one map when a poll returns an equal arena as a new object', () => {
    created.count = 0
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    expect(created.count).toBe(1)
  })

  it('Centre on me flies to my dot', () => {
    created.flights = []
    render(<GameMap arena={arena} dots={[{ id: 'me', kind: 'me', lat: 3.2, lng: 101.5, at: '', revealedBy: null }]} />)
    fireEvent.click(screen.getByRole('button', { name: /centre on me/i }))
    expect(created.flights).toEqual([expect.objectContaining({ center: [101.5, 3.2] })])
  })

  it("Centre on me uses this phone's location when I have no dot (e.g. the organiser)", async () => {
    created.flights = []
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 3.3, longitude: 101.4, accuracy: 5 } }) },
    })
    render(<GameMap arena={arena} dots={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /centre on me/i }))
    await vi.waitFor(() => expect(created.flights).toEqual([expect.objectContaining({ center: [101.4, 3.3] })]))
  })

  it('alert pins are drawn on their own layer, above the players', () => {
    created.layers = []
    created.data = {}
    const pins = [{ id: 'e1', lat: 3.1, lng: 101.1 }]
    const { rerender } = render(<GameMap arena={arena} dots={[]} pins={pins} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toContain('pins')
    expect(ids.indexOf('pins')).toBeGreaterThan(ids.indexOf('points'))
    expect(created.data.pins).toMatchObject({ features: [{ geometry: { coordinates: [101.1, 3.1] } }] })
    rerender(<GameMap arena={arena} dots={[]} pins={[]} />)
    expect(created.data.pins).toMatchObject({ features: [] })
  })

  it('lakes, toilets and the start are drawn on their own layers', () => {
    created.layers = []
    created.data = {}
    const lake = [
      { lat: 3.001, lng: 101.001 },
      { lat: 3.001, lng: 101.002 },
      { lat: 3.002, lng: 101.002 },
    ]
    const withLake = { ...arena, holes: [lake], toilets: [{ lat: 3.003, lng: 101.003 }], start: { lat: 3.004, lng: 101.004 } }
    render(<GameMap arena={withLake} dots={[]} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['holes', 'toilets', 'start']))
    expect(created.data.holes).toMatchObject({ features: [{ geometry: { type: 'LineString' } }] })
    expect(created.data.toilets).toMatchObject({ features: [{ geometry: { coordinates: [101.003, 3.003] } }] })
    expect(created.data.start).toMatchObject({ features: [{ geometry: { coordinates: [101.004, 3.004] } }] })
  })

  it('draws the jail and start circles and labels by default', () => {
    created.layers = []
    created.data = {}
    render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['jail', 'start']))
  })

  it("draws a lime reveal ring around a dot revealed by Pak Guard's Focus", () => {
    created.layers = []
    created.data = {}
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: 'focus' as const }]
    render(<GameMap arena={arena} dots={dots} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toContain('reveal-ring')
    expect(ids.indexOf('reveal-ring')).toBeGreaterThan(ids.indexOf('points'))
    const ring = created.layers.find((l) => l.id === 'reveal-ring') as unknown as { filter: unknown; paint: Record<string, unknown> }
    expect(ring.filter).toEqual(['==', ['get', 'revealedBy'], 'focus'])
    expect(ring.paint['circle-stroke-color']).toBe('#C6FF3D')
    expect(created.data.points).toMatchObject({ features: [{ properties: { revealedBy: 'focus' } }] })
  })

  it("Bomba's last call draws like an exact dot, with a red ring", () => {
    created.layers = []
    created.data = {}
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: 'lastcall' as const }]
    render(<GameMap arena={arena} dots={dots} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids.indexOf('lastcall-reveal-ring')).toBeGreaterThan(ids.indexOf('points'))
    const ring = created.layers.find((l) => l.id === 'lastcall-reveal-ring') as unknown as { filter: unknown; paint: Record<string, unknown> }
    expect(ring.filter).toEqual(['==', ['get', 'revealedBy'], 'lastcall'])
    expect(ring.paint['circle-stroke-color']).toBe('#E63946')
    expect(created.data.points).toMatchObject({ features: [{ properties: { revealedBy: 'lastcall' } }] })
  })

  it("Hang Hebat's wanted runner gets a cream ring and a poster pin, as a circle or as a dot", () => {
    created.layers = []
    created.data = {}
    const dots = [
      { id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: null, fuzzy: true, wanted: true as const },
      { id: 'r2', kind: 'runner' as const, lat: 3.2, lng: 101.2, at: '', revealedBy: null, fuzzy: true },
    ]
    const { rerender } = render(<GameMap arena={arena} dots={dots} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['wanted-fuzzy-ring', 'wanted-ring', 'wanted-pin', 'wanted-pin-label']))
    const ring = created.layers.find((l) => l.id === 'wanted-fuzzy-ring') as unknown as { filter: unknown; paint: Record<string, unknown> }
    expect(ring.filter).toEqual(['get', 'wanted'])
    expect(ring.paint['line-color']).toBe('#F1E3C3')
    expect(created.data.fuzzy).toMatchObject({ features: [{ properties: { wanted: true } }, { properties: { wanted: false } }] })
    expect(created.data.wanted).toMatchObject({ features: [{ geometry: { coordinates: [101.1, 3.1] } }] })
    rerender(<GameMap arena={arena} dots={[{ ...dots[0], fuzzy: false }]} />)
    expect(created.data.points).toMatchObject({ features: [{ properties: { wanted: true } }] })
    rerender(<GameMap arena={arena} dots={[dots[1]]} />)
    expect(created.data.wanted).toMatchObject({ features: [] })
  })

  it('draws a toll gate pin from tollGates, in its own layer above the players, and follows the prop', () => {
    created.layers = []
    created.data = {}
    const { rerender } = render(<GameMap arena={arena} dots={[]} tollGates={[{ lat: 3.1, lng: 101.1 }]} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).toContain('toll-gates')
    expect(ids.indexOf('toll-gates')).toBeGreaterThan(ids.indexOf('points'))
    expect(created.data['toll-gates']).toMatchObject({ features: [{ geometry: { coordinates: [101.1, 3.1] } }] })
    rerender(<GameMap arena={arena} dots={[]} tollGates={[]} />)
    expect(created.data['toll-gates']).toMatchObject({ features: [] })
  })

  it("gives a dot revealed by Tee And Gee's toll gate its own layer, not Pak Guard's or Bomoh's", () => {
    created.layers = []
    created.data = {}
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: 'toll' as const }]
    render(<GameMap arena={arena} dots={dots} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids.indexOf('toll-reveal-ring')).toBeGreaterThan(ids.indexOf('points'))
    const ring = created.layers.find((l) => l.id === 'toll-reveal-ring') as unknown as { filter: unknown; paint: Record<string, unknown> }
    expect(ring.filter).toEqual(['==', ['get', 'revealedBy'], 'toll'])
    const focus = created.layers.find((l) => l.id === 'reveal-ring') as unknown as { paint: Record<string, unknown> }
    expect(ring.paint['circle-radius']).not.toBe(focus.paint['circle-radius'])
  })

  it('showJailAndStart={false} skips the jail/start circles and labels entirely (e.g. a scoped-down stub arena)', () => {
    created.layers = []
    created.data = {}
    render(<GameMap arena={arena} dots={[]} showJailAndStart={false} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).not.toEqual(expect.arrayContaining(['jail', 'start']))
    expect(created.data.jail).toBeUndefined()
    expect(created.data.start).toBeUndefined()
  })

  it('fit frames every point on load, then re-frames as they move without rebuilding the map', () => {
    created.count = 0
    created.fits = []
    const me = { lat: 3, lng: 101 }
    const { rerender } = render(<GameMap arena={arena} dots={[]} fit={[me, { lat: 3.01, lng: 100.99 }]} />)
    created.load!()
    expect(created.fits).toEqual([
      [
        [100.99, 3],
        [101, 3.01],
      ],
    ])
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} fit={[me, { lat: 3.02, lng: 101.02 }]} />)
    expect(created.fits.at(-1)).toEqual([
      [101, 3],
      [101.02, 3.02],
    ])
    expect(created.count).toBe(1)
  })

  it('without fit, the camera is never re-framed', () => {
    created.fits = []
    render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    expect(created.fits).toEqual([])
  })

  it('a just-jailed runner (caughtAt) still gets a point feature, at its last known position, for the slide-off moment', () => {
    localStorage.clear()
    created.data = {}
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.05, lng: 101.05, at: '', revealedBy: null, caughtAt: new Date().toISOString() }]
    rerender(<GameMap arena={arena} dots={dots} />)
    expect(created.data.points).toMatchObject({ features: [{ geometry: { coordinates: [101.05, 3.05] } }] })
  })

  it('a jailed runner whose slide-off window has passed gets no point feature (ordinary behaviour)', () => {
    localStorage.clear()
    created.data = {}
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    const longAgo = new Date(Date.now() - 20_000).toISOString()
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.05, lng: 101.05, at: '', revealedBy: null, caughtAt: longAgo }]
    rerender(<GameMap arena={arena} dots={dots} />)
    expect(created.data.points).toMatchObject({ features: [] })
  })

  it('an auto-jailed runner\'s slide finishes and the dot is dropped for good, even while the server keeps sending it', async () => {
    localStorage.clear()
    created.data = {}
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    created.load!()
    const caughtAt = new Date().toISOString()
    const dots = [{ id: 'r1', kind: 'runner' as const, lat: 3.05, lng: 101.05, at: '', revealedBy: null, caughtAt }]
    rerender(<GameMap arena={arena} dots={dots} />)
    expect(created.data.points).toMatchObject({ features: [{ geometry: { coordinates: [101.05, 3.05] } }] })
    // Wait past the slide duration, then force another pass (as the next poll would) with the same dot.
    await new Promise((r) => setTimeout(r, 1_300))
    rerender(<GameMap arena={arena} dots={[...dots]} />)
    expect(created.data.points).toMatchObject({ features: [] })
  })

  describe("the chasers' snapshot on a runner's map", () => {
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown>; layout: Record<string, unknown>; filter?: unknown }
    const snap = {
      positions: [
        { name: 'Ben', lat: 3.01, lng: 101.01, stale: false },
        { name: 'Siti', lat: 3.02, lng: 101.02, stale: true },
      ],
    }

    it('draws a labelled 30 m circle per chaser, dashed when stale, and changes only with the prop', () => {
      created.layers = []
      created.data = {}
      const { rerender } = render(<GameMap arena={arena} dots={[]} snapshot={snap} />)
      act(() => created.load!())
      const features = (created.data.snapshot as { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] } }[] }).features
      expect(features.map((f) => f.properties)).toEqual([
        { label: 'Ben', stale: false },
        { label: 'Siti', stale: true },
      ])
      expect(features[0].geometry.type).toBe('Polygon')
      // Radius ~30 m: the ring's first point is about 30 m from the centre.
      const [lng, lat] = features[0].geometry.coordinates[0][0]
      const m = Math.hypot((lat - 3.01) * 111_320, (lng - 101.01) * 111_320 * Math.cos((3.01 * Math.PI) / 180))
      expect(m).toBeGreaterThan(27)
      expect(m).toBeLessThan(33)
      expect(layer('snapshot-stale').paint['line-dasharray']).toBeTruthy()
      expect(layer('snapshot-line').paint['line-dasharray']).toBeUndefined()
      const before = created.data.snapshot
      rerender(<GameMap arena={arena} dots={[{ id: 'x', kind: 'me', lat: 3, lng: 101, at: '', revealedBy: null }]} snapshot={{ ...snap }} />)
      expect(created.data.snapshot).toBe(before)
      rerender(<GameMap arena={arena} dots={[]} snapshot={null} />)
      expect(created.data.snapshot).toMatchObject({ features: [] })
    })

    it("the organiser's stash pin is a diamond of its side at the exact spot", () => {
      created.layers = []
      created.data = {}
      const { rerender } = render(<GameMap arena={arena} dots={[]} stash={{ lat: 3.03, lng: 101.03 }} stashSide="kejar" />)
      act(() => created.load!())
      expect(created.data.stash).toMatchObject({ features: [{ geometry: { type: 'Point', coordinates: [101.03, 3.03] } }] })
      expect(layer('stash').layout['icon-image']).toBe('dia-gold')
      rerender(<GameMap arena={arena} dots={[]} stash={null} stashSide="kejar" />)
      expect(created.data.stash).toMatchObject({ features: [] })
    })

    it('the stash diamond is gold for Dikejar', () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} stash={{ lat: 3.03, lng: 101.03 }} stashSide="dikejar" />)
      act(() => created.load!())
      expect(layer('stash').layout['icon-image']).toBe('dia-gold')
    })

    it('a Tupperware pin is a gold diamond on both sides (purple means epic); plain pins stay circles', () => {
      created.layers = []
      created.data = {}
      const pins = [
        { id: 'tupper-dikejar', lat: 3.1, lng: 101.1, label: '?', side: 'dikejar' as const },
        { id: 'tupper-kejar', lat: 3.15, lng: 101.15, label: '?', side: 'kejar' as const },
        { id: 'penjara', lat: 3.2, lng: 101.2, label: 'PENJARA' },
      ]
      render(<GameMap arena={arena} dots={[]} pins={pins} />)
      act(() => created.load!())
      expect(created.data.pins).toMatchObject({
        features: [{ properties: { side: 'dikejar' } }, { properties: { side: 'kejar' } }, { properties: { side: '' } }],
      })
      expect(layer('pins-tupper').layout['icon-image']).toBe('dia-gold')
      expect(layer('pins-tupper').filter).toEqual(['!=', ['get', 'side'], ''])
      expect(layer('pins').filter).toEqual(['==', ['get', 'side'], ''])
    })

    it('draws no hint zone layers: the ? zones are gone since the Tupperware', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      const ids = created.layers.map((l) => l.id)
      for (const id of ['legendary-line', 'bomoh-legendary-line', 'ring-legendary-line', 'hijau-legendary-line']) expect(ids).not.toContain(id)
      expect(created.markers).toEqual([])
    })
  })

  describe('station diamonds', () => {
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { layout: Record<string, unknown>; type: string }
    const stations = (lockedUntil: string | null) => [{ n: 1, lat: 3.01, lng: 101.01, lockedUntil }]

    it('draws one symbol layer of volt/red diamonds and no number layer', () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} stations={stations(null)} />)
      act(() => created.load!())
      expect(layer('stations').type).toBe('symbol')
      expect(layer('stations').layout['icon-image']).toEqual(['case', ['get', 'locked'], 'dia-red', 'dia-volt'])
      expect(layer('stations').layout['icon-size']).toBe(1.3)
      expect(created.layers.map((l) => l.id)).not.toContain('station-numbers')
    })

    it('stationFeatures says locked and the m:ss left, or open', () => {
      const now = 1_000_000
      const f = (until: number) => stationFeatures([{ n: 1, lat: 3, lng: 101, lockedUntil: new Date(until).toISOString() }], now).features[0].properties
      expect(f(now + 42_000)).toMatchObject({ locked: true, left: '0:42' })
      expect(f(now - 1)).toMatchObject({ locked: false, left: '' })
      expect(stationFeatures([{ n: 1, lat: 3, lng: 101 }], now).features[0].properties).toMatchObject({ locked: false, left: '' })
    })

    it('the last second of a lock reads 0:01, never 0:00 while still red (rounded up like the other countdowns)', () => {
      const now = 1_000_000
      const f = (until: number) => stationFeatures([{ n: 1, lat: 3, lng: 101, lockedUntil: new Date(until).toISOString() }], now).features[0].properties
      expect(f(now + 400)).toMatchObject({ locked: true, left: '0:01' })
      expect(f(now + 60_000)).toMatchObject({ locked: true, left: '1:00' })
      expect(f(now + 60_001)).toMatchObject({ locked: true, left: '1:01' })
    })

    it("uses the server's clock, not the phone's: on a phone 60 s fast a station 30 s past the phone clock is still locked", () => {
      created.layers = []
      created.data = {}
      const phone = Date.now()
      render(<GameMap arena={arena} dots={[]} serverNow={phone - 60_000} stations={[{ n: 1, lat: 3.01, lng: 101.01, lockedUntil: new Date(phone - 30_000).toISOString() }]} />)
      act(() => created.load!())
      const props = (created.data.stations as { features: { properties: Record<string, unknown> }[] }).features[0].properties
      expect(props).toMatchObject({ locked: true, left: '0:30' })
    })

    it('without serverNow the phone clock is used', () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} stations={[{ n: 1, lat: 3.01, lng: 101.01, lockedUntil: new Date(Date.now() - 30_000).toISOString() }]} />)
      act(() => created.load!())
      expect((created.data.stations as { features: { properties: Record<string, unknown> }[] }).features[0].properties.locked).toBe(false)
    })

    it('turns a locked station back by itself when the lock ends, with no new props', () => {
      vi.useFakeTimers()
      try {
        created.layers = []
        created.data = {}
        const { unmount } = render(<GameMap arena={arena} dots={[]} stations={stations(new Date(Date.now() + 1500).toISOString())} />)
        act(() => created.load!())
        const props = () => (created.data.stations as { features: { properties: Record<string, unknown> }[] }).features[0].properties
        expect(props().locked).toBe(true)
        act(() => vi.advanceTimersByTime(2000))
        expect(props()).toMatchObject({ locked: false, left: '', rising: true })
        // One more refresh once its gem has risen, then no more.
        act(() => vi.advanceTimersByTime(1000))
        expect(props()).toMatchObject({ locked: false, rising: false })
        const before = created.data.stations
        act(() => vi.advanceTimersByTime(3000))
        expect(created.data.stations).toBe(before)
        unmount()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("Bomoh's and Mak Kau Hijau's reveal rings", () => {
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown>; filter?: unknown }

    it("draws a purple ring only around dots revealed by Bomoh, not Pak Guard's Focus", () => {
      created.layers = []
      created.data = {}
      const dots = [
        { id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: 'bomoh' as const },
        { id: 'r2', kind: 'runner' as const, lat: 3.3, lng: 101.3, at: '', revealedBy: 'focus' as const },
      ]
      render(<GameMap arena={arena} dots={dots} />)
      created.load!()
      const ids = created.layers.map((l) => l.id)
      expect(ids.indexOf('bomoh-reveal-ring')).toBeGreaterThan(ids.indexOf('points'))
      const ring = layer('bomoh-reveal-ring')
      expect(ring.filter).toEqual(['==', ['get', 'revealedBy'], 'bomoh'])
      expect(ring.paint['circle-stroke-color']).toBe('#C9A4FF')
      expect(layer('reveal-ring').filter).toEqual(['==', ['get', 'revealedBy'], 'focus'])
      expect(created.data.points).toMatchObject({ features: [{ properties: { revealedBy: 'bomoh' } }, { properties: { revealedBy: 'focus' } }] })
    })

    it('draws a green ring only around dots revealed by tapping green in Mak Kau Hijau', () => {
      created.layers = []
      created.data = {}
      const dots = [
        { id: 'r1', kind: 'runner' as const, lat: 3.1, lng: 101.1, at: '', revealedBy: 'hijau' as const },
        { id: 'r2', kind: 'runner' as const, lat: 3.3, lng: 101.3, at: '', revealedBy: 'bomoh' as const },
      ]
      render(<GameMap arena={arena} dots={dots} />)
      created.load!()
      const ids = created.layers.map((l) => l.id)
      expect(ids.indexOf('hijau-reveal-ring')).toBeGreaterThan(ids.indexOf('points'))
      const ring = layer('hijau-reveal-ring')
      expect(ring.filter).toEqual(['==', ['get', 'revealedBy'], 'hijau'])
      expect(ring.paint['circle-stroke-color']).toBe('#3FA86B')
      expect(layer('bomoh-reveal-ring').filter).toEqual(['==', ['get', 'revealedBy'], 'bomoh'])
    })
  })

  describe("the house-arrest circle (Super Ring)", () => {
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown> }

    it('draws a solid orange 26 m circle and frames the camera on it', () => {
      created.layers = []
      created.data = {}
      created.fits = []
      created.fitOpts = []
      render(<GameMap arena={arena} dots={[]} circle={{ lat: 3.1, lng: 101.1, radiusM: 26 }} />)
      act(() => created.load!())
      expect(layer('house-line').paint['line-color']).toBe('#FFA94D')
      expect(layer('house-line').paint['line-dasharray']).toBeUndefined()
      expect(created.data.house).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      expect(created.fits.length).toBeGreaterThan(0)
    })

    it('frames the 26 m circle close: up to zoom 19, a little past the circle edge', () => {
      created.fits = []
      created.fitOpts = []
      render(<GameMap arena={arena} dots={[]} circle={{ lat: 3.1, lng: 101.1, radiusM: 26 }} />)
      act(() => created.load!())
      expect(created.fitOpts.at(-1)).toMatchObject({ maxZoom: 19 })
      const [[w, s], [e, n]] = created.fits.at(-1) as [[number, number], [number, number]]
      // About 1.3 × 26 m each way from the centre: the circle fills most of the frame.
      const halfM = ((n - s) / 2) * 111_320
      expect(halfM).toBeGreaterThan(26)
      expect(halfM).toBeLessThan(40)
      expect((w + e) / 2).toBeCloseTo(101.1, 6)
    })

    it("other maps keep the street-level cap", () => {
      created.fitOpts = []
      render(<GameMap arena={arena} dots={[]} fit={[{ lat: 3.1, lng: 101.1 }, { lat: 3.11, lng: 101.11 }]} />)
      act(() => created.load!())
      expect(created.fitOpts.at(-1)).toMatchObject({ maxZoom: 17 })
    })

    it('draws nothing without a circle', () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(created.data.house).toMatchObject({ features: [] })
    })
  })
  describe('map lettering', () => {
    it('every text layer is lowercase, since Kejar Hand has no capitals', () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      const text = created.layers.filter((l) => (l as unknown as { layout?: Record<string, unknown> }).layout?.['text-field'] !== undefined) as unknown as {
        id: string
        layout: Record<string, unknown>
      }[]
      expect(text.map((l) => l.id)).toEqual(expect.arrayContaining(['toilets', 'wanted-pin-label', 'toll-gate-labels', 'pin-labels', 'labels', 'snapshot-labels']))
      for (const l of text) expect(l.layout['text-transform'], l.id).toBe('lowercase')
    })
  })

  describe('floating markers in 3D', () => {
    const layer = (id: string) =>
      created.layers.find((l) => l.id === id) as unknown as { source: string; filter?: unknown; layout: Record<string, unknown>; paint?: Record<string, unknown> }
    const locked = (ms: number) => [{ n: 1, lat: 3.01, lng: 101.01, lockedUntil: new Date(Date.now() + ms).toISOString() }]
    const open = [{ n: 1, lat: 3.01, lng: 101.01, lockedUntil: null }]
    let frames: FrameRequestCallback[] = []
    let scheduled = 0
    const runFrame = (t: number) => {
      const pending = frames
      frames = []
      for (const cb of pending) cb(t)
    }
    const translates = (id: string) => created.paints.filter((p) => p.id === id && p.prop === 'icon-translate')

    beforeEach(() => {
      created.layers = []
      created.data = {}
      created.vis = []
      created.eases = []
      created.paints = []
      frames = []
      scheduled = 0
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        frames.push(cb)
        return ++scheduled
      })
      vi.stubGlobal('cancelAnimationFrame', () => {
        frames = []
      })
      localStorage.setItem('kejar.map3d', '1')
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      localStorage.clear()
      reduce.on = false
    })

    it('the stored 3D view is applied after the markers exist: float layers shown, flat ones hidden, eased once', () => {
      render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      for (const id of ['float-j', 'float-j-ghost', 'float-gem', 'float-tupper', 'landed-gem', 'landed-timer']) expect(created.vis).toContain(`${id}:visibility:visible`)
      for (const id of ['points-j', 'fuzzy-j', 'stations', 'pins-tupper', 'stash']) expect(created.vis).toContain(`${id}:visibility:none`)
      expect(created.eases).toEqual([{ pitch: 58, duration: 0 }])
    })

    it('a claimed gem lands red with its time left in the map font; open gems float over the stations', () => {
      render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      expect(layer('landed-timer').layout['text-field']).toEqual(['get', 'left'])
      expect(layer('landed-timer').layout['text-font']).toEqual(MAP_FONT)
      expect(layer('landed-timer').source).toBe('stations')
      expect(layer('landed-gem').layout).toMatchObject({ 'icon-image': 'gem-red', 'icon-size': 1.2, 'icon-anchor': 'bottom', 'icon-offset': [0, 6] })
      expect(layer('landed-gem-dropping').layout).toEqual(layer('landed-gem').layout)
      expect(layer('float-gem-rising').layout).toEqual(layer('float-gem').layout)
      expect(layer('float-gem').layout).toMatchObject({ 'icon-image': 'gem-volt-float', 'icon-size': 1.2, 'icon-anchor': 'bottom' })
      expect(layer('float-j').layout['icon-image']).toEqual(['concat', ['match', ['get', 'kind'], 'chaser', 'j-chaser', 'j-runner'], '-float'])
      expect(layer('float-tupper').layout['icon-image']).toBe('gem-gold-float')
    })

    it('with reduced motion no frame is scheduled and nothing is translated', () => {
      reduce.on = true
      render(<GameMap arena={arena} dots={[]} stations={locked(30_000)} />)
      act(() => created.load!())
      expect(scheduled).toBe(0)
      expect(created.paints.filter((p) => p.prop === 'icon-translate')).toEqual([])
    })

    it('bobs in 3D, and stops when the view goes flat', () => {
      render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      expect(frames.length).toBe(1)
      runFrame(performance.now())
      expect(translates('float-j').length).toBe(1)
      fireEvent.click(screen.getByRole('button', { name: 'Show buildings flat' }))
      expect(frames).toEqual([])
    })

    it('every float layer goes under the alert pins, so an SOS is never covered', () => {
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      for (const id of FLOAT_MARKER_LAYERS) expect(created.layers.find((l) => l.id === id)?.before).toBe('pins-pulse')
    })

    it("the Tupperware '?' label hides with its flat diamond in 3D; alert labels stay", () => {
      render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(layer('pins-tupper-labels').filter).toEqual(['!=', ['get', 'side'], ''])
      expect(layer('pin-labels').filter).toEqual(['==', ['get', 'side'], ''])
      expect(created.vis).toContain('pins-tupper-labels:visibility:none')
      expect(created.vis.some((v) => v.startsWith('pin-labels:'))).toBe(false)
    })

    it('a just-locked gem is placed at hover height at once, with no frame on the ground first', () => {
      const { rerender } = render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      rerender(<GameMap arena={arena} dots={[]} stations={locked(30_000)} />)
      expect((translates('landed-gem-dropping').at(-1)!.v as number[])[1]).toBeLessThan(-30)
    })

    it('a station turning locked drops its gem from hover height', () => {
      const { rerender } = render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      runFrame(performance.now())
      expect((translates('landed-gem-dropping').at(-1)!.v as number[])[1]).toBe(0)
      rerender(<GameMap arena={arena} dots={[]} stations={locked(30_000)} />)
      runFrame(performance.now() + 40)
      expect((translates('landed-gem-dropping').at(-1)!.v as number[])[1]).toBeLessThan(-30)
    })

    it('every layer the motion moves has no transition (MapLibre would otherwise ease each frame over 300 ms)', () => {
      render(<GameMap arena={arena} dots={[]} stations={open} />)
      act(() => created.load!())
      for (const id of FLOAT_TRANSLATE_LAYERS) {
        expect(layer(id), id).toBeDefined()
        expect(layer(id).paint?.['icon-translate-transition'], id).toEqual({ duration: 0, delay: 0 })
      }
    })

    it('the dropping and rising gem layers float and hide with the rest of the 3D markers', () => {
      for (const id of ['landed-gem-dropping', 'float-gem-rising']) expect(FLOAT_MARKER_LAYERS).toContain(id)
    })

    it("locking station 2 moves only station 2's gem to the dropping layer; the other open gems stay on the steady one", () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'performance'] })
      try {
        const three = (s2: string | null) => [
          { n: 1, lat: 3.01, lng: 101.01, lockedUntil: null },
          { n: 2, lat: 3.02, lng: 101.02, lockedUntil: s2 },
          { n: 3, lat: 3.03, lng: 101.03, lockedUntil: null },
        ]
        const { rerender } = render(<GameMap arena={arena} dots={[]} stations={three(null)} />)
        act(() => created.load!())
        const on = (id: string, n: string) => {
          const f = (created.data.stations as { features: { properties: Record<string, unknown> }[] }).features.find((x) => x.properties.n === n)!
          return featureFilter(layer(id).filter as FilterSpecification).filter({ zoom: 16 }, { type: 1, properties: f.properties, geometry: [] } as never)
        }
        const layersOf = (n: string) => ['float-gem', 'float-gem-rising', 'landed-gem', 'landed-gem-dropping'].filter((id) => on(id, n))
        for (const n of ['1', '2', '3']) expect(layersOf(n)).toEqual(['float-gem'])
        rerender(<GameMap arena={arena} dots={[]} stations={three(new Date(Date.now() + 1500).toISOString())} />)
        expect(layersOf('2')).toEqual(['landed-gem-dropping'])
        expect(layersOf('1')).toEqual(['float-gem'])
        expect(layersOf('3')).toEqual(['float-gem'])
        act(() => vi.advanceTimersByTime(1000))
        expect(layersOf('2')).toEqual(['landed-gem'])
        // The lock ends by itself: station 2 rises; the others never leave the steady layer.
        act(() => vi.advanceTimersByTime(1000))
        expect(layersOf('2')).toEqual(['float-gem-rising'])
        expect(layersOf('1')).toEqual(['float-gem'])
        // The refresh keeps going until the rise is over, so the gem goes back to the steady layer.
        act(() => vi.advanceTimersByTime(1000))
        expect(layersOf('2')).toEqual(['float-gem'])
        expect(layersOf('3')).toEqual(['float-gem'])
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
