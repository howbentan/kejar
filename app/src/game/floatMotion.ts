import type maplibregl from 'maplibre-gl'

/** CSS px between a floating gem's base and the ground (the stem's height in the Task 4 art). */
export const HOVER = 38
const DROP_MS = 650
const RISE_MS = 700
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
 * beat. A claimed gem drops from hover height with a small bounce; a reopened one rises from the ground (one shared
 * drop and rise time: translate is layer-wide).
 */
export function floatTranslates(t: number, ev: FloatEvents): Record<string, [number, number]> {
  const drop = Math.min(Math.max((t - ev.dropAt) / DROP_MS, 0), 1)
  const rise = Math.min(Math.max((t - ev.riseAt) / RISE_MS, 0), 1)
  const j = at(Math.sin(t / 650) * 3)
  const tupper = at(Math.sin(t / 900 + 2.6) * 4)
  return {
    'float-j': j,
    'float-j-ghost': j,
    'float-gem': at(Math.sin(t / 900 + 1.4) * 4 + (1 - easeOutCubic(rise)) * HOVER),
    'float-tupper': tupper,
    'float-tupper-stash': tupper,
    'landed-gem': at(-(1 - easeOutBounce(drop)) * HOVER),
  }
}

/** Sets each layer's `icon-translate` (layers the map lacks are skipped). */
export function setFloat(m: maplibregl.Map, tr: Record<string, [number, number]>): void {
  for (const [id, v] of Object.entries(tr)) if (m.getLayer(id)) m.setPaintProperty(id, 'icon-translate', v)
}

/** Every moving layer back at rest: floats at hover height, landed gems on the ground. */
export function restFloat(m: maplibregl.Map): void {
  setFloat(m, Object.fromEntries(Object.keys(floatTranslates(0, { dropAt: -1e9, riseAt: -1e9 })).map((id) => [id, at(0)])))
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
