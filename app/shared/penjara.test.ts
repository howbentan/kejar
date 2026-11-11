import { describe, expect, it } from 'vitest'
import { iso, player, T0 } from './fixtures.js'
import { pickReel, REEL_SLOTS, RESCUE_HOLD_MS, RESCUE_PING_MS, rescueVerdict } from './penjara.js'
import { seeded } from './testing.js'
import type { Position } from './types.js'

const jail = { lat: 3.0, lng: 101.0 }
/** A fix `m` metres north of Penjara, `ms` after the rescue started. */
const fix = (m: number, ms: number, accuracy_m = 5): Position => ({ lat: jail.lat + m / 111_195, lng: jail.lng, accuracy_m, at: iso(T0 + ms) })
const hafiz = player('r2', 'runner', { name: 'Hafiz', tag_id: 3 })
const base = { rescue: { by: 'r2', startedAt: T0 }, rescuer: hafiz, fixes: [fix(10, 0)], jail, now: T0 + 5_000 }

describe('the 10-second rescue (rules §9a)', () => {
  it('holds the exact values', () => {
    expect(RESCUE_HOLD_MS).toBe(10_000)
    expect(RESCUE_PING_MS).toBe(1_500)
  })
  it('is holding at +5 s', () => {
    expect(rescueVerdict(base)).toBe('holding')
  })
  it('succeeds at +10 s', () => {
    expect(rescueVerdict({ ...base, now: T0 + 10_000 })).toBe('success')
  })
  it('fails when the rescuer is jailed', () => {
    expect(rescueVerdict({ ...base, rescuer: { ...hafiz, jailed: true } })).toBe('failed')
  })
  it('fails when the rescuer is Luar Garisan', () => {
    expect(rescueVerdict({ ...base, rescuer: { ...hafiz, disqualified_at: iso(T0) } })).toBe('failed')
  })
  it('fails with a fix 60 m away at accuracy 5', () => {
    expect(rescueVerdict({ ...base, fixes: [fix(10, 0), fix(60, 3_000, 5)] })).toBe('failed')
  })
  it('is not failed by one fix 60 m away at accuracy 50', () => {
    expect(rescueVerdict({ ...base, fixes: [fix(10, 0), fix(60, 3_000, 50)] })).toBe('holding')
  })
  it('forgives GPS error up to 20 m: 45 m away at accuracy 20 still holds', () => {
    expect(rescueVerdict({ ...base, fixes: [fix(45, 3_000, 20)] })).toBe('holding')
  })
  it('ignores fixes from before the rescue started, and after the hold was done', () => {
    expect(rescueVerdict({ ...base, fixes: [fix(200, -5_000)] })).toBe('holding')
    expect(rescueVerdict({ ...base, now: T0 + 12_000, fixes: [fix(200, 11_000)] })).toBe('success')
  })
})

describe('the Penjara reel', () => {
  it('has 10 slots', () => expect(REEL_SLOTS).toBe(10))
  it('lands on free about 1 in 10', () => {
    const rng = seeded(42)
    let free = 0
    for (let i = 0; i < 10_000; i++) if (pickReel(rng, false) === 'free') free++
    expect(free / 10_000).toBeGreaterThan(0.08)
    expect(free / 10_000).toBeLessThan(0.12)
  })
  it('is always black once the escape is used', () => {
    const rng = seeded(42)
    for (let i = 0; i < 10_000; i++) expect(pickReel(rng, true)).toBe('black')
  })
})
