import { describe, expect, it } from 'vitest'
import { BONUS_SEQ_BASE, dueWork, nextReveal, phaseAt, pingTimes } from './clock.js'
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
})

describe('pingTimes', () => {
  it('reveals every ping interval during the chase, never at the end', () => {
    expect(pingTimes(g).map((p) => p.revealAt)).toEqual([10, 15, 20, 25, 30, 35, 40, 45].map((m) => T0 + m * MIN))
  })
  it('alerts 30 s before each reveal', () => {
    expect(pingTimes(g)[0]).toEqual({ seq: 1, alertAt: T0 + 10 * MIN - 30_000, revealAt: T0 + 10 * MIN })
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
      alertAt: T0 + 15 * MIN - 30_000,
      revealAt: T0 + 15 * MIN,
    })
  })

  it('nextReveal is null once there are no more pings', () => {
    expect(nextReveal(g, [], T0 + 49 * MIN)).toBeNull()
  })
})
