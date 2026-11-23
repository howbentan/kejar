import MapCredit from './MapCredit'
import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { KL_FALLBACK } from '../../shared/arenaDraft.js'
import { circlePolygon } from '../../shared/geo.js'
import type { LatLng } from '../../shared/types.js'
import { FLOAT_ICON, addMapIcons, shadowPaint } from './Map'
import MapViewButton from './MapViewButton'
import { restFloat, startFloatMotion } from './floatMotion'
import { applyMapView, useMapView } from './mapView'
import { MAP_FONT, kejarMapStyle } from './mapStyle'

const VOLT = '#C6FF3D'
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'
/** How close (in screen pixels) a tap must be to a station to remove it. */
const REMOVE_PX = 25

export type PlaceMode = 'circle' | 'stations' | 'jail' | 'start'

type Feature = GeoFeature<Geometry, Record<string, unknown>>
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })
const closed = (pts: LatLng[]) => [...pts, pts[0]].map((p) => [p.lng, p.lat])
const line = (pts: LatLng[] | null): Feature[] =>
  pts && pts.length >= 3 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: closed(pts) } }] : []
const point = (p: LatLng, props: Record<string, unknown> = {}): Feature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
})

interface Props {
  /** The play area as it will be (after lakes and the circle). */
  boundary: LatLng[] | null
  holes: LatLng[][]
  /** The whole park, drawn faintly so the organiser sees what the circle cut away. */
  outline: LatLng[] | null
  circle: { center: LatLng; radiusM: number } | null
  mode: PlaceMode
  stations: LatLng[]
  jail: LatLng | null
  start: LatLng | null
  toilets: LatLng[]
  onTap: (p: LatLng) => void
  /** The lime handle was dropped: move the circle's centre here. */
  onCircleMove?: (p: LatLng) => void
  onStationRemove: (index: number) => void
}

function layersData(p: Props): Record<string, FeatureCollection> {
  return {
    outline: collection(line(p.outline)),
    area: collection(line(p.boundary)),
    holes: collection(p.holes.flatMap((h) => line(h))),
    circle: collection(p.circle ? line(circlePolygon(p.circle.center, p.circle.radiusM, 48)) : []),
    stations: collection(p.stations.map((s, k) => point(s, { n: String(k + 1) }))),
    marks: collection([
      ...(p.jail ? [point(p.jail, { t: 'J' })] : []),
      ...(p.start ? [point(p.start, { t: 'S' })] : []),
    ]),
    toilets: collection(p.toilets.map((t) => point(t))),
  }
}

/** A map for setting up a play area by tapping: the circle's centre, stations, the jail or the start. */
export default function PlaceMap(props: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const latest = useRef(props)
  latest.current = props
  const handle = useRef<maplibregl.Marker | null>(null)
  const reduce = useReducedMotion()
  const [threeD, toggleThreeD] = useMapView()
  const latestThreeD = useRef(threeD)
  latestThreeD.current = threeD
  const appliedThreeD = useRef(threeD)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({
      container: el.current,
      style: kejarMapStyle,
      center: [KL_FALLBACK.lng, KL_FALLBACK.lat],
      zoom: 15.5,
      attributionControl: false,
    })
    map.current = m
    m.on('load', () => {
      const data = layersData(latest.current)
      for (const [id, d] of Object.entries(data)) m.addSource(id, { type: 'geojson', data: d })
      m.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': WHITE, 'line-width': 1, 'line-opacity': 0.3 } })
      m.addLayer({ id: 'area', type: 'line', source: 'area', paint: { 'line-color': WHITE, 'line-width': 2 } })
      m.addLayer({
        id: 'holes',
        type: 'line',
        source: 'holes',
        paint: { 'line-color': WHITE, 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
      })
      m.addLayer({ id: 'circle', type: 'line', source: 'circle', paint: { 'line-color': VOLT, 'line-width': 2 } })
      m.addLayer({
        id: 'toilets',
        type: 'symbol',
        source: 'toilets',
        layout: { 'text-field': 'WC', 'text-font': MAP_FONT, 'text-size': 10, 'text-allow-overlap': true },
        paint: { 'text-color': WHITE },
      })
      m.addLayer({
        id: 'marks',
        type: 'circle',
        source: 'marks',
        paint: { 'circle-radius': 10, 'circle-color': BLACK, 'circle-stroke-color': WHITE, 'circle-stroke-width': 1.5 },
      })
      m.addLayer({
        id: 'marks-label',
        type: 'symbol',
        source: 'marks',
        layout: { 'text-field': ['get', 't'], 'text-font': MAP_FONT, 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': WHITE },
      })
      addMapIcons(m)
      // The diamond lies flat on the ground; in 3D the gem floats over a soft shadow instead (as in the game).
      m.addLayer({
        id: 'stations',
        type: 'symbol',
        source: 'stations',
        layout: { 'icon-image': 'dia-volt', 'icon-size': 1.3, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      })
      m.addLayer({ id: 'float-shadow-stations', type: 'circle', source: 'stations', paint: shadowPaint(13) })
      m.addLayer({
        id: 'float-gem',
        type: 'symbol',
        source: 'stations',
        layout: { 'icon-image': 'gem-volt-float', 'icon-size': 1.2, ...FLOAT_ICON },
      })
      applyMapView(m, latestThreeD.current, { animate: false })
      appliedThreeD.current = latestThreeD.current
      ready.current = true
      setLoaded(true)
    })
    m.on('click', (e) => {
      const p = latest.current
      if (p.mode === 'stations') {
        const hit = p.stations.findIndex((s) => {
          const q = m.project([s.lng, s.lat])
          return Math.hypot(q.x - e.point.x, q.y - e.point.y) <= REMOVE_PX
        })
        if (hit >= 0) return p.onStationRemove(hit)
      }
      p.onTap({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })
    // With nothing to show yet, start where the organiser is.
    if (!latest.current.outline && !latest.current.boundary && !latest.current.circle) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => m.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude] }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      )
    }
    return () => {
      ready.current = false
      setLoaded(false)
      m.remove()
      map.current = null
    }
  }, [])

  // Redraw on every change; it's a handful of small shapes.
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    for (const [id, d] of Object.entries(layersData(props))) (m.getSource(id) as GeoJSONSource | undefined)?.setData(d)
  })

  // A toggle after load (the load itself applied the stored view without animation).
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || appliedThreeD.current === threeD) return
    appliedThreeD.current = threeD
    applyMapView(m, threeD, { animate: !reduce })
  }, [loaded, threeD, reduce])

  // In 3D the gems bob: never for reduced motion, and not while the page is hidden.
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  useEffect(() => {
    const m = map.current
    if (!loaded || !m || !threeD || reduce || pageHidden) return
    // No claims in setup: events far in the past resolve to the resting offsets.
    const stop = startFloatMotion(m, () => ({ dropAt: -1e9, riseAt: -1e9 }), () => map.current === m)
    return () => {
      stop()
      if (map.current === m && ready.current) restFloat(m)
    }
  }, [loaded, threeD, reduce, pageHidden])

  // A handle at the circle's centre: drag it to move the circle. MapLibre marks the pointer event as handled
  // when it lands on a draggable marker, so the map doesn't pan underneath; a tap on it must not also tap the map.
  const centreLat = props.circle?.center.lat
  const centreLng = props.circle?.center.lng
  const hasCircle = !!props.circle
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!hasCircle || centreLat === undefined || centreLng === undefined) {
      handle.current?.remove()
      handle.current = null
      return
    }
    if (!handle.current) {
      const element = document.createElement('div')
      element.setAttribute('aria-label', 'Drag to move the circle')
      // No dot of its own (owner's call): only the j shows, and this clear patch over the circle's centre is what you drag.
      element.style.cssText = 'width:44px;height:44px;border-radius:50%;background:transparent;cursor:grab;touch-action:none'
      element.addEventListener('click', (e) => e.stopPropagation())
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat([centreLng, centreLat]).addTo(m)
      marker.on('dragend', () => {
        const at = marker.getLngLat()
        latest.current.onCircleMove?.({ lat: at.lat, lng: at.lng })
      })
      handle.current = marker
    } else handle.current.setLngLat([centreLng, centreLat])
  }, [hasCircle, centreLat, centreLng])
  useEffect(
    () => () => {
      handle.current?.remove()
      handle.current = null
    },
    [],
  )

  // Where the organiser is right now, as the logo's j, so they can place stations and Penjara by where they stand.
  const meMarker = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geo?.watchPosition) return
    const id = geo.watchPosition(
      (pos) => {
        const m = map.current
        if (!m) return
        const at: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        if (!meMarker.current) {
          const element = document.createElement('img')
          element.src = '/map/j-runner.png'
          element.alt = 'You are here'
          element.style.cssText = 'width:24px;height:auto;pointer-events:none'
          meMarker.current = new maplibregl.Marker({ element }).setLngLat(at).addTo(m)
        } else meMarker.current.setLngLat(at)
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000 },
    )
    return () => {
      geo.clearWatch(id)
      meMarker.current?.remove()
      meMarker.current = null
    }
  }, [])

  // Frame the park (or a saved play area, or the circle) whenever a different one is chosen.
  const frame =
    props.outline ?? props.boundary ?? (props.circle ? circlePolygon(props.circle.center, props.circle.radiusM, 8) : null)
  const frameKey = frame ? JSON.stringify(frame[0]) + frame.length : ''
  useEffect(() => {
    if (!frame || !map.current) return
    const lngs = frame.map((p) => p.lng)
    const lats = frame.map((p) => p.lat)
    map.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 24, duration: 0 },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={el} style={{ height: 320, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--hair)' }} />
      <MapCredit />
      <MapViewButton threeD={threeD} onToggle={toggleThreeD} />
    </div>
  )
}
