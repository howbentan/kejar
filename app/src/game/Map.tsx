import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { circlePolygon } from '../../shared/geo.js'
import type { Arena } from '../../shared/types.js'
import { FUZZ_RADIUS_M, type MapDot } from '../../shared/views.js'
import { kejarMapStyle } from './mapStyle'

const VOLT = '#C6FF3D'
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'

type Feature = GeoFeature<Geometry, Record<string, unknown>>
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

function ring(points: { lat: number; lng: number }[]): number[][] {
  const coords = points.map((p) => [p.lng, p.lat])
  return [...coords, coords[0]]
}

function dotFeatures(dots: MapDot[]) {
  const fuzzy: Feature[] = []
  const points: Feature[] = []
  for (const d of dots) {
    if (d.fuzzy) {
      fuzzy.push({
        type: 'Feature',
        properties: { missed: !!d.missed, label: d.label ?? '' },
        geometry: { type: 'Polygon', coordinates: [ring(circlePolygon(d, FUZZ_RADIUS_M))] },
      })
    } else {
      points.push({
        type: 'Feature',
        properties: { kind: d.kind, label: d.label ?? '' },
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      })
    }
  }
  return { fuzzy: collection(fuzzy), points: collection(points) }
}

/** The game map: arena boundary, jail, and role dots (spec §9 colour + shape rules). */
export default function GameMap({ arena, dots, height = 320 }: { arena: Arena; dots: MapDot[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const latest = useRef(dots)
  latest.current = dots
  // Polls return a fresh arena object every 3 s; rebuild the map only when its content changes.
  const arenaKey = JSON.stringify(arena)
  const arenaRef = useRef(arena)
  arenaRef.current = arena

  useEffect(() => {
    if (!el.current) return
    const arena = arenaRef.current
    const m = new maplibregl.Map({
      container: el.current,
      style: kejarMapStyle,
      center: [arena.start.lng, arena.start.lat],
      zoom: 16,
      attributionControl: { compact: true },
    })
    map.current = m
    m.on('load', () => {
      m.addSource('arena', {
        type: 'geojson',
        data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(arena.boundary) } }]),
      })
      m.addLayer({ id: 'arena', type: 'line', source: 'arena', paint: { 'line-color': WHITE, 'line-width': 1.5, 'line-opacity': 0.6 } })
      m.addSource('jail', {
        type: 'geojson',
        data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [arena.jail.lng, arena.jail.lat] } }]),
      })
      m.addLayer({
        id: 'jail',
        type: 'circle',
        source: 'jail',
        paint: { 'circle-radius': 9, 'circle-color': BLACK, 'circle-stroke-color': WHITE, 'circle-stroke-width': 1.5 },
      })
      const { fuzzy, points } = dotFeatures(latest.current)
      m.addSource('fuzzy', { type: 'geojson', data: fuzzy })
      m.addSource('points', { type: 'geojson', data: points })
      m.addLayer({ id: 'fuzzy-fill', type: 'fill', source: 'fuzzy', paint: { 'fill-color': WHITE, 'fill-opacity': 0.12 } })
      m.addLayer({
        id: 'fuzzy-line',
        type: 'line',
        source: 'fuzzy',
        filter: ['!', ['get', 'missed']],
        paint: { 'line-color': WHITE, 'line-width': 1.2 },
      })
      m.addLayer({
        id: 'fuzzy-missed',
        type: 'line',
        source: 'fuzzy',
        filter: ['get', 'missed'],
        paint: { 'line-color': WHITE, 'line-width': 1.2, 'line-dasharray': [2, 2] },
      })
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'me', 7, 5],
          'circle-color': ['match', ['get', 'kind'], 'chaser', VOLT, 'marshal', 'rgba(0,0,0,0)', WHITE],
          'circle-stroke-color': ['match', ['get', 'kind'], 'me', 'rgba(245,245,243,0.35)', 'marshal', WHITE, BLACK],
          'circle-stroke-width': ['match', ['get', 'kind'], 'me', 6, 'marshal', 2, 1.5],
        },
      })
      m.addLayer({
        id: 'labels',
        type: 'symbol',
        source: 'fuzzy',
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': WHITE },
      })
      ready.current = true
    })
    return () => {
      ready.current = false
      m.remove()
      map.current = null
    }
  }, [arenaKey])

  useEffect(() => {
    if (!ready.current || !map.current) return
    const { fuzzy, points } = dotFeatures(dots)
    ;(map.current.getSource('fuzzy') as GeoJSONSource | undefined)?.setData(fuzzy)
    ;(map.current.getSource('points') as GeoJSONSource | undefined)?.setData(points)
  }, [dots])

  /** Jump to my dot, or to this phone's own location when I don't have one (e.g. the organiser). */
  function centreOnMe() {
    const fly = (lng: number, lat: number) => map.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 800 })
    const me = latest.current.find((d) => d.kind === 'me')
    if (me) return fly(me.lng, me.lat)
    navigator.geolocation?.getCurrentPosition(
      (p) => fly(p.coords.longitude, p.coords.latitude),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10_000 },
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ height, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      <button type="button" className="map-me" onClick={centreOnMe} aria-label="Centre on me">
        <span aria-hidden="true">◎</span> Me
      </button>
    </div>
  )
}
