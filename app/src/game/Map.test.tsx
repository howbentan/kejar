import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  count: 0,
  flights: [] as unknown[],
  fits: [] as unknown[],
  load: null as null | (() => void),
  layers: [] as { id: string; source: string }[],
  data: {} as Record<string, unknown>,
}))
vi.mock('maplibre-gl', () => ({
  default: {
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
})
