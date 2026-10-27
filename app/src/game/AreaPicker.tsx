import type { Feature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { KL_FALLBACK } from '../../shared/arenaDraft.js'
import { MAX_STATIONS } from '../../shared/ids.js'
import { circlePolygon, distanceM } from '../../shared/geo.js'
import type { LatLng } from '../../shared/types.js'
import { kejarMapStyle } from './mapStyle'

const VOLT = '#C6FF3D'
/** Where the picker opens if this device can't say where it is. */
const FALLBACK = KL_FALLBACK

/** How close (in screen pixels) a tap must be to an existing station to remove it. */
const REMOVE_PX = 25

function stationPoints(stations: LatLng[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s, k) => ({
      type: 'Feature',
      properties: { n: String(k + 1) },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  }
}

function circle(center: LatLng, radiusM: number): FeatureCollection {
  const ring = circlePolygon(center, radiusM, 48).map((p) => [p.lng, p.lat])
  const f: Feature<Geometry> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } }
  return { type: 'FeatureCollection', features: [f] }
}

/**
 * Move the map so the circle covers the play area. The circle stays in the middle of the map;
 * `onChange` reports its centre whenever the map stops moving. Tapping inside the circle drops
 * a power-up station (up to 8); tapping a station removes it.
 */
export default function AreaPicker({
  radiusM,
  stations,
  onChange,
  onStationsChange,
}: {
  radiusM: number
  stations: LatLng[]
  onChange: (center: LatLng) => void
  onStationsChange: (stations: LatLng[]) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const radius = useRef(radiusM)
  radius.current = radiusM
  const report = useRef(onChange)
  report.current = onChange
  const placed = useRef(stations)
  placed.current = stations
  const reportStations = useRef(onStationsChange)
  reportStations.current = onStationsChange
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
      m.addSource('stations', { type: 'geojson', data: stationPoints(placed.current) })
      m.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: { 'circle-radius': 10, 'circle-color': '#0A0A0B', 'circle-stroke-color': VOLT, 'circle-stroke-width': 2 },
      })
      m.addLayer({
        id: 'station-numbers',
        type: 'symbol',
        source: 'stations',
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': VOLT },
      })
      report.current(centre())
    })
    m.on('click', (e) => {
      const list = placed.current
      const hit = list.findIndex((s) => {
        const p = m.project([s.lng, s.lat])
        return Math.hypot(p.x - e.point.x, p.y - e.point.y) <= REMOVE_PX
      })
      if (hit >= 0) return reportStations.current(list.filter((_, k) => k !== hit))
      const spot = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (list.length >= MAX_STATIONS || distanceM(centre(), spot) > radius.current) return
      reportStations.current([...list, spot])
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

  useEffect(() => {
    ;(map.current?.getSource('stations') as GeoJSONSource | undefined)?.setData(stationPoints(stations))
  }, [stations])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ height: 300, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      <div className="picker-cross" aria-hidden="true" />
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        {locating
          ? 'Finding you…'
          : 'Drag the map so the circle covers your play area, then tap to add up to 8 stations · tap one to remove it.'}
      </p>
    </div>
  )
}
