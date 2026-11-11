import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Click = { point: { x: number; y: number }; lngLat: { lat: number; lng: number } }
type Pin = { options: { draggable?: boolean; element?: HTMLElement }; at: number[]; handlers: Record<string, () => void>; removed: boolean }
const map = vi.hoisted(() => ({ handlers: {} as Record<string, (e: Click) => void>, fits: [] as unknown[], pins: [] as Pin[] }))
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
    Marker: class {
      pin: Pin
      constructor(options: Pin['options']) {
        this.pin = { options, at: [], handlers: {}, removed: false }
        map.pins.push(this.pin)
      }
      setLngLat(at: number[]) {
        this.pin.at = at
        return this
      }
      getLngLat() {
        return { lng: this.pin.at[0], lat: this.pin.at[1] }
      }
      addTo() {
        return this
      }
      on(event: string, cb: () => void) {
        this.pin.handlers[event] = cb
        return this
      }
      remove() {
        this.pin.removed = true
      }
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

  describe('the circle handle', () => {
    const circle = { center: { lat: 3.1, lng: 101.1 }, radiusM: 200 }
    const props = { ...base, mode: 'circle' as const, onTap: vi.fn(), onStationRemove: vi.fn() }

    it('is a draggable marker at the circle centre, and dropping it moves the centre', () => {
      map.pins = []
      const onCircleMove = vi.fn()
      render(<PlaceMap {...props} circle={circle} onCircleMove={onCircleMove} />)
      const pin = map.pins.at(-1)!
      expect(pin.options.draggable).toBe(true)
      expect(pin.at).toEqual([101.1, 3.1])
      pin.at = [101.2, 3.2]
      pin.handlers.dragend()
      expect(onCircleMove).toHaveBeenCalledWith({ lat: 3.2, lng: 101.2 })
    })

    it('tapping the handle does not also tap the map', () => {
      map.pins = []
      render(<PlaceMap {...props} circle={circle} onCircleMove={vi.fn()} />)
      const el = map.pins.at(-1)!.options.element!
      const stop = vi.fn()
      const ev = new MouseEvent('click', { bubbles: true })
      ev.stopPropagation = stop
      el.dispatchEvent(ev)
      expect(stop).toHaveBeenCalled()
    })

    it('is removed when the circle goes away', () => {
      map.pins = []
      const { rerender } = render(<PlaceMap {...props} circle={circle} onCircleMove={vi.fn()} />)
      rerender(<PlaceMap {...props} circle={null} onCircleMove={vi.fn()} />)
      expect(map.pins.at(-1)!.removed).toBe(true)
    })

    it('has no handle without a circle', () => {
      map.pins = []
      render(<PlaceMap {...props} circle={null} onCircleMove={vi.fn()} />)
      expect(map.pins).toHaveLength(0)
    })
  })
})
