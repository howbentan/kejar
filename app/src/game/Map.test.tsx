import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  count: 0,
  flights: [] as unknown[],
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
      remove() {}
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
  it('keeps one map when a poll returns an equal arena as a new object', () => {
    created.count = 0
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    expect(created.count).toBe(1)
  })

  it('Centre on me flies to my dot', () => {
    created.flights = []
    render(<GameMap arena={arena} dots={[{ id: 'me', kind: 'me', lat: 3.2, lng: 101.5, at: '' }]} />)
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
})
