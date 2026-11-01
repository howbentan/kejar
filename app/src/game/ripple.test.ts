import { describe, expect, it } from 'vitest'
import type { Arena } from '../../shared/types.js'
import type { MapDot } from '../../shared/views.js'
import { revealDelay, RIPPLE_MS, rippleOrigin } from './ripple'

describe('revealDelay', () => {
  it('starts at the origin and reaches the edge at the end of the wave', () => {
    expect(revealDelay(0, 500)).toBe(0)
    expect(revealDelay(500, 500)).toBe(RIPPLE_MS)
    expect(revealDelay(900, 500)).toBe(RIPPLE_MS)
  })
  it('eases out: near circles appear early, and later ones never before nearer ones', () => {
    expect(revealDelay(250, 500)).toBeLessThan(RIPPLE_MS / 2)
    let last = -1
    for (let d = 0; d <= 500; d += 25) {
      const t = revealDelay(d, 500)
      expect(t).toBeGreaterThanOrEqual(last)
      last = t
    }
  })
})

describe('rippleOrigin', () => {
  const arena = {
    boundary: [
      { lat: 3.0, lng: 101.0 },
      { lat: 3.0, lng: 101.02 },
      { lat: 3.02, lng: 101.02 },
      { lat: 3.02, lng: 101.0 },
    ],
    start: { lat: 9, lng: 9 },
  } as Arena
  it('rolls out from my own dot', () => {
    const dots = [{ id: 'r1', kind: 'me', lat: 3.005, lng: 101.006, at: '' }] as MapDot[]
    expect(rippleOrigin(dots, arena)).toEqual({ lat: 3.005, lng: 101.006 })
  })
  it('with no dot of mine, from the middle of the play area', () => {
    const o = rippleOrigin([], arena)
    expect(o.lat).toBeCloseTo(3.01)
    expect(o.lng).toBeCloseTo(101.01)
  })
})
