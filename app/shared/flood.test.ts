import { describe, expect, it } from 'vitest'
import { circlePolygon, distanceM } from './geo.js'
import { inPlayArea, ringAreaHa } from './playArea.js'
import { clipToCircle, FLOOD_GRACE_MS, FLOOD_LEFT_MIN, floodNow, floodPlan, floodRadius, floodSteps, inWater, wetElapsed } from './flood.js'
import type { Game } from './types.js'

const CENTER = { lat: 3.0, lng: 101.0 }
const boundary = circlePolygon(CENTER, 300, 48)
const arena = { id: 'a', name: 'Park', boundary, holes: [], jail: CENTER, start: CENTER } as unknown as Game['arena']
const T0 = Date.parse('2026-11-16T10:00:00.000Z')
const MIN = 60_000

/** A 10 min hide, 45 min chase game with Banjir Kilat revealed (or not). */
const game = (over: Partial<Game> = {}): Game =>
  ({
    id: 'g1',
    arena,
    settings: { hideMin: 10, lengthMin: 45 },
    started_at: new Date(T0).toISOString(),
    ended_at: null,
    paused_at: null,
    pauses: [],
    final_whistle_at: null,
    deck_seed: 'seed-1',
    endgame: { kind: 'banjir', revealedAt: new Date(T0 + 45 * MIN).toISOString(), wanted: null, bountyAt: null },
    ...over,
  }) as unknown as Game
const end = T0 + 55 * MIN

describe('floodPlan', () => {
  it('picks a spot inside the play area, the same one every time for the same seed', () => {
    const a = floodPlan(arena, 'seed-1')
    expect(inPlayArea(a.center, arena)).toBe(true)
    expect(floodPlan(arena, 'seed-1')).toEqual(a)
    expect(floodPlan(arena, 'seed-2').center).not.toEqual(a.center)
  })

  it('starts by covering the whole area and ends with about a quarter of it', () => {
    const p = floodPlan(arena, 'seed-1')
    for (const v of boundary) expect(distanceM(p.center, v)).toBeLessThanOrEqual(p.r0 + 0.01)
    const finalHa = (Math.PI * p.rf ** 2) / 10_000
    expect(finalHa / ringAreaHa(boundary)).toBeCloseTo(0.25, 2)
    expect(floodRadius(p, 0)).toBe(p.r0)
    expect(floodRadius(p, 4)).toBeCloseTo(p.rf, 6)
    expect(floodRadius(p, 2)).toBeCloseTo((p.r0 + p.rf) / 2, 6)
  })
})

describe('floodSteps and floodNow', () => {
  it('rises at 8, 6, 4 and 2 minutes left, each warned 60 s before', () => {
    expect(FLOOD_LEFT_MIN).toEqual([8, 6, 4, 2])
    const steps = floodSteps(game())
    expect(steps.map((s) => s.at)).toEqual([end - 8 * MIN, end - 6 * MIN, end - 4 * MIN, end - 2 * MIN])
    expect(steps.map((s) => s.at - s.warnAt)).toEqual([MIN, MIN, MIN, MIN])
  })

  it('a pause pushes every step later', () => {
    const paused = game({ pauses: [{ from: new Date(T0 + 30 * MIN).toISOString(), to: new Date(T0 + 33 * MIN).toISOString() }] })
    expect(floodSteps(paused)[0].at).toBe(end - 8 * MIN + 3 * MIN)
  })

  it('is nothing until Banjir Kilat is revealed; then the radius drops a step at a time', () => {
    expect(floodNow(game({ endgame: { kind: 'banjir', revealedAt: null, wanted: null, bountyAt: null } }), end - 9 * MIN)).toBeNull()
    expect(floodNow(game({ endgame: { kind: 'bomba', revealedAt: new Date(T0).toISOString(), wanted: null, bountyAt: null } }), end - 9 * MIN)).toBeNull()
    const p = floodPlan(arena, 'seed-1')
    const before = floodNow(game(), end - 9 * MIN)!
    expect(before.radiusM).toBe(p.r0)
    expect(before.next?.at).toBe(end - 8 * MIN)
    const after2 = floodNow(game(), end - 5 * MIN - 30_000)!
    expect(after2.radiusM).toBeCloseTo(floodRadius(p, 2), 6)
    expect(after2.warning).toBe(false)
    expect(floodNow(game(), end - 4 * MIN - 30_000)!.warning).toBe(true)
    expect(floodNow(game(), end - MIN)!.next).toBeNull()
  })
})

describe('inWater', () => {
  it('only beyond the waterline by more than 10 m, once the water has risen', () => {
    const g = game()
    const p = floodPlan(arena, 'seed-1')
    const t = end - 3 * MIN // three steps in
    const r = floodRadius(p, 3)
    const along = (m: number) => ({ lat: p.center.lat + m / 111_195, lng: p.center.lng })
    expect(inWater(along(r - 5), g, t)).toBe(false)
    expect(inWater(along(r + 5), g, t)).toBe(false)
    expect(inWater(along(r + 15), g, t)).toBe(true)
    expect(inWater(along(r + 15), g, end - 9 * MIN)).toBe(false)
  })
})

describe('wetElapsed', () => {
  it('counts time in the water, leaving out any pause', () => {
    const since = end - 3 * MIN
    expect(wetElapsed(game(), since, since + 20_000)).toBe(20_000)
    const paused = game({ pauses: [{ from: new Date(since + 5_000).toISOString(), to: new Date(since + 15_000).toISOString() }] })
    expect(wetElapsed(paused, since, since + 20_000)).toBe(10_000)
    expect(FLOOD_GRACE_MS).toBe(30_000)
  })
})

describe('clipToCircle', () => {
  it('keeps the part of the play area inside the circle', () => {
    const dry = clipToCircle(boundary, CENTER, 150)
    expect(dry.length).toBeGreaterThan(8)
    for (const v of dry) expect(distanceM(CENTER, v)).toBeLessThanOrEqual(151)
    expect(clipToCircle(boundary, CENTER, 1000).length).toBe(boundary.length)
  })
})
