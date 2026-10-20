import type { Feature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { ARENAS } from '../../shared/arenas.js'
import { circlePolygon } from '../../shared/geo.js'
import type { LatLng } from '../../shared/types.js'
import { kejarMapStyle } from './mapStyle'

const VOLT = '#C6FF3D'
/** Where the picker opens if this device can't say where it is. */
const FALLBACK = ARENAS.titiwangsa.start

function circle(center: LatLng, radiusM: number): FeatureCollection {
  const ring = circlePolygon(center, radiusM, 48).map((p) => [p.lng, p.lat])
  const f: Feature<Geometry> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }
  return { type: 'FeatureCollection', features: [f] }
}

/**
 * Move the map so the circle covers the play area. The circle stays in the middle of the map;
 * `onChange` reports its centre whenever the map stops moving.
 */
export default function AreaPicker({ radiusM, onChange }: { radiusM: number; onChange: (center: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const radius = useRef(radiusM)
  radius.current = radiusM
  const report = useRef(onChange)
  report.current = onChange
  const [locating, setLocating] = useState(true)

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: kejarMapStyle,
      center: [FALLBACK.lng, FALLBACK.lat],
      zoom: 15.5,
      attributionControl: { compact: true },
    })
    map.current = m
    const centre = () => ({ lat: m.getCenter().lat, lng: m.getCenter().lng })
    const draw = () => (m.getSource('area') as GeoJSONSource | undefined)?.setData(circle(centre(), radius.current))
    m.on('load', () => {
      m.addSource('area', { type: 'geojson', data: circle(centre(), radius.current) })
      m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': VOLT, 'fill-opacity': 0.08 } })
      m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': VOLT, 'line-width': 2 } })
      report.current(centre())
    })
    m.on('move', draw)
    m.on('moveend', () => report.current(centre()))
    // Start where the organiser is, if the device knows.
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        m.jumpTo({ center: [p.coords.longitude, p.coords.latitude] })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    ;(m.getSource('area') as GeoJSONSource | undefined)?.setData(
      circle({ lat: m.getCenter().lat, lng: m.getCenter().lng }, radiusM),
    )
  }, [radiusM])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ height: 300, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      <div className="picker-cross" aria-hidden="true" />
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        {locating ? 'Finding you…' : 'Drag the map so the circle covers your play area.'}
      </p>
    </div>
  )
}
