import { describe, expect, it } from 'vitest'
import { distanceM } from './geo.js'
import { buildPlayArea, defaultPoint, distanceOutsidePlayArea, inPlayArea, MAX_PLAY_AREA_HA, ringAreaHa } from './playArea.js'
import type { LatLng } from './types.js'

const C = { lat: 3.15, lng: 101.7 }
const M = 111_195
/** dx metres east, dy metres north of C. */
const at = (dx: number, dy: number): LatLng => ({ lat: C.lat + dy / M, lng: C.lng + dx / (M * Math.cos((C.lat * Math.PI) / 180)) })
const rect = (x0: number, y0: number, x1: number, y1: number): LatLng[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

const park = rect(-200, -200, 200, 200) // 16 ha
const lake = rect(-50, -50, 50, 50) // 1 ha

describe('ringAreaHa', () => {
  it('measures a 400 m square as 16 ha', () => {
    expect(ringAreaHa(park)).toBeCloseTo(16, 1)
  })
})

describe('buildPlayArea', () => {
  it('cuts the lake out as a hole', () => {
    const a = buildPlayArea({ outline: park, water: [lake], circle: null })
    expect(a.holes).toHaveLength(1)
    expect(Math.abs(a.areaHa - 15)).toBeLessThan(0.3)
    expect(inPlayArea(C, a)).toBe(false)
    expect(inPlayArea(at(0, 150), a)).toBe(true)
    expect(a.pieces).toBe(1)
  })

  it('ignores water under 0.05 ha', () => {
    expect(buildPlayArea({ outline: park, water: [rect(-7.5, -7.5, 7.5, 7.5)], circle: null }).holes).toEqual([])
  })

  it('circle keeps only the overlap', () => {
    const centre = at(150, 0)
    const a = buildPlayArea({ outline: park, water: [], circle: { center: centre, radiusM: 100 } })
    expect(a.areaHa).toBeLessThan((Math.PI * 100 ** 2) / 10_000)
    for (const p of a.boundary) expect(distanceM(p, centre)).toBeLessThan(101)
  })

  it('circle splitting the park keeps the largest piece', () => {
    const strip = rect(-110, -300, -90, 300)
    const a = buildPlayArea({ outline: park, water: [strip], circle: { center: C, radiusM: 200 } })
    expect(a.pieces).toBe(2)
    expect(inPlayArea(at(150, 0), a)).toBe(true)
    expect(inPlayArea(at(-150, 0), a)).toBe(false)
  })

  it('no outline means just the circle', () => {
    expect(Math.abs(buildPlayArea({ outline: null, water: [], circle: { center: C, radiusM: 200 } }).areaHa - 12.57)).toBeLessThan(0.2)
  })

  it('throws when nothing is left to play on', () => {
    expect(() => buildPlayArea({ outline: lake, water: [park], circle: null })).toThrow('Nothing left to play on')
  })

  it('caps at a 500 m circle', () => {
    expect(MAX_PLAY_AREA_HA).toBeCloseTo(78.54, 1)
  })
})

describe('distanceOutsidePlayArea', () => {
  const a = buildPlayArea({ outline: park, water: [lake], circle: null })
  it('is 0 inside', () => {
    expect(distanceOutsidePlayArea(at(0, 150), a)).toBe(0)
  })
  it('measures past the park edge', () => {
    expect(Math.abs(distanceOutsidePlayArea(at(0, 230), a) - 30)).toBeLessThan(1)
  })
  it('measures from the shore when in the lake', () => {
    expect(Math.abs(distanceOutsidePlayArea(at(0, 20), a) - 30)).toBeLessThan(1)
  })
  it('treats an arena without holes as just its boundary', () => {
    expect(distanceOutsidePlayArea(C, { boundary: park })).toBe(0)
  })
})

describe('defaultPoint', () => {
  it('lands in the play area even when the centre is a lake', () => {
    const a = buildPlayArea({ outline: park, water: [lake], circle: null })
    expect(inPlayArea(defaultPoint(a), a)).toBe(true)
  })
  it('uses the middle when it is dry', () => {
    const a = buildPlayArea({ outline: park, water: [], circle: null })
    expect(distanceM(defaultPoint(a), C)).toBeLessThan(5)
  })
})
