import { describe, expect, it } from 'vitest'
import { game, iso, MIN, player, T0 } from './fixtures.js'
import { fiveLeftDue, FIVE_LEFT_MS, pickReel, REEL_SLOTS, RESCUE_HOLD_MS, RESCUE_PING_MS, rescueVerdict } from './penjara.js'
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

describe('5 minutes left (rules §2.7)', () => {
  // Default game: 5 min hiding, then 45 min of chase, so it ends at T0 + 50 min.
  const END = T0 + 50 * MIN
  const g = game()
  it('holds the exact value', () => expect(FIVE_LEFT_MS).toBe(5 * MIN))
  it('is due at 4:59 left and not at 5:01 left', () => {
    expect(fiveLeftDue(g, END - 4 * MIN - 59_000)).toBe(true)
    expect(fiveLeftDue(g, END - 5 * MIN - 1_000)).toBe(false)
    expect(fiveLeftDue(g, END - 5 * MIN)).toBe(true)
  })
  it('is not due while hiding, or once the game has ended', () => {
    expect(fiveLeftDue(g, T0 + MIN)).toBe(false)
    expect(fiveLeftDue({ ...g, ended_at: iso(END - MIN) }, END - 4 * MIN)).toBe(false)
    expect(fiveLeftDue(g, END + 1_000)).toBe(false)
  })
  it('is not due while paused', () => {
    expect(fiveLeftDue({ ...g, paused_at: iso(END - 6 * MIN) }, END - 4 * MIN)).toBe(false)
  })
  it('is not due with a final whistle pending', () => {
    expect(fiveLeftDue({ ...g, final_whistle_at: iso(END - 4.5 * MIN) }, END - 4 * MIN)).toBe(false)
  })
  it('is not due once warned (Review Focus 5)', () => {
    expect(fiveLeftDue({ ...g, five_warned_at: iso(END - 4.9 * MIN) }, END - 4 * MIN)).toBe(false)
  })
  it('is due straight away for a game that starts its chase with 5 minutes or less left', () => {
    const short = game({ settings: { ...g.settings, lengthMin: 3 } })
    expect(fiveLeftDue(short, T0 + 5 * MIN + 1_000)).toBe(true)
  })
})
