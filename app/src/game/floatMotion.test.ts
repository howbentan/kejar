// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { DROP_PX, FLOAT_TRANSLATE_LAYERS, HOVER, floatTranslates, markStationMotion, restFloat, startFloatMotion, type FloatEvents, type StationTurn } from './floatMotion'
import { GEM_SIZE, LANDED_OFFSET, STEM_PX } from './mapMarkers'
import type { FeatureCollection } from 'geojson'

/** A fake rAF: frames run only when the test says so, at the time it gives. */
let queue: Map<number, FrameRequestCallback>
let nextId: number
beforeEach(() => {
  queue = new Map()
  nextId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(nextId, cb)
    return nextId++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})

function runFrame(t: number) {
  const pending = [...queue.values()]
  queue.clear()
  for (const cb of pending) cb(t)
}

function fakeMap() {
  const set: { id: string; prop: string; v: unknown }[] = []
  const m = {
    getLayer: (id: string) => ({ id }),
    setPaintProperty: (id: string, prop: string, v: unknown) => set.push({ id, prop, v }),
  }
  const last = (id: string) => set.filter((s) => s.id === id && s.prop === 'icon-translate').at(-1)?.v
  return { m: m as unknown as maplibregl.Map, set, last }
}

describe('floatTranslates', () => {
  it('hovers the stem height at the gem size, and drops from the floating base to the landed base', () => {
    expect(HOVER).toBeCloseTo(STEM_PX * GEM_SIZE)
    // The landed gem's icon-offset is scaled by icon-size, so its base sits that far under the spot.
    expect(DROP_PX).toBeCloseTo(HOVER + LANDED_OFFSET[1] * GEM_SIZE)
  })

  it('drops a just-claimed gem from the floating base to the ground in 650 ms', () => {
    const dropAt = 10_000
    expect(floatTranslates(dropAt, { dropAt, riseAt: -1e9 })['landed-gem-dropping']).toEqual([0, -DROP_PX])
    expect(floatTranslates(dropAt + 650, { dropAt, riseAt: -1e9 })['landed-gem-dropping']).toEqual([0, 0])
    expect(floatTranslates(dropAt + 5000, { dropAt, riseAt: -1e9 })['landed-gem-dropping']).toEqual([0, 0])
  })

  it('a just-reopened gem rises from the landed base to its hover over 700 ms, on top of its bob', () => {
    const riseAt = 10_000
    const bob = (t: number) => Math.sin(t / 900 + 1.4) * 4
    expect(floatTranslates(riseAt, { dropAt: -1e9, riseAt })['float-gem-rising'][1]).toBeCloseTo(bob(riseAt) + DROP_PX)
    expect(floatTranslates(riseAt + 700, { dropAt: -1e9, riseAt })['float-gem-rising'][1]).toBeCloseTo(bob(riseAt + 700))
  })

  it('steady gems only bob: a drop or rise never moves float-gem, and landed-gem is never driven', () => {
    const t = 10_100
    const calm = floatTranslates(t, { dropAt: -1e9, riseAt: -1e9 })
    const busy = floatTranslates(t, { dropAt: 10_000, riseAt: 10_000 })
    expect(busy['float-gem']).toEqual(calm['float-gem'])
    expect(busy['float-gem'][1]).toBeCloseTo(Math.sin(t / 900 + 1.4) * 4)
    expect(Object.keys(busy)).not.toContain('landed-gem')
  })

  it('the j bobs 3 px on its own beat; the Tupperware gems 4 px', () => {
    const tr = floatTranslates(1234, { dropAt: -1e9, riseAt: -1e9 })
    expect(tr['float-j'][1]).toBeCloseTo(Math.sin(1234 / 650) * 3)
    expect(tr['float-j-ghost']).toEqual(tr['float-j'])
    expect(Math.abs(tr['float-tupper'][1])).toBeLessThanOrEqual(4)
    expect(tr['float-tupper-stash']).toEqual(tr['float-tupper'])
  })

  it('FLOAT_TRANSLATE_LAYERS names every layer it moves', () => {
    expect([...FLOAT_TRANSLATE_LAYERS].sort()).toEqual(Object.keys(floatTranslates(0, { dropAt: -1e9, riseAt: -1e9 })).sort())
  })
})

describe('markStationMotion', () => {
  const fc = (locked: Record<string, boolean>): FeatureCollection => ({
    type: 'FeatureCollection',
    features: Object.entries(locked).map(([n, l]) => ({ type: 'Feature', properties: { n, locked: l }, geometry: { type: 'Point', coordinates: [101, 3] } })),
  })
  const props = (f: FeatureCollection, n: string) => f.features.find((x) => x.properties?.n === n)!.properties!

  it('a station seen for the first time just appears', () => {
    const seen = new Map<string, StationTurn>()
    const ev: FloatEvents = { dropAt: -1e9, riseAt: -1e9 }
    const f = fc({ 1: true, 2: false })
    expect(markStationMotion(f, seen, 1000, ev)).toEqual({ turned: false, moving: false })
    expect(props(f, '1')).toMatchObject({ dropping: false, rising: false })
    expect(props(f, '2')).toMatchObject({ dropping: false, rising: false })
    expect(ev).toEqual({ dropAt: -1e9, riseAt: -1e9 })
  })

  it('locking station 2 marks only station 2 dropping, for 650 ms', () => {
    const seen = new Map<string, StationTurn>()
    const ev: FloatEvents = { dropAt: -1e9, riseAt: -1e9 }
    markStationMotion(fc({ 1: false, 2: false, 3: true }), seen, 1000, ev)
    const f = fc({ 1: false, 2: true, 3: true })
    expect(markStationMotion(f, seen, 2000, ev)).toEqual({ turned: true, moving: true })
    expect(ev.dropAt).toBe(2000)
    expect(props(f, '2')).toMatchObject({ dropping: true, rising: false })
    for (const n of ['1', '3']) expect(props(f, n)).toMatchObject({ dropping: false, rising: false })
    const later = fc({ 1: false, 2: true, 3: true })
    expect(markStationMotion(later, seen, 2650, ev)).toEqual({ turned: false, moving: false })
    expect(props(later, '2')).toMatchObject({ dropping: false })
  })

  it('opening station 1 marks only station 1 rising, for 700 ms', () => {
    const seen = new Map<string, StationTurn>()
    const ev: FloatEvents = { dropAt: -1e9, riseAt: -1e9 }
    markStationMotion(fc({ 1: true, 2: false }), seen, 1000, ev)
    const f = fc({ 1: false, 2: false })
    expect(markStationMotion(f, seen, 3000, ev)).toEqual({ turned: true, moving: true })
    expect(ev.riseAt).toBe(3000)
    expect(props(f, '1')).toMatchObject({ rising: true, dropping: false })
    expect(props(f, '2')).toMatchObject({ rising: false, dropping: false })
    const mid = fc({ 1: false, 2: false })
    expect(markStationMotion(mid, seen, 3699, ev).moving).toBe(true)
    const done = fc({ 1: false, 2: false })
    expect(markStationMotion(done, seen, 3700, ev).moving).toBe(false)
    expect(props(done, '1')).toMatchObject({ rising: false })
  })
})

describe('startFloatMotion', () => {
  it('sets icon-translate each frame, at most ~30 fps', () => {
    const { m, set } = fakeMap()
    startFloatMotion(m, () => ({ dropAt: -1e9, riseAt: -1e9 }))
    runFrame(1000)
    const perFrame = set.length
    expect(perFrame).toBeGreaterThan(0)
    expect(set.every((s) => s.prop === 'icon-translate')).toBe(true)
    runFrame(1016) // 16 ms later: skipped
    expect(set.length).toBe(perFrame)
    runFrame(1034)
    expect(set.length).toBe(perFrame * 2)
  })

  it('reads the drop time each frame: the dropping gem is up at its float base at dropAt, on the ground 650 ms later', () => {
    const { m, last } = fakeMap()
    const ev = { dropAt: -1e9, riseAt: -1e9 }
    startFloatMotion(m, () => ev)
    ev.dropAt = 5000
    runFrame(5000)
    expect(last('landed-gem-dropping')).toEqual([0, -DROP_PX])
    runFrame(5650)
    expect(last('landed-gem-dropping')).toEqual([0, 0])
  })

  it('stops scheduling after its stop function is called', () => {
    const { m, set } = fakeMap()
    const stop = startFloatMotion(m, () => ({ dropAt: -1e9, riseAt: -1e9 }))
    runFrame(1000)
    stop()
    expect(queue.size).toBe(0)
    const n = set.length
    runFrame(2000)
    expect(set.length).toBe(n)
  })

  it('stops when the page is hidden', () => {
    const { m } = fakeMap()
    startFloatMotion(m, () => ({ dropAt: -1e9, riseAt: -1e9 }))
    runFrame(1000)
    expect(queue.size).toBe(1)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(queue.size).toBe(0)
  })

  it('never touches a map that has gone (isLive false): stops instead', () => {
    const { m, set } = fakeMap()
    let live = true
    startFloatMotion(m, () => ({ dropAt: -1e9, riseAt: -1e9 }), () => live)
    runFrame(1000)
    const n = set.length
    live = false
    runFrame(2000)
    expect(set.length).toBe(n)
    expect(queue.size).toBe(0)
  })

  it('skips layers the map lacks', () => {
    const set: string[] = []
    const m = { getLayer: (id: string) => (id === 'float-j' ? { id } : undefined), setPaintProperty: (id: string) => set.push(id) }
    startFloatMotion(m as unknown as maplibregl.Map, () => ({ dropAt: -1e9, riseAt: -1e9 }))
    runFrame(1000)
    expect(set).toEqual(['float-j'])
  })
})

describe('restFloat', () => {
  it('puts every moving layer back at [0, 0]', () => {
    const { m, set } = fakeMap()
    restFloat(m)
    expect(set.length).toBe(Object.keys(floatTranslates(0, { dropAt: -1e9, riseAt: -1e9 })).length)
    expect(set.every((s) => s.prop === 'icon-translate' && (s.v as number[])[0] === 0 && (s.v as number[])[1] === 0)).toBe(true)
  })
})
