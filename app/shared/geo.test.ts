import { describe, expect, it } from 'vitest'
import { circlePolygon, distanceM, fuzz, pointInPolygon } from './geo.js'

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
