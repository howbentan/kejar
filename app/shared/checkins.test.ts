import { describe, expect, it } from 'vitest'
import { alertLeadFor, autoJailDue, checkedIn, countRestartAt, fairlyWarned, LATE_PING_MIN_WARNING_MS } from './checkins.js'
import { iso, MIN, T0 } from './fixtures.js'
import type { GameEvent } from './types.js'

describe('countRestartAt', () => {
  const ended = (outcome: string, at: number, target = 'r1'): GameEvent => ({ id: `e${at}`, game_id: 'g', at: iso(at), type: 'arrest-ended', actor_id: null, target_id: target, data: { outcome } })
  it('is freed_at with no released house arrest', () => {
    expect(countRestartAt({ id: 'r1', freed_at: null }, [])).toBeNull()
    expect(countRestartAt({ id: 'r1', freed_at: iso(T0) }, [ended('revoked', T0 + MIN), ended('free', T0 + MIN, 'r2')])).toBe(iso(T0))
  })
  it('is the later of freed_at and a house arrest that ended free or undone', () => {
    expect(countRestartAt({ id: 'r1', freed_at: iso(T0) }, [ended('free', T0 + MIN)])).toBe(iso(T0 + MIN))
    expect(countRestartAt({ id: 'r1', freed_at: null }, [ended('undone', T0 + MIN)])).toBe(iso(T0 + MIN))
    expect(countRestartAt({ id: 'r1', freed_at: iso(T0 + 2 * MIN) }, [ended('free', T0 + MIN)])).toBe(iso(T0 + 2 * MIN))
  })
})

const R = T0 + 10 * MIN
const LEAD = 45_000

describe('checkedIn', () => {
  it('counts a location exactly 45 s before the reveal, and not one a millisecond earlier', () => {
    expect(checkedIn(R - LEAD, R, R - 45_000)).toBe(true)
    expect(checkedIn(R - LEAD, R, R - 45_001)).toBe(false)
  })
  it('counts a location at the reveal itself', () => {
    expect(checkedIn(R - LEAD, R, R)).toBe(true)
  })
  it('a pause inside the window stretches it: a check-in before the pause still counts', () => {
    // Alert at R - 45 s, then a 5-minute pause pushed the reveal to R + 5 min.
    expect(checkedIn(R - LEAD, R + 5 * MIN, R - 30_000)).toBe(true)
  })
  it('never counts a location after the reveal, or no location', () => {
    expect(checkedIn(R - LEAD, R, R + 1)).toBe(false)
    expect(checkedIn(R - LEAD, R, null)).toBe(false)
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

describe('fairlyWarned', () => {
  it('needs 25 s between the alert going out and the reveal in push mode', () => {
    expect(LATE_PING_MIN_WARNING_MS).toBe(25_000)
    expect(fairlyWarned(R - 25_000, R, 'push')).toBe(true)
    expect(fairlyWarned(R - 24_999, R, 'push')).toBe(false)
    expect(fairlyWarned(null, R, 'push')).toBe(false)
  })
  it('is always true in schedule mode, where the schedule is the warning', () => {
    expect(fairlyWarned(null, R, 'schedule')).toBe(true)
    expect(fairlyWarned(R - 1_000, R, 'schedule')).toBe(true)
  })
})
