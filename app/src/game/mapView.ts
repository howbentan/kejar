import type maplibregl from 'maplibre-gl'
import { useCallback, useState } from 'react'
import { BUILDINGS_3D, FLAT_BUILDING_LAYERS } from './mapStyle'

const KEY = 'kejar.map3d'
/** Marker layers drawn flat on the ground vs floating above the buildings (GameMap adds both; `points` shows in either). */
export const FLAT_MARKER_LAYERS: string[] = ['points-j', 'fuzzy-j', 'stations', 'pins-tupper', 'pins-tupper-labels', 'stash']
export const FLOAT_MARKER_LAYERS: string[] = [
  'float-shadow-j',
  'float-shadow-ghost',
  'float-shadow-gem',
  'float-shadow-tupper',
  'float-shadow-stash',
  'float-gem',
  'float-gem-rising',
  'float-tupper',
  'float-tupper-stash',
  'landed-glow',
  'landed-gem',
  'landed-gem-dropping',
  'landed-timer',
  'float-j',
  'float-j-ghost',
]

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Flat or 3D, remembered per device. Storage can be blocked, so both ends are guarded. */
export function useMapView(): [threeD: boolean, toggle: () => void] {
  const [threeD, setThreeD] = useState(read)
  const toggle = useCallback(() => {
    setThreeD((on) => {
      try {
        localStorage.setItem(KEY, on ? '0' : '1')
      } catch {
        /* blocked storage: the view still flips for this visit */
      }
      return !on
    })
  }, [])
  return [threeD, toggle]
}

/** Shows the flat or the 3D layers and tilts the camera (its bearing stays). Layers the map lacks are skipped. */
export function applyMapView(m: maplibregl.Map, threeD: boolean, opts: { animate: boolean }): void {
  const show = (ids: string[], on: boolean) => {
    for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
  }
  show(FLAT_BUILDING_LAYERS, !threeD)
  show([BUILDINGS_3D], threeD)
  show(FLAT_MARKER_LAYERS, !threeD)
  show(FLOAT_MARKER_LAYERS, threeD)
  m.easeTo({ pitch: threeD ? 58 : 0, duration: opts.animate ? (threeD ? 1200 : 900) : 0 })
}
