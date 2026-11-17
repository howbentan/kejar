import { describe, expect, it } from 'vitest'
import { game, iso, MIN, player, T0 } from './fixtures.js'
import {
  fiveLeftDue,
  FIVE_LEFT_MS,
  HEAD_START_MS,
  keyTurn,
  legacyRescue,
  pickReel,
  REEL_SLOTS,
  RESCUE_BEAT_LAPSE_MS,
  RESCUE_HOLD_MS,
  RESCUE_PING_MS,
  RESCUE_RADIUS_M,
  RESCUE_RESET_MS,
  rescueProgress,
  rescueSuccessAt,
  rescueVerdict,
} from './penjara.js'
import { seeded } from './testing.js'
import type { Position, RescueRecord } from './types.js'

const jail = { lat: 3.0, lng: 101.0 }
/** A fix `m` metres north of Penjara, `ms` after the rescue started. */
const fix = (m: number, ms: number, accuracy_m = 5): Position => ({ lat: jail.lat + m / 111_195, lng: jail.lng, accuracy_m, at: iso(T0 + ms) })
const hafiz = player('r2', 'runner', { name: 'Hafiz', tag_id: 3 })
/** A rescue that began at T0 with a thumb on the key; `over` changes any part of it. */
const rec = (over: Partial<RescueRecord> = {}): RescueRecord => ({ by: 'r2', startedAt: iso(T0), heldMs: 0, holdSince: iso(T0), lastBeat: iso(T0), releasedAt: null, ...over })
/** A thumb that is down and beating at T0 + 5 s. */
const live = rec({ lastBeat: iso(T0 + 5_000) })
const verdict = (rescue: RescueRecord, now: number, over: Partial<Parameters<typeof rescueVerdict>[0]> = {}) =>
  rescueVerdict({ rescue, rescuer: hafiz, fixes: [fix(10, 0)], jail, now, ...over })

describe('the held-key rescue (rules §9a)', () => {
  it('holds the exact values', () => {
    expect(RESCUE_HOLD_MS).toBe(20_000)
    expect(RESCUE_RESET_MS).toBe(5_000)
    expect(RESCUE_BEAT_LAPSE_MS).toBe(2_000)
    expect(HEAD_START_MS).toBe(10_000)
    expect(RESCUE_RADIUS_M).toBe(30)
    expect(RESCUE_PING_MS).toBe(1_500)
  })
  it('is holding at 19 999 ms and succeeds at 20 000 ms', () => {
    expect(verdict(rec({ lastBeat: iso(T0 + 19_999) }), T0 + 19_999).kind).toBe('holding')
    expect(verdict(rec({ lastBeat: iso(T0 + 20_000) }), T0 + 20_000).kind).toBe('success')
  })
  it('counts held time from an earlier stretch plus the live one', () => {
    const r = rec({ heldMs: 7_000, holdSince: iso(T0 + 10_000), lastBeat: iso(T0 + 22_000) })
    expect(rescueProgress(r, T0 + 22_000)).toEqual({ heldMs: 19_000, holding: true, offSince: null })
    expect(verdict(r, T0 + 22_000).kind).toBe('holding')
    expect(verdict({ ...r, lastBeat: iso(T0 + 23_000) }, T0 + 23_000).kind).toBe('success')
  })
  it('after a release the key waits: paused at +3 s with the 7 s kept, reset at +5 s', () => {
    const r = rec({ heldMs: 7_000, holdSince: null, lastBeat: null, releasedAt: iso(T0 + 7_000) })
    expect(rescueProgress(r, T0 + 10_000)).toEqual({ heldMs: 7_000, holding: false, offSince: T0 + 7_000 })
    expect(verdict(r, T0 + 10_000).kind).toBe('paused')
    expect(verdict(r, T0 + 11_999).kind).toBe('paused')
    expect(verdict(r, T0 + 12_000)).toEqual({ kind: 'reset' })
  })
  it('a thumb that stopped beating counts as lifted at the last beat (Review Focus 1)', () => {
    const r = rec({ heldMs: 0, holdSince: iso(T0), lastBeat: iso(T0 + 7_000) })
    // 2.5 s after the last beat: held stops at that beat, and the 5 s window already runs from it.
    expect(rescueProgress(r, T0 + 9_500)).toEqual({ heldMs: 7_000, holding: false, offSince: T0 + 7_000 })
    expect(verdict(r, T0 + 9_500).kind).toBe('paused')
    // Inside the lapse it is still held.
    expect(rescueProgress(r, T0 + 8_000)).toEqual({ heldMs: 8_000, holding: true, offSince: null })
    expect(verdict(r, T0 + 12_000)).toEqual({ kind: 'reset' })
  })
  it('fails when the rescuer is jailed, Luar Garisan, or gone', () => {
    expect(verdict(live, T0 + 5_000, { rescuer: { ...hafiz, jailed: true } })).toEqual({ kind: 'failed', reason: 'removed' })
    expect(verdict(live, T0 + 5_000, { rescuer: { ...hafiz, disqualified_at: iso(T0) } })).toEqual({ kind: 'failed', reason: 'removed' })
    expect(verdict(live, T0 + 5_000, { rescuer: undefined })).toEqual({ kind: 'failed', reason: 'removed' })
  })
  it('fails with a fix 45 m away at accuracy 8, but ignores one at accuracy 25', () => {
    expect(verdict(live, T0 + 5_000, { fixes: [fix(10, 0), fix(45, 3_000, 8)] })).toEqual({ kind: 'failed', reason: 'left' })
    expect(verdict(live, T0 + 5_000, { fixes: [fix(10, 0), fix(45, 3_000, 25)] }).kind).toBe('holding')
  })
  it('forgives GPS error up to 20 m: 45 m away at accuracy 20 still holds', () => {
    expect(verdict(live, T0 + 5_000, { fixes: [fix(45, 3_000, 20)] }).kind).toBe('holding')
  })
  it('ignores fixes from before the rescue started', () => {
    expect(verdict(live, T0 + 5_000, { fixes: [fix(200, -5_000)] }).kind).toBe('holding')
  })
  it('ignores a fix sent during a pause', () => {
    const pauses = [{ from: iso(T0 + 2_000), to: iso(T0 + 4_000) }]
    expect(verdict(live, T0 + 5_000, { fixes: [fix(200, 3_000)], pauses }).kind).toBe('holding')
    expect(verdict(live, T0 + 5_000, { fixes: [fix(200, 4_500)], pauses })).toEqual({ kind: 'failed', reason: 'left' })
  })
  it('a fix away while the key is waiting still fails it', () => {
    const r = rec({ heldMs: 7_000, holdSince: null, lastBeat: null, releasedAt: iso(T0 + 7_000) })
    expect(verdict(r, T0 + 9_000, { fixes: [fix(60, 8_000)] })).toEqual({ kind: 'failed', reason: 'left' })
  })
})

describe('rescueSuccessAt', () => {
  it('is null until 20 s are held', () => {
    expect(rescueSuccessAt(rec({ lastBeat: iso(T0 + 19_000) }), T0 + 19_999)).toBeNull()
  })
  it('is the moment the live stretch reached 20 s, however late it is asked', () => {
    const r = rec({ heldMs: 7_000, holdSince: iso(T0 + 10_000), lastBeat: iso(T0 + 22_500) })
    expect(rescueSuccessAt(r, T0 + 23_000)).toBe(T0 + 23_000)
    expect(rescueSuccessAt(r, T0 + 24_000)).toBe(T0 + 23_000)
  })
  it('for 20 s banked by a let-go, is that much before the let-go', () => {
    const r = rec({ heldMs: 21_000, holdSince: null, lastBeat: null, releasedAt: iso(T0 + 21_000) })
    expect(rescueSuccessAt(r, T0 + 22_000)).toBe(T0 + 20_000)
  })
})

describe('legacyRescue', () => {
  it('reads the old { by, startedAt } as a key already let go', () => {
    const r = legacyRescue({ by: 'r2', startedAt: iso(T0) })
    expect(r).toEqual({ by: 'r2', startedAt: iso(T0), heldMs: 0, holdSince: null, lastBeat: null, releasedAt: iso(T0) })
  })
  it('keeps the new fields when they are there', () => {
    const full = rec({ heldMs: 3_000 })
    expect(legacyRescue(full)).toEqual(full)
  })
})

describe('keyTurn', () => {
  it('starts upright, clicks once per 5 s, and ends a quarter turn round', () => {
    expect(keyTurn(0)).toEqual({ notch: 0, angle: 0 })
    expect(keyTurn(5_000)).toEqual({ notch: 1, angle: 22.5 })
    expect(keyTurn(10_000)).toEqual({ notch: 2, angle: 45 })
    expect(keyTurn(15_000)).toEqual({ notch: 3, angle: 67.5 })
    expect(keyTurn(20_000)).toEqual({ notch: 4, angle: 90 })
  })
  it('strains a little toward the next click, never past 4 degrees', () => {
    expect(keyTurn(4_000).notch).toBe(0)
    expect(keyTurn(4_000).angle).toBeGreaterThan(0)
    expect(keyTurn(4_999).angle).toBeLessThanOrEqual(4)
    expect(keyTurn(9_000).angle).toBeGreaterThan(22.5)
    expect(keyTurn(9_000).angle).toBeLessThanOrEqual(26.5)
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
