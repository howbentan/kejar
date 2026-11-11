import { describe, expect, it } from 'vitest'
import { BONUS_SEQ_BASE, chaseStartOf, dueWork, FINAL_WHISTLE_MS, nextReveal, phaseAt, pingTimes, SCHEDULED_ALERT_LEAD_MS, toWall } from './clock.js'
import { game, iso, MIN, ping, T0 } from './fixtures.js'

const g = game() // hide 5, length 45, ping 5

describe('phaseAt', () => {
  it('is lobby before start', () => {
    expect(phaseAt(game({ started_at: null }), T0).phase).toBe('lobby')
  })
  it('switches phases exactly at the boundary instants', () => {
    expect(phaseAt(g, T0 + 4 * MIN).phase).toBe('hiding')
    expect(phaseAt(g, T0 + 5 * MIN - 1).phase).toBe('hiding')
    expect(phaseAt(g, T0 + 5 * MIN)).toEqual({ phase: 'chasing', endsAt: T0 + 50 * MIN })
    expect(phaseAt(g, T0 + 50 * MIN).phase).toBe('ended')
  })
  it('is ended once ended_at is set, even early', () => {
    expect(phaseAt(game({ ended_at: iso(T0 + 20 * MIN) }), T0 + 21 * MIN).phase).toBe('ended')
  })
  it('a pending final whistle holds the chase past the clock time until the game really ends', () => {
    const held = game({ final_whistle_at: iso(T0 + 50 * MIN - 20_000) })
    expect(phaseAt(held, T0 + 30 * MIN)).toEqual({ phase: 'chasing', endsAt: T0 + 50 * MIN })
    expect(phaseAt(held, T0 + 50 * MIN + 20_000)).toEqual({ phase: 'chasing', endsAt: T0 + 50 * MIN - 20_000 + FINAL_WHISTLE_MS })
    expect(phaseAt(held, T0 + 60 * MIN).phase).toBe('chasing')
    expect(phaseAt({ ...held, ended_at: iso(T0 + 50 * MIN + 40_000) }, T0 + 60 * MIN).phase).toBe('ended')
    expect(FINAL_WHISTLE_MS).toBe(60_000)
  })
  it('before the clock end, a pending whistle brings the countdown forward to the whistle end', () => {
    const early = game({ final_whistle_at: iso(T0 + 30 * MIN) })
    expect(phaseAt(early, T0 + 30 * MIN + 10_000)).toEqual({ phase: 'chasing', endsAt: T0 + 31 * MIN })
    expect(phaseAt(early, T0 + 31 * MIN).phase).toBe('chasing')
    // A whistle that would end later than the clock changes nothing.
    expect(phaseAt(game({ final_whistle_at: iso(T0 + 49.5 * MIN) }), T0 + 49.6 * MIN).endsAt).toBe(T0 + 50 * MIN)
  })
  it('an open pause holds the whistle countdown too, and a whistle started inside a pause counts from the resume', () => {
    const open = game({ final_whistle_at: iso(T0 + 30 * MIN), paused_at: iso(T0 + 30 * MIN + 20_000) })
    expect(phaseAt(open, T0 + 32 * MIN).endsAt).toBe(T0 + 31 * MIN + 100_000)
    const during = game({ final_whistle_at: iso(T0 + 31 * MIN), paused_at: iso(T0 + 30 * MIN) })
    expect(phaseAt(during, T0 + 32 * MIN).endsAt).toBe(T0 + 33 * MIN)
  })
})

describe('pingTimes', () => {
  it('reveals every ping interval during the chase, never at the end', () => {
    expect(pingTimes(g).map((p) => p.revealAt)).toEqual([10, 15, 20, 25, 30, 35, 40, 45].map((m) => T0 + m * MIN))
  })
  it('alerts 45 s before each reveal', () => {
    expect(pingTimes(g)[0]).toEqual({ seq: 1, alertAt: T0 + 10 * MIN - SCHEDULED_ALERT_LEAD_MS, revealAt: T0 + 10 * MIN })
    expect(SCHEDULED_ALERT_LEAD_MS).toBe(45_000)
  })
})

describe('dueWork', () => {
  it('has nothing to do in the lobby', () => {
    expect(dueWork(game({ started_at: null }), [], T0)).toEqual({ alert: [], reveal: [], end: false })
  })
  it('alerts before revealing', () => {
    expect(dueWork(g, [], T0 + 10 * MIN - 20_000)).toEqual({ alert: [1], reveal: [], end: false })
  })
  it('lists due pings whose flags are not set yet', () => {
    expect(dueWork(g, [], T0 + 10 * MIN)).toEqual({ alert: [1], reveal: [1], end: false })
  })
  it('advance is idempotent under repeated calls', () => {
    const done = [ping(1, T0 + 10 * MIN)]
    expect(dueWork(g, done, T0 + 10 * MIN)).toEqual({ alert: [], reveal: [], end: false })
  })
  it('asks to end the game once time is up', () => {
    const allDone = pingTimes(g).map((p) => ping(p.seq, p.revealAt))
    expect(dueWork(g, allDone, T0 + 50 * MIN)).toEqual({ alert: [], reveal: [], end: true })
  })
  it('does nothing more after the game has ended', () => {
    expect(dueWork(game({ ended_at: iso(T0 + 20 * MIN) }), [], T0 + 30 * MIN)).toEqual({
      alert: [],
      reveal: [],
      end: false,
    })
  })
})

describe('bonus pings (Flare)', () => {
  const flare = ping(BONUS_SEQ_BASE, T0 + 12 * MIN, { alerted: false, revealed: false })

  it('a bonus ping is alerted at its alert time and revealed at its reveal time', () => {
    const done = [ping(1, T0 + 10 * MIN)]
    expect(dueWork(g, [...done, flare], T0 + 12 * MIN - 30_000)).toEqual({ alert: [BONUS_SEQ_BASE], reveal: [], end: false })
    expect(dueWork(g, [...done, { ...flare, alerted: true }], T0 + 12 * MIN)).toEqual({
      alert: [],
      reveal: [BONUS_SEQ_BASE],
      end: false,
    })
  })

  it('bonus pings do not shift the schedule', () => {
    expect(pingTimes(g).map((p) => p.revealAt)[1]).toBe(T0 + 15 * MIN)
  })

  it('nextReveal picks a bonus ping that comes before the next scheduled one', () => {
    expect(nextReveal(g, [flare], T0 + 11 * MIN)).toEqual({ alertAt: T0 + 12 * MIN - 30_000, revealAt: T0 + 12 * MIN })
    expect(nextReveal(g, [{ ...flare, revealed: true }], T0 + 12.5 * MIN)).toEqual({
      alertAt: T0 + 15 * MIN - SCHEDULED_ALERT_LEAD_MS,
      revealAt: T0 + 15 * MIN,
    })
  })

  it('nextReveal is null once there are no more pings', () => {
    expect(nextReveal(g, [], T0 + 49 * MIN)).toBeNull()
  })
})

describe('pauses', () => {
  const S = 1000 // seconds → ms
  const closed = (fromMs: number, toMs: number) => ({ from: iso(fromMs), to: iso(toMs) })

  it('a pause during hiding moves hide end and game end later by its length', () => {
    const pg = game({ pauses: [closed(T0 + 2 * MIN, T0 + 3 * MIN)] })
    expect(chaseStartOf(pg)).toBe(T0 + 6 * MIN)
    expect(phaseAt(pg, T0 + 5 * MIN + 30 * S)).toEqual({ phase: 'hiding', endsAt: T0 + 6 * MIN })
    expect(phaseAt(pg, T0 + 50 * MIN).phase).toBe('chasing')
    expect(phaseAt(pg, T0 + 51 * MIN).phase).toBe('ended')
  })

  it('a pause during the chase leaves hide end alone and moves the end', () => {
    const pg = game({ pauses: [closed(T0 + 20 * MIN, T0 + 22 * MIN)] })
    expect(chaseStartOf(pg)).toBe(T0 + 5 * MIN)
    expect(phaseAt(pg, T0 + 30 * MIN).endsAt).toBe(T0 + 52 * MIN)
    expect(pingTimes(pg).map((p) => p.revealAt)).toEqual([10, 15, 22, 27, 32, 37, 42, 47].map((m) => T0 + m * MIN))
  })

  it('a pause that starts after a ping alert keeps the alert where it was and moves only the reveal', () => {
    // Ping 1 reveals at T0+10 and alerts 45 s before; a pause from T0+10 min - 20 s lasts 5 min.
    const pg = game({ pauses: [closed(T0 + 10 * MIN - 20_000, T0 + 15 * MIN - 20_000)] })
    const [p1] = pingTimes(pg, T0 + 20 * MIN)
    expect(p1.revealAt).toBe(T0 + 15 * MIN)
    expect(p1.alertAt).toBe(T0 + 10 * MIN - SCHEDULED_ALERT_LEAD_MS)
  })

  it('an open pause freezes the countdown', () => {
    const pg = game({ paused_at: iso(T0 + 20 * MIN) })
    const left = (now: number) => phaseAt(pg, now).endsAt! - now
    expect(left(T0 + 20 * MIN)).toBe(30 * MIN)
    expect(left(T0 + 20 * MIN + 40 * S)).toBe(30 * MIN)
    expect(phaseAt(pg, T0 + 60 * MIN).phase).toBe('chasing')
  })

  it('nothing is due while paused', () => {
    const pg = game({ paused_at: iso(T0 + 9 * MIN) })
    const rows = [ping(1, T0 + 10 * MIN, { alerted: false, revealed: false })]
    expect(dueWork(pg, rows, T0 + 11 * MIN)).toEqual({ alert: [], reveal: [], end: false })
  })

  it('an alerted ping still reveals, later by the pause', () => {
    const R = T0 + 10 * MIN
    const pg = game({ pauses: [closed(R - 10 * S, R + 50 * S)] })
    const rows = [ping(1, R + 60 * S, { alerted: true, revealed: false })]
    expect(dueWork(pg, rows, R + 59 * S).reveal).toEqual([])
    expect(dueWork(pg, rows, R + 60 * S).reveal).toEqual([1])
  })

  it('toWall stacks several pauses in order', () => {
    const pg = game({ pauses: [closed(T0 + 10 * MIN, T0 + 11 * MIN), closed(T0 + 20 * MIN, T0 + 22 * MIN)] })
    expect(toWall(pg, T0 + 5 * MIN, T0)).toBe(T0 + 5 * MIN)
    expect(toWall(pg, T0 + 15 * MIN, T0)).toBe(T0 + 16 * MIN)
    expect(toWall(pg, T0 + 30 * MIN, T0)).toBe(T0 + 33 * MIN)
  })
})
