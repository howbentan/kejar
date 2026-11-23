import type { FeatureCollection } from 'geojson'
import type maplibregl from 'maplibre-gl'
import { GEM_SIZE, LANDED_OFFSET, STEM_PX } from './mapMarkers'

/** CSS px between a floating gem's base and its spot: the stem, scaled with the gem. */
export const HOVER = STEM_PX * GEM_SIZE
/** How far a gem travels between floating and landed: from the floating gem's base down to the landed gem's base. */
export const DROP_PX = HOVER + LANDED_OFFSET[1] * GEM_SIZE
export const DROP_MS = 650
export const RISE_MS = 700
/** Skip frames closer together than this: about 30 fps is plenty for a gentle bob. */
const FRAME_MS = 33

export type FloatEvents = { dropAt: number; riseAt: number }

const easeOutBounce = (x: number) =>
  x < 1 / 2.75
    ? 7.5625 * x * x
    : x < 2 / 2.75
      ? 7.5625 * (x - 1.5 / 2.75) ** 2 + 0.75
      : x < 2.5 / 2.75
        ? 7.5625 * (x - 2.25 / 2.75) ** 2 + 0.9375
        : 7.5625 * (x - 2.625 / 2.75) ** 2 + 0.984375
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
/** Never -0, so a resting layer reads as exactly [0, 0]. */
const at = (y: number): [number, number] => [0, y === 0 ? 0 : y]

/**
 * Each moving layer's `icon-translate` at time `t` (performance.now() ms). The j's bob 3 px, the gems 4 px on another
 * beat. Only the gems mid-way move further: a just-claimed one (on `landed-gem-dropping`) drops from its floating base
 * with a small bounce; a just-reopened one (on `float-gem-rising`) rises from the ground. Translate is layer-wide, so
 * those two layers hold only the stations that just turned (see markStationMotion); steady gems never jump.
 */
export function floatTranslates(t: number, ev: FloatEvents): Record<string, [number, number]> {
  const drop = Math.min(Math.max((t - ev.dropAt) / DROP_MS, 0), 1)
  const rise = Math.min(Math.max((t - ev.riseAt) / RISE_MS, 0), 1)
  const j = at(Math.sin(t / 650) * 3)
  const gem = Math.sin(t / 900 + 1.4) * 4
  const tupper = at(Math.sin(t / 900 + 2.6) * 4)
  return {
    'float-j': j,
    'float-j-ghost': j,
    'float-gem': at(gem),
    'float-gem-rising': at(gem + (1 - easeOutCubic(rise)) * DROP_PX),
    'float-tupper': tupper,
    'float-tupper-stash': tupper,
    'landed-gem-dropping': at(-(1 - easeOutBounce(drop)) * DROP_PX),
  }
}

/** Every layer floatTranslates moves: each needs INSTANT_TRANSLATE in its paint. */
export const FLOAT_TRANSLATE_LAYERS: readonly string[] = Object.keys(floatTranslates(0, { dropAt: -1e9, riseAt: -1e9 }))

/** What the map last knew of a station: locked or not, and when its gem last dropped or rose (performance.now() ms). */
export type StationTurn = { locked: boolean; dropAt?: number; riseAt?: number }

/**
 * Notes each station that locked or opened since the last call (at `t`, performance.now() ms) and marks every station
 * feature `dropping` (DROP_MS after it locked) or `rising` (RISE_MS after it opened), so only that station's gem moves
 * to the animated layer. A station seen for the first time just appears. The latest drop and rise go into `ev`.
 * `turned`: some station changed now; `moving`: some gem is still mid-way (keep refreshing until it lands).
 */
export function markStationMotion(
  features: FeatureCollection,
  seen: Map<string, StationTurn>,
  t: number,
  ev: FloatEvents,
): { turned: boolean; moving: boolean } {
  let turned = false
  let moving = false
  for (const f of features.features) {
    const props = (f.properties ??= {})
    const n = String(props.n)
    const locked = !!props.locked
    const was = seen.get(n)
    const next: StationTurn = { locked, dropAt: was?.dropAt, riseAt: was?.riseAt }
    if (was && !was.locked && locked) next.dropAt = ev.dropAt = t
    if (was && was.locked && !locked) next.riseAt = ev.riseAt = t
    if (was && was.locked !== locked) turned = true
    const dropping = locked && next.dropAt !== undefined && t - next.dropAt < DROP_MS
    const rising = !locked && next.riseAt !== undefined && t - next.riseAt < RISE_MS
    props.dropping = dropping
    props.rising = rising
    if (dropping || rising) moving = true
    seen.set(n, next)
  }
  return { turned, moving }
}

/** Sets each layer's `icon-translate` (layers the map lacks are skipped). */
export function setFloat(m: maplibregl.Map, tr: Record<string, [number, number]>): void {
  for (const [id, v] of Object.entries(tr)) if (m.getLayer(id)) m.setPaintProperty(id, 'icon-translate', v)
}

/** Every moving layer back at rest: floats at hover height, landed gems on the ground. */
export function restFloat(m: maplibregl.Map): void {
  setFloat(m, Object.fromEntries(FLOAT_TRANSLATE_LAYERS.map((id) => [id, at(0)])))
}

/**
 * Runs the float motion until the returned stop is called, the page is hidden, or `isLive` says the map is gone (it is
 * checked before each frame touches the map). `getEvents` is read every frame.
 */
export function startFloatMotion(m: maplibregl.Map, getEvents: () => FloatEvents, isLive: () => boolean = () => true): () => void {
  let frame = 0
  let last = -Infinity
  let stopped = false
  const tick = (t: number) => {
    if (stopped) return
    if (!isLive()) return stop()
    if (t - last >= FRAME_MS) {
      last = t
      setFloat(m, floatTranslates(t, getEvents()))
    }
    frame = requestAnimationFrame(tick)
  }
  const onVisibility = () => {
    if (document.hidden) stop()
  }
  const stop = () => {
    stopped = true
    cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', onVisibility)
  }
  document.addEventListener('visibilitychange', onVisibility)
  frame = requestAnimationFrame(tick)
  return stop
}
