import { describe, expect, it } from 'vitest'
import { iso, T0 } from './fixtures.js'
import { ARREST_FIX_FRESH_MS, ARREST_MS, ARREST_OPEN_MS, ARREST_RADIUS_M, arrestEndsAt, insideArrest, releaseVerdict, usableFix } from './arrest.js'
import type { Arrest, Position } from './types.js'

const center = { lat: 3.0, lng: 101.0 }
/** A fix `m` metres north of the centre, `ms` after the house arrest started. */
const fix = (m: number, ms: number, accuracy_m = 5): Position => ({ lat: center.lat + m / 111_195, lng: center.lng, accuracy_m, at: iso(T0 + ms) })
const arrest: Arrest = { firedAt: iso(T0), route: 'catch', by: 'c1', center, startedAt: iso(T0), ringId: 'u1', catchEventId: 'e1' }
const waiting: Arrest = { ...arrest, route: 'auto-jail', by: null, center: null, startedAt: null, catchEventId: null }

describe('Super Ring house arrest (new power-ups §6.2)', () => {
  it('holds the exact values', () => {
    expect(ARREST_MS).toBe(156_000)
    expect(ARREST_RADIUS_M).toBe(26)
    expect(ARREST_OPEN_MS).toBe(60_000)
    expect(ARREST_FIX_FRESH_MS).toBe(20_000)
  })

  it('ends 2:36 after it started, and has no end while waiting', () => {
    expect(arrestEndsAt(arrest)).toBe(T0 + ARREST_MS)
    expect(arrestEndsAt(waiting)).toBeNull()
  })

  it('a usable fix is one Luar Garisan would count (50 m or better)', () => {
    expect(usableFix(fix(0, 0, 50))).toBe(true)
    expect(usableFix(fix(0, 0, 51))).toBe(false)
  })

  it('inside means within 26 m plus the fix error', () => {
    expect(insideArrest(arrest, fix(30, 0, 5))).toBe(true)
    expect(insideArrest(arrest, fix(32, 0, 5))).toBe(false)
    expect(insideArrest(waiting, fix(0, 0))).toBe(false)
  })

  it('free inside with a fresh fix', () => {
    expect(releaseVerdict(arrest, fix(10, ARREST_MS - 5_000))).toBe('free')
    expect(releaseVerdict(arrest, fix(10, ARREST_MS))).toBe('free')
  })

  it('revoked outside', () => {
    expect(releaseVerdict(arrest, fix(60, ARREST_MS - 5_000))).toBe('revoked')
  })

  it('revoked with a 21 s old fix (Review Focus 1)', () => {
    expect(releaseVerdict(arrest, fix(10, ARREST_MS - 21_000))).toBe('revoked')
    expect(releaseVerdict(arrest, fix(10, ARREST_MS - 20_000))).toBe('free')
  })

  it('revoked with a 60 m accuracy fix', () => {
    expect(releaseVerdict(arrest, fix(10, ARREST_MS - 5_000, 60))).toBe('revoked')
  })

  it('revoked with no fix', () => {
    expect(releaseVerdict(arrest, null)).toBe('revoked')
  })

  it('a fix after the end does not count', () => {
    expect(releaseVerdict(arrest, fix(10, ARREST_MS + 1))).toBe('revoked')
  })

  it('a waiting arrest is never free', () => {
    expect(releaseVerdict(waiting, fix(0, 0))).toBe('revoked')
  })
})
