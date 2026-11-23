// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { FLAT_MARKER_LAYERS, FLOAT_MARKER_LAYERS, applyMapView, useMapView } from './mapView'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function fakeMap(has: (id: string) => boolean = () => true) {
  const vis: Record<string, string> = {}
  const eases: Record<string, unknown>[] = []
  const m = {
    getLayer: (id: string) => (has(id) ? { id } : undefined),
    setLayoutProperty: (id: string, prop: string, v: string) => {
      if (prop === 'visibility') vis[id] = v
    },
    easeTo: (o: Record<string, unknown>) => eases.push(o),
  }
  return { m: m as unknown as maplibregl.Map, vis, eases }
}

describe('useMapView', () => {
  it('defaults to flat, writes 1 on toggle, and starts in 3D from a stored 1', () => {
    const a = renderHook(() => useMapView())
    expect(a.result.current[0]).toBe(false)
    act(() => a.result.current[1]())
    expect(a.result.current[0]).toBe(true)
    expect(localStorage.getItem('kejar.map3d')).toBe('1')
    act(() => a.result.current[1]())
    expect(localStorage.getItem('kejar.map3d')).toBe('0')
    localStorage.setItem('kejar.map3d', '1')
    expect(renderHook(() => useMapView()).result.current[0]).toBe(true)
  })

  it('starts flat and still toggles when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useMapView())
    expect(result.current[0]).toBe(false)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
  })
})

describe('applyMapView', () => {
  it('3D shows the extrusions, hides the flat buildings and tilts to 58', () => {
    const { m, vis, eases } = fakeMap()
    applyMapView(m, true, { animate: true })
    expect(vis['buildings-3d']).toBe('visible')
    expect(vis.buildings).toBe('none')
    expect(vis['buildings-line']).toBe('none')
    expect(eases).toEqual([{ pitch: 58, duration: 1200 }])
  })

  it('flat does the reverse and levels to 0; no animation means duration 0', () => {
    const { m, vis, eases } = fakeMap()
    applyMapView(m, false, { animate: true })
    expect(vis['buildings-3d']).toBe('none')
    expect(vis.buildings).toBe('visible')
    expect(eases).toEqual([{ pitch: 0, duration: 900 }])
    applyMapView(m, true, { animate: false })
    expect(eases[1]).toEqual({ pitch: 58, duration: 0 })
  })

  it('3D shows the floating markers and hides the flat ones; flat does the reverse', () => {
    expect(FLAT_MARKER_LAYERS).toEqual(['points-j', 'fuzzy-j', 'stations', 'pins-tupper', 'pins-tupper-labels', 'stash'])
    for (const id of ['float-j', 'float-gem', 'float-tupper', 'landed-glow', 'landed-gem', 'landed-timer']) expect(FLOAT_MARKER_LAYERS).toContain(id)
    expect(FLOAT_MARKER_LAYERS.some((id) => id.startsWith('float-shadow'))).toBe(true)
    const { m, vis } = fakeMap()
    applyMapView(m, true, { animate: false })
    for (const id of FLOAT_MARKER_LAYERS) expect(vis[id]).toBe('visible')
    for (const id of FLAT_MARKER_LAYERS) expect(vis[id]).toBe('none')
    applyMapView(m, false, { animate: false })
    for (const id of FLOAT_MARKER_LAYERS) expect(vis[id]).toBe('none')
    for (const id of FLAT_MARKER_LAYERS) expect(vis[id]).toBe('visible')
  })

  it('skips layers the map does not have', () => {
    const { m, vis } = fakeMap((id) => id === 'buildings')
    expect(() => applyMapView(m, true, { animate: false })).not.toThrow()
    expect(Object.keys(vis)).toEqual(['buildings'])
  })
})
