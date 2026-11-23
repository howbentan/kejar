// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { HOVER, floatTranslates, restFloat, startFloatMotion } from './floatMotion'

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
  it('drops a claimed gem from 38 px up to the ground in 650 ms', () => {
    const dropAt = 10_000
    expect(HOVER).toBe(38)
    expect(floatTranslates(dropAt, { dropAt, riseAt: -1e9 })['landed-gem']).toEqual([0, -38])
    expect(floatTranslates(dropAt + 650, { dropAt, riseAt: -1e9 })['landed-gem']).toEqual([0, 0])
    expect(floatTranslates(dropAt + 5000, { dropAt, riseAt: -1e9 })['landed-gem']).toEqual([0, 0])
  })

  it('a reopened gem rises from the ground (+38 px) to its hover over 700 ms, on top of its bob', () => {
    const riseAt = 10_000
    const bob = (t: number) => Math.sin(t / 900 + 1.4) * 4
    expect(floatTranslates(riseAt, { dropAt: -1e9, riseAt })['float-gem'][1]).toBeCloseTo(bob(riseAt) + 38)
    expect(floatTranslates(riseAt + 700, { dropAt: -1e9, riseAt })['float-gem'][1]).toBeCloseTo(bob(riseAt + 700))
  })

  it('the j bobs 3 px on its own beat; the Tupperware gems 4 px', () => {
    const tr = floatTranslates(1234, { dropAt: -1e9, riseAt: -1e9 })
    expect(tr['float-j'][1]).toBeCloseTo(Math.sin(1234 / 650) * 3)
    expect(tr['float-j-ghost']).toEqual(tr['float-j'])
    expect(Math.abs(tr['float-tupper'][1])).toBeLessThanOrEqual(4)
    expect(tr['float-tupper-stash']).toEqual(tr['float-tupper'])
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

  it('reads the drop time each frame: landed-gem is 38 px up at dropAt, on the ground 650 ms later', () => {
    const { m, last } = fakeMap()
    const ev = { dropAt: -1e9, riseAt: -1e9 }
    startFloatMotion(m, () => ev)
    ev.dropAt = 5000
    runFrame(5000)
    expect(last('landed-gem')).toEqual([0, -38])
    runFrame(5650)
    expect(last('landed-gem')).toEqual([0, 0])
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
