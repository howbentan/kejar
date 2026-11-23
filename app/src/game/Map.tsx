import MapCredit from './MapCredit'
import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { circlePolygon, distanceM } from '../../shared/geo.js'
import type { FloodNow } from '../../shared/flood.js'
import { BANJIR, floodFeatures } from './floodMap'
import type { TupperSide } from '../../shared/types.js'
import type { Arena, LatLng } from '../../shared/types.js'
import { CHASER_SNAPSHOT_FUZZ_M, FUZZ_RADIUS_M, type ChaserSnapshot, type MapDot } from '../../shared/views.js'
import { MAP_FONT, kejarMapStyle } from './mapStyle'
import { RIPPLE_MS } from './ripple'
import { SlideTracker } from './slideOff'
import { MiniRunner } from './Runner'

/** How long the tiles' small j runs at most when the map never loads (failed style, offline). */
const MAP_LOADER_MS = 8000

const VOLT = '#C6FF3D'
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'
/** The diamond images (Task 4) by Tupperware side. */
const DIAMOND: Record<TupperSide, string> = { dikejar: 'dia-gold', kejar: 'dia-purple' }

type MapCircle = { lat: number; lng: number; radiusM: number }

/** Bomoh's purple (MapLibre can't read CSS variables), read from tokens.css --bomoh-1/2/3 and --bomoh-ink; the fallbacks (#F0E0FF, #C9A4FF, #9B5DE5, #2B0B45) must change with them. */
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

/**
 * The endgames' map colours (endgame design §6.4, §7.4, §8.3): Bomba's red for the last call, Hang Hebat's poster cream
 * and brown for the wanted runner. Read from tokens.css --bomba, --hebat and --hebat-ink; the fallbacks must change with them.
 */
function endgameColours() {
  const css = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback
  return { bomba: token('--bomba', '#E63946'), hebat: token('--hebat', '#F1E3C3'), hebatInk: token('--hebat-ink', '#3A2410') }
}

type Feature = GeoFeature<Geometry, Record<string, unknown>>
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

function ring(points: { lat: number; lng: number }[]): number[][] {
  const coords = points.map((p) => [p.lng, p.lat])
  return [...coords, coords[0]]
}

function dotFeatures(dots: MapDot[], origin: LatLng | null = null) {
  const fuzzy: Feature[] = []
  const points: Feature[] = []
  // Hang Hebat's poster pin sits on the wanted runner's circle or dot, whichever it is.
  const wanted: Feature[] = []
  for (const d of dots) {
    if (d.wanted) wanted.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [d.lng, d.lat] } })
    if (d.fuzzy) {
      fuzzy.push({
        type: 'Feature',
        // `dist` lets the ping ripple reveal each circle as its wave passes (motion design §8.1).
        properties: { missed: !!d.missed, label: d.label ?? '', dist: origin ? distanceM(d, origin) : 0, wanted: !!d.wanted },
        geometry: { type: 'Polygon', coordinates: [ring(circlePolygon(d, FUZZ_RADIUS_M))] },
      })
    } else {
      points.push({
        type: 'Feature',
        properties: { kind: d.kind, label: d.label ?? '', revealedBy: d.revealedBy, wanted: !!d.wanted },
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      })
    }
  }
  return { fuzzy: collection(fuzzy), points: collection(points), wanted: collection(wanted) }
}

/**
 * The map's drawn markers: the logo's own j (cut from the logo: volt for Dikejar and pings, white for Kejar), the
 * Penjara gate and the start flag. Each is a 2x image in /map; a layer that uses one draws as soon as it has loaded.
 */
export const MAP_ICONS = [
  'j-runner',
  'j-chaser',
  'j-ghost',
  'penjara',
  'start',
  'dia-volt',
  'dia-red',
  'dia-gold',
  'dia-purple',
  'gem-volt-float',
  'gem-gold-float',
  'gem-purple-float',
  'gem-red',
  'j-runner-float',
  'j-chaser-float',
  'j-ghost-float',
] as const
function addMapIcons(m: maplibregl.Map) {
  if (typeof m.addImage !== 'function' || typeof Image === 'undefined') return
  for (const name of MAP_ICONS) {
    if (m.hasImage?.(name)) continue
    const img = new Image()
    img.onload = () => {
      if (!m.hasImage?.(name)) m.addImage(name, img, { pixelRatio: 2 })
    }
    img.src = `/map/${name}.png`
  }
}

/** The game map: arena boundary, jail, and role dots (spec §9 colour + shape rules). */
type StationMark = { n: number; lat: number; lng: number; lockedUntil?: string | null }

/** `m:ss` for a lock with `ms` left. */
const lockLeft = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`

/** A station is locked while its `lockedUntil` is ahead of `now`; `left` is the time still to go (empty when open). Worked out on the phone, so a lock ends on its own. */
export function stationFeatures(stations: StationMark[], now: number): FeatureCollection {
  return collection(
    stations.map((s) => {
      const ms = s.lockedUntil ? Date.parse(s.lockedUntil) - now : 0
      const locked = ms > 0
      return {
        type: 'Feature',
        properties: { n: String(s.n), locked, left: locked ? lockLeft(ms) : '' },
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      }
    }),
  )
}

/**
 * A pin. The walk-the-park guide sets a `label` (drawn on the pin), a `state` (todo is outlined, next pulses, placed is
 * filled) and, for a Tupperware's step, its `side` (a gold Dikejar or purple Kejar diamond). Plain pins (safety alerts) leave them out and draw as filled lime.
 */
type Pin = { id: string; lat: number; lng: number; label?: string; state?: 'todo' | 'next' | 'placed'; side?: TupperSide }

function pinFeatures(pins: Pin[]): FeatureCollection {
  return collection(
    pins.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        label: p.label ?? '',
        state: p.state ?? 'placed',
        side: p.side ?? '',
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  )
}

/** Tee And Gee's gates, on the chaser map only (the view sends them to chasers and no one else). */
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

/** A circle on the map: Super Ring's house arrest. */
function circleFeatures(z: MapCircle | null): FeatureCollection {
  return collection(z ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(circlePolygon(z, z.radiusM))] } }] : [])
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
function circleBox(c: MapCircle | null): LatLng[] | null {
  if (!c) return null
  const dLat = (c.radiusM * 1.3) / 111_320
  const dLng = dLat / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180))
  return [
    { lat: c.lat - dLat, lng: c.lng - dLng },
    { lat: c.lat + dLat, lng: c.lng + dLng },
  ]
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
  circle = null,
  flood = null,
  snapshot = null,
  stash = null,
  stashSide = 'dikejar',
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
  /** Banjir Kilat: the water over the flooded part of the play area, and the next waterline before a rise. */
  flood?: FloodNow | null
  /** Super Ring's house arrest: a solid orange circle (26 m), and the camera framed on it. */
  circle?: MapCircle | null
  /** Runners: where the chasers were at their last check-in's alert. Frozen: redrawn only when it changes. */
  snapshot?: ChaserSnapshot | null
  /** The organiser's own map: the exact spot a box was dropped, as a pin. */
  stash?: LatLng | null
  /** Whose Tupperware the stash diamond is: gold for Dikejar, purple for Kejar. Read once, when the map loads. */
  stashSide?: TupperSide
  /** Chasers: where Tee And Gee's hidden toll gates stand. */
  tollGates?: LatLng[]
}) {
  const reduce = useReducedMotion()
  const [loaded, setLoaded] = useState(false)
  // The tiles' small j gives up on a map error or after MAP_LOADER_MS, so a map that never loads isn't covered for good.
  const [gaveUp, setGaveUp] = useState(false)
  const latestCircle = useRef(circle)
  latestCircle.current = circle
  const latestFlood = useRef(flood)
  latestFlood.current = flood
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot
  const latestStash = useRef(stash)
  latestStash.current = stash
  const latestStashSide = useRef(stashSide)
  latestStashSide.current = stashSide
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
      // The required credit is our own slim <MapCredit />, not MapLibre's pop-out box.
      attributionControl: false,
    })
    map.current = m
    const giveUp = window.setTimeout(() => setGaveUp(true), MAP_LOADER_MS)
    m.on('error', () => {
      window.clearTimeout(giveUp)
      setGaveUp(true)
    })
    m.on('load', () => {
      window.clearTimeout(giveUp)
      m.addSource('arena', {
        type: 'geojson',
        data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring(arena.boundary) } }]),
      })
      m.addLayer({ id: 'arena', type: 'line', source: 'arena', paint: { 'line-color': WHITE, 'line-width': 1.5, 'line-opacity': 0.6 } })
      // Banjir Kilat's water sits under every zone and dot; the next waterline is dashed on top of it.
      const fl = floodFeatures(arena, latestFlood.current)
      m.addSource('flood', { type: 'geojson', data: fl.water })
      m.addLayer({ id: 'flood-fill', type: 'fill', source: 'flood', paint: { 'fill-color': BANJIR, 'fill-opacity': 0.32 } })
      m.addSource('flood-next', { type: 'geojson', data: fl.next })
      m.addLayer({ id: 'flood-next', type: 'line', source: 'flood-next', paint: { 'line-color': BANJIR, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } })
      if (showJailAndStartRef.current) {
        m.addSource('jail', {
          type: 'geojson',
          data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [arena.jail.lng, arena.jail.lat] } }]),
        })
        addMapIcons(m)
        m.addLayer({
          id: 'jail',
          type: 'symbol',
          source: 'jail',
          layout: { 'icon-image': 'penjara', 'icon-size': 0.9, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
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
      // Super Ring's house-arrest circle: solid orange, under the players and station marks.
      const or = legendaryOrange()
      m.addSource('house', { type: 'geojson', data: circleFeatures(latestCircle.current) })
      m.addLayer({ id: 'house-fill', type: 'fill', source: 'house', paint: { 'fill-color': or.main, 'fill-opacity': 0.14 } })
      m.addLayer({ id: 'house-line', type: 'line', source: 'house', paint: { 'line-color': or.main, 'line-width': 2.5 } })
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
        layout: { 'text-field': 'WC', 'text-font': MAP_FONT, 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': WHITE },
      })
      if (showJailAndStartRef.current) {
        m.addSource('start', {
          type: 'geojson',
          data: collection([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [arena.start.lng, arena.start.lat] } }]),
        })
        // Where Kejar wait while Dikejar hide: the checkered "mula" flag.
        m.addLayer({
          id: 'start',
          type: 'symbol',
          source: 'start',
          layout: { 'icon-image': 'start', 'icon-size': 0.9, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
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
        layout: { 'text-field': ['get', 'label'], 'text-font': MAP_FONT, 'text-size': 11 },
        paint: { 'text-color': VOLT, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
      })
      m.addSource('stash', { type: 'geojson', data: stashFeatures(latestStash.current) })
      m.addLayer({
        id: 'stash',
        type: 'symbol',
        source: 'stash',
        layout: { 'icon-image': DIAMOND[latestStashSide.current], 'icon-size': 1.3, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      })
      m.addSource('stations', { type: 'geojson', data: stationFeatures(latestStations.current, Date.now()) })
      m.addLayer({
        id: 'stations',
        type: 'symbol',
        source: 'stations',
        layout: { 'icon-image': ['case', ['get', 'locked'], 'dia-red', 'dia-volt'], 'icon-size': 1.3, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      })
      const { fuzzy, points, wanted } = dotFeatures(latest.current)
      m.addSource('fuzzy', { type: 'geojson', data: fuzzy })
      m.addSource('points', { type: 'geojson', data: points })
      m.addSource('wanted', { type: 'geojson', data: wanted })
      const eg = endgameColours()
      // A ping shows as the faded j alone (owner's call): the circle layers stay, invisible, for the ripple and Hang Hebat.
      m.addLayer({ id: 'fuzzy-fill', type: 'fill', source: 'fuzzy', paint: { 'fill-color': WHITE, 'fill-opacity': 0 } })
      m.addLayer({
        id: 'fuzzy-line',
        type: 'line',
        source: 'fuzzy',
        filter: ['!', ['get', 'missed']],
        paint: { 'line-color': WHITE, 'line-width': 1.2, 'line-opacity': 0 },
      })
      m.addLayer({
        id: 'fuzzy-missed',
        type: 'line',
        source: 'fuzzy',
        filter: ['get', 'missed'],
        paint: { 'line-color': WHITE, 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0 },
      })
      addMapIcons(m)
      m.addLayer({
        id: 'fuzzy-j',
        type: 'symbol',
        source: 'fuzzy',
        layout: { 'icon-image': 'j-ghost', 'icon-size': 0.85, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
        // A missed check-in is fainter still.
        paint: { 'icon-opacity': ['case', ['get', 'missed'], 0.45, 1] },
      })
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'points',
        // Runners and chasers seen exactly are the j instead (points-j); me and marshals stay dots.
        filter: ['match', ['get', 'kind'], ['runner', 'chaser'], false, true],
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'me', 7, 5],
          'circle-color': ['match', ['get', 'kind'], 'chaser', VOLT, 'marshal', 'rgba(0,0,0,0)', WHITE],
          'circle-stroke-color': ['match', ['get', 'kind'], 'me', 'rgba(245,245,243,0.35)', 'marshal', WHITE, BLACK],
          'circle-stroke-width': ['match', ['get', 'kind'], 'me', 6, 'marshal', 2, 1.5],
        },
      })
      m.addLayer({
        id: 'points-j',
        type: 'symbol',
        source: 'points',
        filter: ['match', ['get', 'kind'], ['runner', 'chaser'], true, false],
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'chaser', 'j-chaser', 'j-runner'],
          'icon-size': 0.85,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
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
      // Mak Kau Hijau's tap reveal: the same thin ring as Bomoh's, in its deep green.
      m.addLayer({
        id: 'hijau-reveal-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'revealedBy'], 'hijau'],
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': legendaryGreen().main,
          'circle-stroke-width': 2,
        },
      })
      // Bomba's last call: every free runner shows exactly, so an exact dot with a thin red ring.
      m.addLayer({
        id: 'lastcall-reveal-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'revealedBy'], 'lastcall'],
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': eg.bomba,
          'circle-stroke-width': 2,
        },
      })
      // Hang Hebat's wanted runner: a thick cream ring round their ping circle, or round their dot when exact.
      m.addLayer({
        id: 'wanted-fuzzy-ring',
        type: 'line',
        source: 'fuzzy',
        filter: ['get', 'wanted'],
        paint: { 'line-color': eg.hebat, 'line-width': 3 },
      })
      m.addLayer({
        id: 'wanted-ring',
        type: 'circle',
        source: 'points',
        filter: ['get', 'wanted'],
        paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': eg.hebat, 'circle-stroke-width': 3 },
      })
      // ...and a small poster pin over it, so the Kejar know which one is the bounty (endgame design §8.3).
      m.addLayer({
        id: 'wanted-pin',
        type: 'circle',
        source: 'wanted',
        paint: { 'circle-radius': 7, 'circle-color': eg.hebat, 'circle-stroke-color': eg.hebatInk, 'circle-stroke-width': 2, 'circle-translate': [0, -18] },
      })
      m.addLayer({
        id: 'wanted-pin-label',
        type: 'symbol',
        source: 'wanted',
        layout: { 'text-field': 'WANTED', 'text-font': MAP_FONT, 'text-size': 9, 'text-offset': [0, -3.2], 'text-allow-overlap': true },
        paint: { 'text-color': eg.hebatInk, 'text-halo-color': eg.hebat, 'text-halo-width': 2 },
      })
      // Tee And Gee's reveal: a soft lime halo (Pak Guard's is a thin ring), so the two never look alike.
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
        layout: { 'text-field': 'GATE', 'text-font': MAP_FONT, 'text-size': 9, 'text-offset': [0, 1.6], 'text-allow-overlap': true },
        paint: { 'text-color': VOLT, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
      })
      m.addLayer({
        id: 'labels',
        type: 'symbol',
        source: 'fuzzy',
        // Under the faded j, so the tag number never sits on it.
        layout: { 'text-field': ['get', 'label'], 'text-font': MAP_FONT, 'text-size': 11, 'text-offset': [0, 2.1], 'text-allow-overlap': true },
        paint: { 'text-color': WHITE, 'text-halo-color': BLACK, 'text-halo-width': 1.5 },
      })
      m.addSource('pins', { type: 'geojson', data: pinFeatures(latestPins.current) })
      m.addLayer({
        id: 'pins-pulse',
        type: 'circle',
        source: 'pins',
        filter: ['==', ['get', 'state'], 'next'],
        paint: { 'circle-radius': 14, 'circle-color': ['case', ['==', ['get', 'side'], 'kejar'], '#C9A4FF', ['==', ['get', 'side'], 'dikejar'], '#FFD60A', VOLT], 'circle-opacity': 0.3 },
      })
      m.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'pins',
        filter: ['==', ['get', 'side'], ''],
        paint: {
          'circle-radius': ['case', ['!=', ['get', 'label'], ''], 11, 10],
          'circle-color': ['case', ['==', ['get', 'state'], 'todo'], BLACK, VOLT],
          'circle-stroke-color': WHITE,
          'circle-stroke-width': ['case', ['==', ['get', 'state'], 'todo'], 2, 3],
        },
      })
      // A Tupperware's step is a diamond of its side's colour (todo and next alike; the next one pulses behind it).
      m.addLayer({
        id: 'pins-tupper',
        type: 'symbol',
        source: 'pins',
        filter: ['!=', ['get', 'side'], ''],
        layout: {
          'icon-image': ['case', ['==', ['get', 'side'], 'kejar'], 'dia-purple', 'dia-gold'],
          'icon-size': 1.3,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
      m.addLayer({
        id: 'pin-labels',
        type: 'symbol',
        source: 'pins',
        layout: { 'text-field': ['get', 'label'], 'text-font': MAP_FONT, 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': ['case', ['!=', ['get', 'side'], ''], BLACK, ['==', ['get', 'state'], 'todo'], WHITE, BLACK] },
      })
      fitTo(m, latestFit.current)
      ready.current = true
      setLoaded(true)
    })
    return () => {
      window.clearTimeout(giveUp)
      ready.current = false
      setLoaded(false)
      setGaveUp(false)
      m.remove()
      map.current = null
    }
  }, [arenaKey])

  const stationKey = JSON.stringify(stations)
  // Draw now; then, only while some station is locked, redraw every second so a lock turns back by itself (and its time ticks).
  useEffect(() => {
    if (!ready.current || !map.current) return
    const draw = () => {
      const now = Date.now()
      ;(map.current?.getSource('stations') as GeoJSONSource | undefined)?.setData(stationFeatures(latestStations.current, now))
      return latestStations.current.some((s) => s.lockedUntil && Date.parse(s.lockedUntil) > now)
    }
    if (!draw()) return
    const timer = window.setInterval(() => {
      if (!draw()) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stationKey, loaded])

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

  // Super Ring's house arrest: the circle follows the prop, and the camera frames it.
  const circleKey = JSON.stringify(circle)
  useEffect(() => {
    const mp = map.current
    if (!ready.current || !mp) return
    ;(mp.getSource('house') as GeoJSONSource | undefined)?.setData(circleFeatures(latestCircle.current))
    fitTo(mp, circleBox(latestCircle.current), HOUSE_MAX_ZOOM, HOUSE_PADDING)
  }, [circleKey, loaded])

  // The water follows the flood: a rise, or the next waterline showing. Rounded so a poll's tiny changes don't redraw.
  const floodKey = flood ? `${flood.step}:${flood.warning}:${Math.round(flood.radiusM)}` : ''
  useEffect(() => {
    const mp = map.current
    if (!ready.current || !mp) return
    const fl = floodFeatures(arena, latestFlood.current)
    ;(mp.getSource('flood') as GeoJSONSource | undefined)?.setData(fl.water)
    ;(mp.getSource('flood-next') as GeoJSONSource | undefined)?.setData(fl.next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floodKey, loaded])

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
      const { fuzzy, points, wanted } = dotFeatures(display, ripple?.origin ?? null)
      ;(mp.getSource('fuzzy') as GeoJSONSource | undefined)?.setData(fuzzy)
      ;(mp.getSource('points') as GeoJSONSource | undefined)?.setData(points)
      ;(mp.getSource('wanted') as GeoJSONSource | undefined)?.setData(wanted)
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
    const base: Record<string, unknown> = {
      'fuzzy-fill': null,
      'fuzzy-line': ['!', ['get', 'missed']],
      'fuzzy-missed': ['get', 'missed'],
      'wanted-fuzzy-ring': ['get', 'wanted'],
      'fuzzy-j': null,
      labels: null,
    }
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
      <MapCredit />
      {/* Until the map's first load, a small j runs in the middle (loaders design). Taps go straight through. */}
      {!loaded && !gaveUp && (
        <div className="map-loading" data-testid="map-loading" aria-hidden="true">
          <MiniRunner height={42} />
        </div>
      )}
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
