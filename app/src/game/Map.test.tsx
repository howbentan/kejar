import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  count: 0,
  flights: [] as unknown[],
  fits: [] as unknown[],
  fitOpts: [] as unknown[],
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
      fitBounds(bounds: unknown, opts?: unknown) {
        created.fits.push(bounds)
        created.fitOpts.push(opts)
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

  it("gives a dot revealed by Tuch and Ga's toll gate its own layer, not Pak Guard's or Bomoh's", () => {
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

    it("Bomoh's stash pin is purple (M8)", () => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} stash={{ lat: 3.03, lng: 101.03 }} stashTone="purple" />)
      act(() => created.load!())
      expect(layer('stash').paint['circle-color']).toBe('#C9A4FF')
      expect(layer('stash').paint['circle-stroke-color']).toBe('#9B5DE5')
    })

    it.each([
      ['orange', '#FFA94D', '#E8590C'],
      ['green', '#3FA86B', '#1B6B3F'],
    ] as const)("Super Ring's and Mak Kau Hijau's stash pins are %s", (tone, main, deep) => {
      created.layers = []
      created.data = {}
      render(<GameMap arena={arena} dots={[]} stash={{ lat: 3.03, lng: 101.03 }} stashTone={tone} />)
      act(() => created.load!())
      expect(layer('stash').paint['circle-color']).toBe(main)
      expect(layer('stash').paint['circle-stroke-color']).toBe(deep)
    })

    it('walk pins carry their tone, and the pin colours have a case for each of the four', () => {
      created.layers = []
      created.data = {}
      const pins = [
        { id: 'ring', lat: 3.1, lng: 101.1, label: '?', tone: 'orange' as const },
        { id: 'hijau', lat: 3.2, lng: 101.2, label: '?', tone: 'green' as const },
      ]
      render(<GameMap arena={arena} dots={[]} pins={pins} />)
      act(() => created.load!())
      expect(created.data.pins).toMatchObject({
        features: [{ properties: { orange: true, green: false, yellow: false, purple: false } }, { properties: { green: true, orange: false } }],
      })
      const colours = JSON.stringify(layer('pins').paint['circle-color'])
      for (const hex of ['#FFD60A', '#FFA94D', '#C9A4FF', '#3FA86B']) expect(colours).toContain(hex)
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

  describe("Bomoh's hint zone and reveal ring", () => {
    const zone = { lat: 3.1, lng: 101.1, radiusM: 150 }
    const bomohZone = { lat: 3.2, lng: 101.2, radiusM: 120 }
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown>; filter?: unknown }

    it('is a dashed purple circle with an unlabelled ? marker, distinct from a simultaneous Dato zone', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      render(<GameMap arena={arena} dots={[]} legendaryZone={zone} bomohZone={bomohZone} />)
      act(() => created.load!())
      expect(layer('bomoh-legendary-line').paint['line-color']).toBe('#C9A4FF')
      expect(layer('bomoh-legendary-line').paint['line-dasharray']).toBeTruthy()
      expect(layer('legendary-line').paint['line-color']).toBe('#FFD60A')
      for (const id of ['bomoh-legendary-fill', 'bomoh-legendary-line']) expect(JSON.stringify(layer(id).paint)).not.toMatch(/C6FF3D|FFD60A/i)
      expect(created.data['bomoh-legendary']).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      expect(created.data.legendary).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      expect(created.data['bomoh-legendary']).not.toEqual(created.data.legendary)
      const mk = created.markers.find((m) => m.lngLat?.[0] === 101.2)!
      expect(mk.lngLat).toEqual([101.2, 3.2])
      expect(mk.el.textContent).toBe('?')
      expect(mk.el).toHaveAttribute('aria-hidden', 'true')
      expect(mk.el.getAttribute('title')).toBeNull()
      expect(JSON.stringify(created.data['bomoh-legendary']) + mk.el.outerHTML.replace(/(legendary|bomoh)-/g, '')).not.toMatch(/bomoh|dato|legendary|seri/i)
      expect(created.markers.some((m) => m.lngLat?.[0] === 101.1)).toBe(true)
    })

    it('draws nothing with no zone, follows the prop, and removes the marker when it goes', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      const { rerender } = render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(created.data['bomoh-legendary']).toMatchObject({ features: [] })
      rerender(<GameMap arena={arena} dots={[]} bomohZone={bomohZone} />)
      expect(created.data['bomoh-legendary']).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      rerender(<GameMap arena={arena} dots={[]} bomohZone={null} />)
      expect(created.data['bomoh-legendary']).toMatchObject({ features: [] })
      expect(created.markers.every((m) => m.removed)).toBe(true)
    })

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

  describe("Super Ring's and Mak Kau Hijau's hint zones (Plan E2)", () => {
    const ringZone = { lat: 3.4, lng: 101.4, radiusM: 140 }
    const hijauZone = { lat: 3.5, lng: 101.5, radiusM: 160 }
    const layer = (id: string) => created.layers.find((l) => l.id === id) as unknown as { paint: Record<string, unknown> }

    it('draws an orange and a green dashed circle, each with an unlabelled ? marker', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      render(<GameMap arena={arena} dots={[]} ringZone={ringZone} hijauZone={hijauZone} />)
      act(() => created.load!())
      expect(layer('ring-legendary-line').paint['line-color']).toBe('#FFA94D')
      expect(layer('hijau-legendary-line').paint['line-color']).toBe('#3FA86B')
      for (const id of ['ring-legendary-line', 'hijau-legendary-line']) expect(layer(id).paint['line-dasharray']).toBeTruthy()
      for (const id of ['ring-legendary-fill', 'ring-legendary-line', 'hijau-legendary-fill', 'hijau-legendary-line'])
        expect(JSON.stringify(layer(id).paint)).not.toMatch(/C6FF3D|FFD60A|C9A4FF/i)
      expect(created.data['ring-legendary']).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      expect(created.data['hijau-legendary']).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      const ring = created.markers.find((m) => m.lngLat?.[0] === 101.4)!
      const hijau = created.markers.find((m) => m.lngLat?.[0] === 101.5)!
      expect(ring.el.className).toContain('ring-marker')
      expect(hijau.el.className).toContain('hijau-marker')
      for (const mk of [ring, hijau]) {
        expect(mk.el.textContent).toBe('?')
        expect(mk.el.getAttribute('title')).toBeNull()
      }
      const said = JSON.stringify(created.data['ring-legendary']) + JSON.stringify(created.data['hijau-legendary'])
      expect(said).not.toMatch(/ring|hijau|super|legendary/i)
    })

    it('follows the props and removes the markers when they go', () => {
      created.layers = []
      created.data = {}
      created.markers = []
      const { rerender } = render(<GameMap arena={arena} dots={[]} />)
      act(() => created.load!())
      expect(created.data['ring-legendary']).toMatchObject({ features: [] })
      expect(created.data['hijau-legendary']).toMatchObject({ features: [] })
      rerender(<GameMap arena={arena} dots={[]} ringZone={ringZone} hijauZone={hijauZone} />)
      expect(created.data['hijau-legendary']).toMatchObject({ features: [{ geometry: { type: 'Polygon' } }] })
      rerender(<GameMap arena={arena} dots={[]} />)
      expect(created.data['ring-legendary']).toMatchObject({ features: [] })
      expect(created.markers.every((m) => m.removed)).toBe(true)
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
})
