import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  count: 0,
  flights: [] as unknown[],
  fits: [] as unknown[],
  load: null as null | (() => void),
  layers: [] as { id: string; source: string }[],
  data: {} as Record<string, unknown>,
  markers: [] as { el: HTMLElement; lngLat?: number[]; removed: boolean }[],
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
      constructor() {
        created.count++
      }
      on(event: string, cb: () => void) {
        if (event === 'load') created.load = cb
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
      addLayer(l: { id: string; source: string }) {
        created.layers.push(l)
      }
      getSource(id: string) {
        return created.data[id] === undefined ? undefined : { setData: (d: unknown) => (created.data[id] = d) }
      }
      flyTo(opts: unknown) {
        created.flights.push(opts)
      }
      fitBounds(bounds: unknown) {
        created.fits.push(bounds)
      }
    },
  },
}))

import GameMap from './Map'

afterEach(cleanup)

const arena = {
  id: 'around-me',
  name: 'Around',
  boundary: [{ lat: 3, lng: 101 }],
  jail: { lat: 3, lng: 101 },
  start: { lat: 3, lng: 101 },
}

describe('GameMap', () => {
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
    expect(ids).toEqual(expect.arrayContaining(['holes', 'toilets', 'start', 'start-label']))
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
    expect(ids).toEqual(expect.arrayContaining(['jail', 'jail-label', 'start', 'start-label']))
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

  it('showJailAndStart={false} skips the jail/start circles and labels entirely (e.g. a scoped-down stub arena)', () => {
    created.layers = []
    created.data = {}
    render(<GameMap arena={arena} dots={[]} showJailAndStart={false} />)
    created.load!()
    const ids = created.layers.map((l) => l.id)
    expect(ids).not.toEqual(expect.arrayContaining(['jail', 'jail-label', 'start', 'start-label']))
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
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown>; filter?: unknown }
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

    it("the organiser's stash pin is legendary yellow at the exact spot", () => {
      created.layers = []
      created.data = {}
      const { rerender } = render(<GameMap arena={arena} dots={[]} stash={{ lat: 3.03, lng: 101.03 }} />)
      act(() => created.load!())
      expect(created.data.stash).toMatchObject({ features: [{ geometry: { type: 'Point', coordinates: [101.03, 3.03] } }] })
      expect(layer('stash').paint['circle-color']).toBe('#FFD60A')
      rerender(<GameMap arena={arena} dots={[]} stash={null} />)
      expect(created.data.stash).toMatchObject({ features: [] })
    })
  })

  describe("Dato Seri's hint zone", () => {
    const zone = { lat: 3.1, lng: 101.1, radiusM: 150 }
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown>; layout?: Record<string, unknown> }

    it('is a dashed legendary-yellow circle, never lime, with an unlabelled ? marker', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      render(<GameMap arena={arena} dots={[]} legendaryZone={zone} />)
      act(() => created.load!())
      expect(layer('legendary-line').paint['line-color']).toBe('#FFD60A')
      expect(layer('legendary-line').paint['line-dasharray']).toBeTruthy()
      for (const id of ['legendary-fill', 'legendary-line']) expect(JSON.stringify(layer(id).paint)).not.toMatch(/C6FF3D/i)
      expect(created.data.legendary).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      const mk = created.markers.at(-1)!
      expect(mk.lngLat).toEqual([101.1, 3.1])
      expect(mk.el.textContent).toBe('?')
      expect(mk.el).toHaveAttribute('aria-hidden', 'true')
      expect(mk.el.getAttribute('title')).toBeNull()
      // Secret (§4c): nothing in the zone names it.
      expect(JSON.stringify(created.data.legendary) + mk.el.outerHTML.replace(/legendary-/g, '')).not.toMatch(/dato|legendary|seri/i)
    })

    it('draws nothing with no zone, and follows the prop when it appears and goes', () => {
      created.layers = []
      created.data = {}
      const { rerender } = render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(created.data.legendary).toMatchObject({ features: [] })
      rerender(<GameMap arena={arena} dots={[]} legendaryZone={zone} />)
      expect(created.data.legendary).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      rerender(<GameMap arena={arena} dots={[]} legendaryZone={null} />)
      expect(created.data.legendary).toMatchObject({ features: [] })
    })

    it('is animated by CSS only; reduced motion marks it still, also when it flips mid-session', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      reduce.on = false
      const { rerender } = render(<GameMap arena={arena} dots={[]} legendaryZone={zone} />)
      act(() => created.load!())
      expect(created.markers.at(-1)!.el.dataset.still).toBeUndefined()
      reduce.on = true
      rerender(<GameMap arena={arena} dots={[]} legendaryZone={{ ...zone }} />)
      const first = created.markers[0]
      expect(first.removed).toBe(true)
      expect(created.markers.at(-1)!.el.dataset.still).toBe('true')
      expect(layer('legendary-line').paint['line-color']).toBe('#FFD60A')
      reduce.on = false
    })

    it('removes the marker when the zone goes', () => {
      created.markers = []
      const { rerender } = render(<GameMap arena={arena} dots={[]} legendaryZone={zone} />)
      act(() => created.load!())
      rerender(<GameMap arena={arena} dots={[]} legendaryZone={null} />)
      expect(created.markers.every((m) => m.removed)).toBe(true)
    })
  })
})
