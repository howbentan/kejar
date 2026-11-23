import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Click = { point: { x: number; y: number }; lngLat: { lat: number; lng: number } }
type Pin = { options: { draggable?: boolean; element?: HTMLElement }; at: number[]; handlers: Record<string, () => void>; removed: boolean }
type Layer = { id: string; type: string; source?: string; layout?: Record<string, unknown> }
const map = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: Click) => void>,
  fits: [] as unknown[],
  pins: [] as Pin[],
  options: [] as Record<string, unknown>[],
  layers: [] as Layer[],
  vis: {} as Record<string, string>,
  eases: [] as Record<string, unknown>[],
}))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => false }))
vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      constructor(o: Record<string, unknown>) {
        map.options.push(o)
      }
      on(event: string, cb: (e: Click) => void) {
        map.handlers[event] = cb
      }
      remove() {}
      getSource() {
        return undefined
      }
      addSource() {}
      addLayer(l: Layer) {
        map.layers.push(l)
      }
      getLayer(id: string) {
        return id === 'buildings-3d' || map.layers.some((l) => l.id === id) ? { id } : undefined
      }
      setLayoutProperty(id: string, prop: string, v: string) {
        if (prop === 'visibility') map.vis[id] = v
      }
      setPaintProperty() {}
      easeTo(o: Record<string, unknown>) {
        map.eases.push(o)
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
import { FLOAT_MARKER_LAYERS } from './mapView'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

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
  describe('the Ink map', () => {
    const load = () => {
      map.layers = []
      map.vis = {}
      map.eases = []
      localStorage.clear()
      render(<PlaceMap {...base} mode="stations" onTap={vi.fn()} onStationRemove={vi.fn()} />)
      act(() => map.handlers.load({} as Click))
    }

    it('draws placed stations as the volt diamond, with no numbers', () => {
      load()
      const st = map.layers.find((l) => l.id === 'stations')!
      expect(st.type).toBe('symbol')
      expect(st.layout!['icon-image']).toBe('dia-volt')
      expect(map.layers.some((l) => l.id === 'station-numbers')).toBe(false)
    })

    it('floats the gem over a shadow in 3D', () => {
      load()
      expect(map.layers.find((l) => l.id === 'float-gem')!.layout!['icon-image']).toBe('gem-volt-float')
      expect(map.layers.some((l) => l.id === 'float-shadow-gem')).toBe(true)
      expect(FLOAT_MARKER_LAYERS).toContain('float-shadow-gem')
      expect(map.vis['float-shadow-gem']).toBe('none')
    })

    it('has the view button, which toggles buildings-3d and the stations', () => {
      load()
      expect(map.vis['buildings-3d']).toBe('none')
      fireEvent.click(screen.getByRole('button', { name: 'Show buildings in 3D' }))
      expect(map.vis['buildings-3d']).toBe('visible')
      expect(map.vis.stations).toBe('none')
      expect(map.vis['float-gem']).toBe('visible')
      expect(map.eases.at(-1)).toMatchObject({ pitch: 58 })
    })

    it('a tap near a station removes it with the map pitched', () => {
      const onStationRemove = vi.fn()
      render(<PlaceMap {...base} mode="stations" onTap={vi.fn()} onStationRemove={onStationRemove} />)
      act(() => map.handlers.load({} as Click))
      fireEvent.click(screen.getByRole('button', { name: 'Show buildings in 3D' }))
      map.handlers.click({ point: { x: 101_010, y: 3_010 }, lngLat: { lat: 3, lng: 101 } })
      expect(onStationRemove).toHaveBeenCalledWith(0)
    })

    it('in 3D a tap on the lifted gem removes the station instead of placing one', () => {
      const onTap = vi.fn()
      const onStationRemove = vi.fn()
      render(<PlaceMap {...base} mode="stations" onTap={onTap} onStationRemove={onStationRemove} />)
      act(() => map.handlers.load({} as Click))
      fireEvent.click(screen.getByRole('button', { name: 'Show buildings in 3D' }))
      map.handlers.click({ point: { x: 101_000, y: 3_000 - 58 }, lngLat: { lat: 3.1, lng: 101 } })
      expect(onStationRemove).toHaveBeenCalledWith(0)
      expect(onTap).not.toHaveBeenCalled()
    })

    it('flat, a tap up where the gem would float still places', () => {
      const onTap = vi.fn()
      render(<PlaceMap {...base} mode="stations" onTap={onTap} onStationRemove={vi.fn()} />)
      act(() => map.handlers.load({} as Click))
      map.handlers.click({ point: { x: 101_000, y: 3_000 - 58 }, lngLat: { lat: 3.1, lng: 101 } })
      expect(onTap).toHaveBeenCalled()
    })
  })

  it('uses the slim credit instead of MapLibre attribution box', () => {
    map.options = []
    const { container } = render(<PlaceMap {...base} mode="stations" onTap={vi.fn()} onStationRemove={vi.fn()} />)
    expect(map.options.at(-1)!.attributionControl).toBe(false)
    expect(container.querySelector('.map-credit')).not.toBeNull()
  })

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
