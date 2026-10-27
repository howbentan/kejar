import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Click = { point: { x: number; y: number }; lngLat: { lat: number; lng: number } }
const map = vi.hoisted(() => ({ handlers: {} as Record<string, (e: Click) => void>, fits: [] as unknown[] }))
vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      on(event: string, cb: (e: Click) => void) {
        map.handlers[event] = cb
      }
      remove() {}
      getSource() {
        return undefined
      }
      // 1 degree = 1000 px, so a station at lng 101.0 sits at x = 101000.
      project([lng, lat]: [number, number]) {
        return { x: lng * 1000, y: lat * 1000 }
      }
      fitBounds(b: unknown) {
        map.fits.push(b)
      }
      jumpTo() {}
    },
  },
}))

import PlaceMap from './PlaceMap'

afterEach(cleanup)

const base = {
  boundary: null,
  holes: [],
  outline: null,
  circle: null,
  stations: [{ lat: 3, lng: 101 }],
  jail: null,
  start: null,
  toilets: [],
}

describe('PlaceMap', () => {
  it('taps go to onTap; a tap near a station in stations mode removes it', () => {
    const onTap = vi.fn()
    const onStationRemove = vi.fn()
    render(<PlaceMap {...base} mode="stations" onTap={onTap} onStationRemove={onStationRemove} />)
    map.handlers.click({ point: { x: 101_010, y: 3_010 }, lngLat: { lat: 3.00001, lng: 101.00001 } })
    expect(onStationRemove).toHaveBeenCalledWith(0)
    expect(onTap).not.toHaveBeenCalled()
    map.handlers.click({ point: { x: 101_200, y: 3_000 }, lngLat: { lat: 3, lng: 101.2 } })
    expect(onTap).toHaveBeenCalledWith({ lat: 3, lng: 101.2 })
  })

  it('in jail mode a tap near a station still places the jail', () => {
    const onTap = vi.fn()
    const onStationRemove = vi.fn()
    render(<PlaceMap {...base} mode="jail" onTap={onTap} onStationRemove={onStationRemove} />)
    map.handlers.click({ point: { x: 101_005, y: 3_005 }, lngLat: { lat: 3.000005, lng: 101.000005 } })
    expect(onTap).toHaveBeenCalledWith({ lat: 3.000005, lng: 101.000005 })
    expect(onStationRemove).not.toHaveBeenCalled()
  })

  it('frames a saved park from its boundary and does not jump to the phone', () => {
    map.fits = []
    const getCurrentPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
    const boundary = [
      { lat: 3.1, lng: 101.1 },
      { lat: 3.1, lng: 101.2 },
      { lat: 3.2, lng: 101.2 },
    ]
    render(<PlaceMap {...base} boundary={boundary} mode="stations" onTap={vi.fn()} onStationRemove={vi.fn()} />)
    expect(map.fits).toEqual([
      [
        [101.1, 3.1],
        [101.2, 3.2],
      ],
    ])
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })
})
