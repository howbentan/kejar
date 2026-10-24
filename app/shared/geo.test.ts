import { describe, expect, it } from 'vitest'
import { circlePolygon, distanceM, distanceOutsideM, fuzz, pointInPolygon } from './geo.js'

const KL = { lat: 3.139, lng: 101.6869 }

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM(KL, KL)).toBe(0)
  })
  it('matches one degree of longitude at the equator', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -1)
  })
})

describe('pointInPolygon', () => {
  const sq = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ]
  it('detects inside and outside', () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, sq)).toBe(true)
    expect(pointInPolygon({ lat: 2, lng: 0.5 }, sq)).toBe(false)
  })
})

describe('circlePolygon', () => {
  it('places 24 points at the radius', () => {
    const c = circlePolygon(KL, 200)
    expect(c).toHaveLength(24)
    c.forEach((p) => expect(distanceM(KL, p)).toBeCloseTo(200, 0))
  })
})

describe('fuzz', () => {
  it('moves a point by at most the radius, deterministically per seed', () => {
    const f = fuzz(KL, 15, 'p1:3')
    expect(distanceM(KL, f)).toBeLessThanOrEqual(15)
    expect(fuzz(KL, 15, 'p1:3')).toEqual(f)
    expect(fuzz(KL, 15, 'p1:4')).not.toEqual(f)
  })
})

describe('distanceOutsideM', () => {
  const square = [
    { lat: 3.0, lng: 101.0 },
    { lat: 3.0, lng: 101.01 },
    { lat: 3.01, lng: 101.01 },
    { lat: 3.01, lng: 101.0 },
  ]
  it('is 0 inside', () => {
    expect(distanceOutsideM({ lat: 3.005, lng: 101.005 }, square)).toBe(0)
  })
  it('is about 30 m for a point 30 m past the edge', () => {
    expect(distanceOutsideM({ lat: 3.01 + 30 / 111_195, lng: 101.005 }, square)).toBeCloseTo(30, -0.5)
  })
  it('measures to the corner when past it', () => {
    const p = { lat: 3.01 + 30 / 111_195, lng: 101.01 + 40 / 111_000 }
    expect(Math.abs(distanceOutsideM(p, square) - 50)).toBeLessThan(2)
  })
})
