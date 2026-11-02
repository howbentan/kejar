import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { circlePolygon, distanceM } from '../../shared/geo.js'
import type { Arena, LatLng } from '../../shared/types.js'
import { FUZZ_RADIUS_M, type MapDot } from '../../shared/views.js'
import { kejarMapStyle } from './mapStyle'
import { RIPPLE_MS } from './ripple'

const VOLT = '#C6FF3D'
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'

type Feature = GeoFeature<Geometry, Record<string, unknown>>
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

function ring(points: { lat: number; lng: number }[]): number[][] {
  const coords = points.map((p) => [p.lng, p.lat])
  return [...coords, coords[0]]
}

function dotFeatures(dots: MapDot[], origin: LatLng | null = null) {
  const fuzzy: Feature[] = []
  const points: Feature[] = []
  for (const d of dots) {
    if (d.fuzzy) {
      fuzzy.push({
        type: 'Feature',
        // `dist` lets the ping ripple reveal each circle as its wave passes (motion design §8.1).
        properties: { missed: !!d.missed, label: d.label ?? '', dist: origin ? distanceM(d, origin) : 0 },
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
type StationMark = { n: number; lat: number; lng: number }

function stationFeatures(stations: StationMark[]): FeatureCollection {
  return collection(
    stations.map((s) => ({
      type: 'Feature',
      properties: { n: String(s.n) },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  )
}

type Pin = { id: string; lat: number; lng: number }

function pinFeatures(pins: Pin[]): FeatureCollection {
  return collection(
    pins.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
  )
}

function routeFeatures(route: { from: LatLng; to: LatLng } | null) {
  if (!route) return collection([])
  return collection([
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[route.from.lng, route.from.lat], [route.to.lng, route.to.lat]] } },
  ])
}

export default function GameMap({
  arena,
  dots,
  stations = [],
  pins = [],
  height = 320,
  route = null,
  ripple = null,
  showJailAndStart = true,
}: {
  arena: Arena
  dots: MapDot[]
  stations?: StationMark[]
  /** Safety alerts with a location (marshals only), drawn above everyone. */
  pins?: Pin[]
  /** Pixels, or '100%' to fill a sized parent (the chase screen). */
  height?: number | string
  /** A dashed lime line, e.g. the walk to Penjara (motion design §5). Worked out on the phone only. */
  route?: { from: LatLng; to: LatLng } | null
  /** The last ping: a lime wave rolls out from `origin`, revealing circles as it passes (motion design §8.1). */
  ripple?: { at: number; origin: LatLng } | null
  /**
   * False when `arena.jail`/`arena.start` aren't really the jail and start (e.g. a scoped-down stub arena,
   * built just so this map has something to centre on) — skips the jail circle + "PENJARA" label and the
   * start circle + "S" label, which would otherwise float on top of whatever `arena.jail`/`arena.start` is.
   */
  showJailAndStart?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const latest = useRef(dots)
  latest.current = dots
  const latestStations = useRef(stations)
  latestStations.current = stations
  const latestPins = useRef(pins)
  latestPins.current = pins
  const latestRoute = useRef(route)
  latestRoute.current = route
  const showJailAndStartRef = useRef(showJailAndStart)
  showJailAndStartRef.current = showJailAndStart
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
      // The map credit is required by OpenStreetMap, OpenMapTiles and OpenFreeMap; shown as one slim dark line
      // (tokens.css) instead of MapLibre's white pop-out box.
      attributionControl: { compact: false },
    })
    map.current = m
    m.on('load', () => {
      m.addSource('arena', {
        type: 'geojson',
        data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(arena.boundary) } }]),
      })
      m.addLayer({ id: 'arena', type: 'line', source: 'arena', paint: { 'line-color': WHITE, 'line-width': 1.5, 'line-opacity': 0.6 } })
      if (showJailAndStartRef.current) {
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
        m.addLayer({
          id: 'jail-label',
          type: 'symbol',
          source: 'jail',
          layout: { 'text-field': 'PENJARA', 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-letter-spacing': 0.15 },
          paint: { 'text-color': VOLT, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
        })
      }
      m.addSource('route', { type: 'geojson', data: routeFeatures(latestRoute.current) })
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': VOLT, 'line-width': 3, 'line-dasharray': [2, 2] },
      })
      // Lakes cut out of the park: outside the play area, so drawn like the boundary but dashed.
      m.addSource('holes', {
        type: 'geojson',
        data: collection(
          (arena.holes ?? []).map((h) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(h) } })),
        ),
      })
      m.addLayer({
        id: 'holes',
        type: 'line',
        source: 'holes',
        paint: { 'line-color': WHITE, 'line-width': 1.2, 'line-opacity': 0.6, 'line-dasharray': [2, 2] },
      })
      m.addSource('toilets', {
        type: 'geojson',
        data: collection(
          (arena.toilets ?? []).map((t) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [t.lng, t.lat] } })),
        ),
      })
      m.addLayer({
        id: 'toilets',
        type: 'symbol',
        source: 'toilets',
        layout: { 'text-field': 'WC', 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': WHITE },
      })
      if (showJailAndStartRef.current) {
        m.addSource('start', {
          type: 'geojson',
          data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [arena.start.lng, arena.start.lat] } }]),
        })
        m.addLayer({
          id: 'start',
          type: 'circle',
          source: 'start',
          paint: { 'circle-radius': 9, 'circle-color': BLACK, 'circle-stroke-color': WHITE, 'circle-stroke-width': 1.5 },
        })
        m.addLayer({
          id: 'start-label',
          type: 'symbol',
          source: 'start',
          layout: { 'text-field': 'S', 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
          paint: { 'text-color': WHITE },
        })
      }
      m.addSource('stations', { type: 'geojson', data: stationFeatures(latestStations.current) })
      m.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: { 'circle-radius': 9, 'circle-color': BLACK, 'circle-stroke-color': VOLT, 'circle-stroke-width': 2 },
      })
      m.addLayer({
        id: 'station-numbers',
        type: 'symbol',
        source: 'stations',
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': VOLT },
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
      m.addSource('pins', { type: 'geojson', data: pinFeatures(latestPins.current) })
      m.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'pins',
        paint: { 'circle-radius': 10, 'circle-color': VOLT, 'circle-stroke-color': WHITE, 'circle-stroke-width': 3 },
      })
      ready.current = true
    })
    return () => {
      ready.current = false
      m.remove()
      map.current = null
    }
  }, [arenaKey])

  const stationKey = JSON.stringify(stations)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('stations') as GeoJSONSource | undefined)?.setData(stationFeatures(latestStations.current))
  }, [stationKey])

  const routeKey = JSON.stringify(route)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('route') as GeoJSONSource | undefined)?.setData(routeFeatures(latestRoute.current))
  }, [routeKey])

  const pinKey = JSON.stringify(pins)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('pins') as GeoJSONSource | undefined)?.setData(pinFeatures(latestPins.current))
  }, [pinKey])

  useEffect(() => {
    if (!ready.current || !map.current) return
    // Keep each circle's distance from the last ripple, so a poll mid-wave doesn't reveal them all at once.
    const { fuzzy, points } = dotFeatures(dots, ripple?.origin ?? null)
    ;(map.current.getSource('fuzzy') as GeoJSONSource | undefined)?.setData(fuzzy)
    ;(map.current.getSource('points') as GeoJSONSource | undefined)?.setData(points)
  }, [dots])

  // The ping ripple: rings roll out from the origin, and each circle appears as the wave passes it.
  // Each ring is drawn at its final size and grows from nothing, so its outline stays thin (scaling a small
  // ring up would scale its outline with it).
  const [rings, setRings] = useState<{ x: number; y: number; r: number; key: number } | null>(null)
  const rippled = useRef<number | null>(null)
  const rippleAt = ripple?.at ?? null
  useEffect(() => {
    const mp = map.current
    if (!ripple || !mp || !ready.current || rippled.current === ripple.at) return
    rippled.current = ripple.at
    // Only a fresh ping: reopening Kejar later shows the circles as they are.
    if (Date.now() - ripple.at > 10_000) return
    navigator.vibrate?.([120, 60, 120])
    const box = mp.getContainer().getBoundingClientRect()
    const o = mp.project([ripple.origin.lng, ripple.origin.lat])
    const corners = [
      [0, 0],
      [box.width, 0],
      [0, box.height],
      [box.width, box.height],
    ] as const
    const maxPx = Math.max(...corners.map(([x, y]) => Math.hypot(x - o.x, y - o.y)))
    const maxM = Math.max(...corners.map(([x, y]) => distanceM(ripple.origin, mp.unproject([x, y]))))
    setRings({ x: o.x, y: o.y, r: maxPx, key: ripple.at })
    ;(mp.getSource('fuzzy') as GeoJSONSource | undefined)?.setData(dotFeatures(latest.current, ripple.origin).fuzzy)
    const base: Record<string, unknown> = { 'fuzzy-fill': null, 'fuzzy-line': ['!', ['get', 'missed']], 'fuzzy-missed': ['get', 'missed'], labels: null }
    const start = performance.now()
    let frame = 0
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / RIPPLE_MS)
      const r = maxM * (1 - (1 - t) ** 3)
      for (const [id, f] of Object.entries(base)) {
        const reach = ['<=', ['get', 'dist'], r]
        mp.setFilter(id, (f ? ['all', f, reach] : reach) as maplibregl.FilterSpecification)
      }
      if (map.current !== mp) return
      if (t < 1) frame = requestAnimationFrame(step)
      else {
        for (const [id, f] of Object.entries(base)) mp.setFilter(id, f as maplibregl.FilterSpecification | null)
        window.setTimeout(() => setRings(null), 200)
      }
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      // The screen may be going away mid-wave (caught right after a ping): a removed map has no style to reset.
      if (map.current !== mp || !ready.current) return
      for (const [id, f] of Object.entries(base)) mp.setFilter(id, f as maplibregl.FilterSpecification | null)
    }
    // Once per ping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rippleAt])

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
    <div style={{ position: 'relative', height: typeof height === 'string' ? height : undefined }}>
      <div ref={el} style={{ height, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      {rings && (
        <div className="ripple-rings" aria-hidden="true">
          {[0, 0.15, 0.3].map((d, k) => (
            <m.span
              key={`${rings.key}-${k}`}
              style={{ left: rings.x - rings.r, top: rings.y - rings.r, width: rings.r * 2, height: rings.r * 2 }}
              initial={{ scale: 0, opacity: k === 0 ? 0.9 : 0.45 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: RIPPLE_MS / 1000, delay: d, ease: [0.33, 1, 0.68, 1] }}
            />
          ))}
        </div>
      )}
      <button type="button" className="map-me" onClick={centreOnMe} aria-label="Centre on me">
        <span aria-hidden="true">◎</span> Me
      </button>
    </div>
  )
}
