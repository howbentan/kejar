import { describe, expect, it } from 'vitest'
import { alertLeadFor, autoJailDue, checkedIn } from './checkins.js'
import { MIN, T0 } from './fixtures.js'

const R = T0 + 10 * MIN
const LEAD = 45_000

describe('checkedIn', () => {
  it('counts a location exactly 45 s before the reveal, and not one a millisecond earlier', () => {
    expect(checkedIn(R, R - 45_000, LEAD)).toBe(true)
    expect(checkedIn(R, R - 45_001, LEAD)).toBe(false)
  })
  it('counts a location at the reveal itself', () => {
    expect(checkedIn(R, R, LEAD)).toBe(true)
  })
  it('never counts a location after the reveal, or no location', () => {
    expect(checkedIn(R, R + 1, LEAD)).toBe(false)
    expect(checkedIn(R, null, LEAD)).toBe(false)
  })
})

describe('alertLeadFor', () => {
  it('is 45 s for scheduled pings and 30 s for bonus pings', () => {
    expect(alertLeadFor(1)).toBe(45_000)
    expect(alertLeadFor(1000)).toBe(30_000)
  })
})

describe('autoJailDue', () => {
  // Scheduled reveals at +10, +15, +20 min; each alert 45 s before.
  const ping = (m: number, lastAt: number | null) => ({ alertAt: T0 + m * MIN - LEAD, revealAt: T0 + m * MIN, lastAt })
  const chaseStart = T0 + 5 * MIN

  it('is due when the last two were both missed', () => {
    expect(autoJailDue([ping(10, null), ping(15, null)], chaseStart)).toBe(true)
  })
  it('is not due after only one miss (the free miss)', () => {
    expect(autoJailDue([ping(10, T0 + 10 * MIN - 5_000), ping(15, null)], chaseStart)).toBe(false)
  })
  it('is not due with only one scheduled ping so far', () => {
    expect(autoJailDue([ping(10, null)], chaseStart)).toBe(false)
  })
  it('does not count a ping whose alert came before the release', () => {
    const freedAt = T0 + 10 * MIN - 10_000 // freed 10 s before ping 1's reveal, after its alert
    expect(autoJailDue([ping(10, null), ping(15, null)], freedAt)).toBe(false)
  })
  it('counts a ping whose alert came exactly at the release', () => {
    const freedAt = T0 + 10 * MIN - LEAD
    expect(autoJailDue([ping(10, null), ping(15, null)], freedAt)).toBe(true)
  })
  it('is never due for a runner who keeps the page open', () => {
    expect(autoJailDue([ping(10, T0 + 10 * MIN - 5_000), ping(15, T0 + 15 * MIN - 5_000), ping(20, T0 + 20 * MIN - 5_000)], chaseStart)).toBe(false)
  })
  it('treats a location from before the window as a miss', () => {
    expect(autoJailDue([ping(10, T0 + 10 * MIN - 60_000), ping(15, T0 + 15 * MIN - 50_000)], chaseStart)).toBe(true)
  })
})
