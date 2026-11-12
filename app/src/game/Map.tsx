import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { circlePolygon, distanceM } from '../../shared/geo.js'
import type { SecretTone } from '../../shared/kit.js'
import type { Arena, LatLng } from '../../shared/types.js'
import { CHASER_SNAPSHOT_FUZZ_M, FUZZ_RADIUS_M, type ChaserSnapshot, type MapDot } from '../../shared/views.js'
import { kejarMapStyle } from './mapStyle'
import { RIPPLE_MS } from './ripple'
import { SlideTracker } from './slideOff'

const VOLT = '#C6FF3D'
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'

type LegendaryZone = { lat: number; lng: number; radiusM: number }

/**
 * Dato Seri's yellow. MapLibre can't read CSS variables, so read tokens.css --legendary-1/2/3 and --legendary-ink
 * once; the fallback hex values mirror those tokens (#FFF27A, #FFD60A, #F5B800, #1A1400) and must change with them.
 */
function legendaryYellow() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { fill: token('--legendary-1', '#FFF27A'), main: token('--legendary-2', '#FFD60A'), deep: token('--legendary-3', '#F5B800'), ink: token('--legendary-ink', '#1A1400') }
}

/** Bomoh's purple, read from tokens.css --bomoh-1/2/3 and --bomoh-ink; the fallbacks (#F0E0FF, #C9A4FF, #9B5DE5, #2B0B45) must change with them. */
function legendaryPurple() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { fill: token('--bomoh-1', '#F0E0FF'), main: token('--bomoh-2', '#C9A4FF'), deep: token('--bomoh-3', '#9B5DE5'), ink: token('--bomoh-ink', '#2B0B45') }
}

/** Super Ring's cheese orange, read from tokens.css --ring-1/2/3 and --ring-ink; the fallbacks (#FFE0B8, #FFA94D, #E8590C, #3A1A00) must change with them. */
function legendaryOrange() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { fill: token('--ring-1', '#FFE0B8'), main: token('--ring-2', '#FFA94D'), deep: token('--ring-3', '#E8590C'), ink: token('--ring-ink', '#3A1A00') }
}

/** Mak Kau Hijau's deep green, read from tokens.css --hijau-1/2/3 and --hijau-ink; the fallbacks (#CDEFD8, #3FA86B, #1B6B3F, #06240F) must change with them. */
function legendaryGreen() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { fill: token('--hijau-1', '#CDEFD8'), main: token('--hijau-2', '#3FA86B'), deep: token('--hijau-3', '#1B6B3F'), ink: token('--hijau-ink', '#06240F') }
}

export type { SecretTone }
const toneColours = (tone: SecretTone) =>
  tone === 'purple' ? legendaryPurple() : tone === 'orange' ? legendaryOrange() : tone === 'green' ? legendaryGreen() : legendaryYellow()

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
        properties: { kind: d.kind, label: d.label ?? '', revealedBy: d.revealedBy },
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

/**
 * A pin. The walk-the-park guide sets a `label` (drawn on the pin), a `state` (todo is outlined, next pulses, placed is
 * filled) and, for a secret card's step, its colour as `tone`. Plain pins (safety alerts) leave them out and draw as filled lime.
 */
type Pin = { id: string; lat: number; lng: number; label?: string; state?: 'todo' | 'next' | 'placed'; tone?: SecretTone }

function pinFeatures(pins: Pin[]): FeatureCollection {
  return collection(
    pins.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        label: p.label ?? '',
        state: p.state ?? 'placed',
        yellow: p.tone === 'yellow',
        orange: p.tone === 'orange',
        purple: p.tone === 'purple',
        green: p.tone === 'green',
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  )
}

/** Tuch and Ga's gates, on the chaser map only (the view sends them to chasers and no one else). */
function tollGateFeatures(gates: LatLng[]): FeatureCollection {
  return collection(gates.map((g) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [g.lng, g.lat] } })))
}

/** The chasers frozen at a check-in's alert (checkins design §5): a 30 m circle each, labelled, dashed when stale. */
function snapshotFeatures(s: ChaserSnapshot | null): FeatureCollection {
  return collection(
    (s?.positions ?? []).map((p) => ({
      type: 'Feature',
      properties: { label: p.name, stale: p.stale },
      geometry: { type: 'Polygon', coordinates: [ring(circlePolygon(p, CHASER_SNAPSHOT_FUZZ_M))] },
    })),
  )
}

/** Exactly where the stash is: the organiser's and marshals' setup map only (jail design §4b). */
function stashFeatures(s: LatLng | null): FeatureCollection {
  return collection(s ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } }] : [])
}

/** The hint zone's circle (no names anywhere: secret, jail design §4c). */
function zoneFeatures(z: LegendaryZone | null) {
  return {
    zone: collection(z ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(circlePolygon(z, z.radiusM))] } }] : []),
  }
}

function routeFeatures(route: { from: LatLng; to: LatLng } | null) {
  if (!route) return collection([])
  return collection([
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[route.from.lng, route.from.lat], [route.to.lng, route.to.lat]] } },
  ])
}

/** Frames the camera on every point at once (at most street level), e.g. a marshal and the SOS they're walking to. */
function fitTo(m: maplibregl.Map, points: LatLng[] | null, maxZoom = 17, padding = 40) {
  if (!points || points.length < 2) return
  const lngs = points.map((p) => p.lng)
  const lats = points.map((p) => p.lat)
  m.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding, maxZoom, animate: false },
  )
}

/**
 * The house-arrest circle is only 26 m across the radius: frame it close (up to zoom 19, small padding) so it fills
 * most of the map and the runner's dot reads clearly inside it. Other maps keep `fitTo`'s street-level cap.
 */
const HOUSE_MAX_ZOOM = 19
const HOUSE_PADDING = 12

/** Two corners a little outside a circle, so `fitTo` frames the whole of it (about 1.3× its radius each way). */
function circleBox(c: LegendaryZone | null): LatLng[] | null {
  if (!c) return null
  const dLat = (c.radiusM * 1.3) / 111_320
  const dLng = dLat / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180))
  return [
    { lat: c.lat - dLat, lng: c.lng - dLng },
    { lat: c.lat + dLat, lng: c.lng + dLng },
  ]
}

/**
 * A secret hint zone after the first one (Bomoh, Super Ring, Mak Kau Hijau): its source follows the prop, and its
 * unlabelled ? badge is an HTML marker tinted by `markerClass` in CSS, marked still under reduced motion.
 */
function useHintZone(
  map: { current: maplibregl.Map | null },
  ready: { current: boolean },
  loaded: boolean,
  reduce: boolean | null,
  source: string,
  markerClass: string,
  zone: LegendaryZone | null,
) {
  const latest = useRef(zone)
  latest.current = zone
  const key = JSON.stringify(zone)
  useEffect(() => {
    const mp = map.current
    if (!ready.current || !mp) return
    ;(mp.getSource(source) as GeoJSONSource | undefined)?.setData(zoneFeatures(latest.current).zone)
    const z = latest.current
    if (!z) return
    const el = document.createElement('div')
    el.className = `legendary-marker ${markerClass}`
    el.setAttribute('aria-hidden', 'true')
    if (reduce) el.dataset.still = 'true'
    el.innerHTML = '<i class="legendary-ring"></i><b>?</b>'
    const marker = new maplibregl.Marker({ element: el }).setLngLat([z.lng, z.lat]).addTo(mp)
    return () => {
      marker.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduce, loaded])
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
  fit = null,
  legendaryZone = null,
  bomohZone = null,
  ringZone = null,
  hijauZone = null,
  circle = null,
  snapshot = null,
  stash = null,
  stashTone = 'yellow',
  tollGates = [],
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
  /**
   * Keep these points in view instead of the fixed zoom on the arena's start (the SOS takeover's mini map).
   * Re-framed as they move, without rebuilding the map.
   */
  fit?: LatLng[] | null
  /** Dato Seri's hint zone: a dashed yellow circle with a twinkling ? and a slow ripple, never a name (jail design §4a, §4c). */
  legendaryZone?: LegendaryZone | null
  /** Bomoh's hint zone: the same unlabelled ? circle as Dato Seri's, only purple. */
  bomohZone?: LegendaryZone | null
  /** Super Ring's hint zone: the same unlabelled ? circle, cheese orange. */
  ringZone?: LegendaryZone | null
  /** Mak Kau Hijau's hint zone: the same unlabelled ? circle, deep green. */
  hijauZone?: LegendaryZone | null
  /** Super Ring's house arrest: a solid orange circle (26 m), and the camera framed on it. */
  circle?: LegendaryZone | null
  /** Runners: where the chasers were at their last check-in's alert. Frozen: redrawn only when it changes. */
  snapshot?: ChaserSnapshot | null
  /** Organiser and marshals before the start: the exact spot a legendary's card was dropped, as a pin. */
  stash?: LatLng | null
  /** The stash pin's colour: the secret card's (yellow, orange, purple or green). Read once, when the map loads. */
  stashTone?: SecretTone
  /** Chasers: where Tuch and Ga's hidden toll gates stand. */
  tollGates?: LatLng[]
}) {
  const reduce = useReducedMotion()
  const [loaded, setLoaded] = useState(false)
  const latestZone = useRef(legendaryZone)
  latestZone.current = legendaryZone
  const latestBomohZone = useRef(bomohZone)
  latestBomohZone.current = bomohZone
  const latestRingZone = useRef(ringZone)
  latestRingZone.current = ringZone
  const latestHijauZone = useRef(hijauZone)
  latestHijauZone.current = hijauZone
  const latestCircle = useRef(circle)
  latestCircle.current = circle
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot
  const latestStash = useRef(stash)
  latestStash.current = stash
  const latestStashTone = useRef(stashTone)
  latestStashTone.current = stashTone
  const latestTollGates = useRef(tollGates)
  latestTollGates.current = tollGates
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  // A just-jailed runner's dot (`caughtAt` set) slides to Penjara once, then is dropped for good (Task 7) —
  // tracked per mounted map, independent of the server still sending it for the rest of its window.
  const slideTracker = useRef<SlideTracker | null>(null)
  if (!slideTracker.current) slideTracker.current = new SlideTracker(localStorage)
  const latest = useRef(dots)
  latest.current = dots
  const latestStations = useRef(stations)
  latestStations.current = stations
  const latestPins = useRef(pins)
  latestPins.current = pins
  const latestRoute = useRef(route)
  latestRoute.current = route
  const latestFit = useRef(fit)
  latestFit.current = fit
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
      // Dato Seri's hint zone sits under the players and station marks. Unlabelled on purpose.
      const y = legendaryYellow()
      const zone = zoneFeatures(latestZone.current)
      m.addSource('legendary', { type: 'geojson', data: zone.zone })
      m.addLayer({ id: 'legendary-fill', type: 'fill', source: 'legendary', paint: { 'fill-color': y.main, 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'legendary-line', type: 'line', source: 'legendary', paint: { 'line-color': y.main, 'line-width': 2, 'line-dasharray': [2, 2] } })
      const p = legendaryPurple()
      m.addSource('bomoh-legendary', { type: 'geojson', data: zoneFeatures(latestBomohZone.current).zone })
      m.addLayer({ id: 'bomoh-legendary-fill', type: 'fill', source: 'bomoh-legendary', paint: { 'fill-color': p.main, 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'bomoh-legendary-line', type: 'line', source: 'bomoh-legendary', paint: { 'line-color': p.main, 'line-width': 2, 'line-dasharray': [2, 2] } })
      const or = legendaryOrange()
      m.addSource('ring-legendary', { type: 'geojson', data: zoneFeatures(latestRingZone.current).zone })
      m.addLayer({ id: 'ring-legendary-fill', type: 'fill', source: 'ring-legendary', paint: { 'fill-color': or.main, 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'ring-legendary-line', type: 'line', source: 'ring-legendary', paint: { 'line-color': or.main, 'line-width': 2, 'line-dasharray': [2, 2] } })
      const g = legendaryGreen()
      m.addSource('hijau-legendary', { type: 'geojson', data: zoneFeatures(latestHijauZone.current).zone })
      m.addLayer({ id: 'hijau-legendary-fill', type: 'fill', source: 'hijau-legendary', paint: { 'fill-color': g.main, 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'hijau-legendary-line', type: 'line', source: 'hijau-legendary', paint: { 'line-color': g.main, 'line-width': 2, 'line-dasharray': [2, 2] } })
      // Super Ring's house-arrest circle: solid, so it never reads as a hint zone.
      m.addSource('house', { type: 'geojson', data: zoneFeatures(latestCircle.current).zone })
      m.addLayer({ id: 'house-fill', type: 'fill', source: 'house', paint: { 'fill-color': or.main, 'fill-opacity': 0.14 } })
      m.addLayer({ id: 'house-line', type: 'line', source: 'house', paint: { 'line-color': or.main, 'line-width': 2.5 } })
      // A walk pin's colour by its tone, as `case` pairs: yellow, orange, purple, then green.
      const o = legendaryOrange()
      const gr = legendaryGreen()
      const toned = (shade: 'main' | 'deep' | 'ink'): [ExpressionSpecification, string, ExpressionSpecification, string, ExpressionSpecification, string, ExpressionSpecification, string] => [
        ['get', 'yellow'], y[shade], ['get', 'orange'], o[shade], ['get', 'purple'], p[shade], ['get', 'green'], gr[shade],
      ]
      // The ? badge and its ripple are an HTML marker animated by CSS (the compositor), so the map idles.
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
      // The chaser snapshot: lime like the chasers' own dots, under the live dots.
      m.addSource('snapshot', { type: 'geojson', data: snapshotFeatures(latestSnapshot.current) })
      m.addLayer({ id: 'snapshot-fill', type: 'fill', source: 'snapshot', paint: { 'fill-color': VOLT, 'fill-opacity': 0.1 } })
      m.addLayer({
        id: 'snapshot-line',
        type: 'line',
        source: 'snapshot',
        filter: ['!', ['get', 'stale']],
        paint: { 'line-color': VOLT, 'line-width': 1.2 },
      })
      m.addLayer({
        id: 'snapshot-stale',
        type: 'line',
        source: 'snapshot',
        filter: ['get', 'stale'],
        paint: { 'line-color': VOLT, 'line-width': 1.2, 'line-dasharray': [2, 2] },
      })
      m.addLayer({
        id: 'snapshot-labels',
        type: 'symbol',
        source: 'snapshot',
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': VOLT, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
      })
      m.addSource('stash', { type: 'geojson', data: stashFeatures(latestStash.current) })
      const pin = toneColours(latestStashTone.current)
      m.addLayer({
        id: 'stash',
        type: 'circle',
        source: 'stash',
        paint: { 'circle-radius': 9, 'circle-color': pin.main, 'circle-stroke-color': pin.deep, 'circle-stroke-width': 2 },
      })
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
        id: 'reveal-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'revealedBy'], 'focus'],
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': VOLT,
          'circle-stroke-width': 2,
        },
      })
      m.addLayer({
        id: 'bomoh-reveal-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'revealedBy'], 'bomoh'],
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': legendaryPurple().main,
          'circle-stroke-width': 2,
        },
      })
      // Tuch and Ga's reveal: a soft lime halo (Pak Guard's is a thin ring), so the two never look alike.
      m.addLayer({
        id: 'toll-reveal-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'revealedBy'], 'toll'],
        paint: {
          'circle-radius': 15,
          'circle-color': 'rgba(198,255,61,0.22)',
          'circle-stroke-color': 'rgba(198,255,61,0.55)',
          'circle-stroke-width': 1,
        },
      })
      // The chasers' own hidden toll gates: a small black pin with a lime edge and the word GATE.
      m.addSource('toll-gates', { type: 'geojson', data: tollGateFeatures(latestTollGates.current) })
      m.addLayer({
        id: 'toll-gates',
        type: 'circle',
        source: 'toll-gates',
        paint: { 'circle-radius': 7, 'circle-color': BLACK, 'circle-stroke-color': VOLT, 'circle-stroke-width': 3 },
      })
      m.addLayer({
        id: 'toll-gate-labels',
        type: 'symbol',
        source: 'toll-gates',
        layout: { 'text-field': 'GATE', 'text-font': ['Noto Sans Regular'], 'text-size': 9, 'text-offset': [0, 1.6], 'text-allow-overlap': true },
        paint: { 'text-color': VOLT, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
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
        id: 'pins-pulse',
        type: 'circle',
        source: 'pins',
        filter: ['==', ['get', 'state'], 'next'],
        paint: { 'circle-radius': 14, 'circle-color': ['case', ...toned('main'), VOLT], 'circle-opacity': 0.3 },
      })
      m.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'pins',
        paint: {
          'circle-radius': ['case', ['!=', ['get', 'label'], ''], 11, 10],
          'circle-color': ['case', ...toned('main'), ['==', ['get', 'state'], 'todo'], BLACK, VOLT],
          'circle-stroke-color': ['case', ...toned('deep'), WHITE],
          'circle-stroke-width': ['case', ['==', ['get', 'state'], 'todo'], 2, 3],
        },
      })
      m.addLayer({
        id: 'pin-labels',
        type: 'symbol',
        source: 'pins',
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': ['case', ...toned('ink'), ['==', ['get', 'state'], 'todo'], WHITE, BLACK] },
      })
      fitTo(m, latestFit.current)
      ready.current = true
      setLoaded(true)
    })
    return () => {
      ready.current = false
      setLoaded(false)
      m.remove()
      map.current = null
    }
  }, [arenaKey])

  const stationKey = JSON.stringify(stations)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('stations') as GeoJSONSource | undefined)?.setData(stationFeatures(latestStations.current))
  }, [stationKey])

  const snapshotKey = JSON.stringify(snapshot)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('snapshot') as GeoJSONSource | undefined)?.setData(snapshotFeatures(latestSnapshot.current))
  }, [snapshotKey])

  const stashKey = JSON.stringify(stash)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('stash') as GeoJSONSource | undefined)?.setData(stashFeatures(latestStash.current))
  }, [stashKey])

  const routeKey = JSON.stringify(route)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('route') as GeoJSONSource | undefined)?.setData(routeFeatures(latestRoute.current))
  }, [routeKey])

  // The hint zone follows the prop. Its ?-badge is an HTML marker whose twinkle and ripple are pure CSS; under
  // reduced motion (rebuilt if that flips mid-session) it is simply marked still.
  const zoneKey = JSON.stringify(legendaryZone)
  useEffect(() => {
    const mp = map.current
    if (!ready.current || !mp) return
    ;(mp.getSource('legendary') as GeoJSONSource | undefined)?.setData(zoneFeatures(latestZone.current).zone)
    const z = latestZone.current
    if (!z) return
    const el = document.createElement('div')
    el.className = 'legendary-marker'
    el.setAttribute('aria-hidden', 'true')
    if (reduce) el.dataset.still = 'true'
    el.innerHTML = '<i class="legendary-ring"></i><b>?</b>'
    const marker = new maplibregl.Marker({ element: el }).setLngLat([z.lng, z.lat]).addTo(mp)
    return () => {
      marker.remove()
    }
  }, [zoneKey, reduce, loaded])

  // Bomoh's, Super Ring's and Mak Kau Hijau's hint zones: the same unlabelled ? badge, tinted by CSS.
  useHintZone(map, ready, loaded, reduce, 'bomoh-legendary', 'bomoh-marker', bomohZone)
  useHintZone(map, ready, loaded, reduce, 'ring-legendary', 'ring-marker', ringZone)
  useHintZone(map, ready, loaded, reduce, 'hijau-legendary', 'hijau-marker', hijauZone)

  // Super Ring's house arrest: the circle follows the prop, and the camera frames it.
  const circleKey = JSON.stringify(circle)
  useEffect(() => {
    const mp = map.current
    if (!ready.current || !mp) return
    ;(mp.getSource('house') as GeoJSONSource | undefined)?.setData(zoneFeatures(latestCircle.current).zone)
    fitTo(mp, circleBox(latestCircle.current), HOUSE_MAX_ZOOM, HOUSE_PADDING)
  }, [circleKey, loaded])

  const fitKey = JSON.stringify(fit)
  useEffect(() => {
    if (!ready.current || !map.current) return
    fitTo(map.current, latestFit.current)
  }, [fitKey])

  const tollKey = JSON.stringify(tollGates)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('toll-gates') as GeoJSONSource | undefined)?.setData(tollGateFeatures(latestTollGates.current))
  }, [tollKey, loaded])

  const pinKey = JSON.stringify(pins)
  useEffect(() => {
    if (!ready.current || !map.current) return
    ;(map.current.getSource('pins') as GeoJSONSource | undefined)?.setData(pinFeatures(latestPins.current))
  }, [pinKey])

  // The next pin breathes (not for reduced motion): start or stop as a `next` pin appears or goes, even after load.
  const hasNext = pins.some((p) => p.state === 'next')
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !hasNext || reduce) return
    const timer = window.setInterval(() => {
      const t = (Date.now() % 1600) / 1600
      if (!m.getLayer('pins-pulse')) return
      m.setPaintProperty('pins-pulse', 'circle-radius', 12 + 10 * t)
      m.setPaintProperty('pins-pulse', 'circle-opacity', 0.35 * (1 - t))
    }, 80)
    return () => window.clearInterval(timer)
  }, [loaded, hasNext, reduce])

  useEffect(() => {
    if (!ready.current || !map.current) return
    let frame = 0
    const paint = () => {
      const mp = map.current
      if (!mp) return
      const { dots: display, active } = slideTracker.current!.apply(dots, arena.jail, Date.now())
      latest.current = display
      // Keep each circle's distance from the last ripple, so a poll mid-wave doesn't reveal them all at once.
      const { fuzzy, points } = dotFeatures(display, ripple?.origin ?? null)
      ;(mp.getSource('fuzzy') as GeoJSONSource | undefined)?.setData(fuzzy)
      ;(mp.getSource('points') as GeoJSONSource | undefined)?.setData(points)
      // A just-jailed runner's dot is mid-slide: keep redrawing every frame until it either finishes or is
      // dropped (undone, or the window's over), instead of waiting for the next poll.
      if (active) frame = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(frame)
  }, [dots, arena.jail])

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
