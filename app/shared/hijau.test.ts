import { describe, expect, it } from 'vitest'
import { iso, player, T0 } from './fixtures.js'
import { HIJAU_MS, hijauCounts, hijauStartsAt, hijauTargets } from './hijau.js'
import type { HijauRun } from './types.js'

const S = 1000

describe('Mak Kau Hijau timing (new power-ups §6.3)', () => {
  it('holds 45 s', () => {
    expect(HIJAU_MS).toBe(45_000)
  })

  it('with no windows it starts at the claim', () => {
    expect(hijauStartsAt(T0, [])).toBe(T0)
  })

  it('a window open at the claim pushes it to that reveal', () => {
    expect(hijauStartsAt(T0, [{ alertAt: T0 - 10 * S, revealAt: T0 + 35 * S }])).toBe(T0 + 35 * S)
  })

  it('a window opening 20 s after the claim pushes it to that reveal', () => {
    expect(hijauStartsAt(T0, [{ alertAt: T0 + 20 * S, revealAt: T0 + 65 * S }])).toBe(T0 + 65 * S)
  })

  it('back-to-back windows chain', () => {
    const windows = [
      { alertAt: T0 + 70 * S, revealAt: T0 + 100 * S },
      { alertAt: T0 - 5 * S, revealAt: T0 + 40 * S },
    ]
    expect(hijauStartsAt(T0, windows)).toBe(T0 + 100 * S)
  })

  it('a window just touching either end does not move it', () => {
    expect(hijauStartsAt(T0, [{ alertAt: T0 - 45 * S, revealAt: T0 }, { alertAt: T0 + HIJAU_MS, revealAt: T0 + 90 * S }])).toBe(T0)
  })
})

describe('Mak Kau Hijau late-push rule', () => {
  const run = (sentAt: number | null): HijauRun => ({
    claimedBy: 'c1',
    claimedAt: iso(T0),
    startsAt: iso(T0),
    deadline: iso(T0 + HIJAU_MS),
    sentAt: sentAt === null ? null : iso(sentAt),
    settledAt: null,
    tapped: [],
    targets: [],
  })

  it('counts with 25 s or more left when the push went out', () => {
    expect(hijauCounts(run(T0))).toBe(true)
    expect(hijauCounts(run(T0 + 20 * S))).toBe(true)
  })

  it('is void with under 25 s left, or no push at all', () => {
    expect(hijauCounts(run(T0 + 20 * S + 1))).toBe(false)
    expect(hijauCounts(run(null))).toBe(false)
  })
})

describe('Mak Kau Hijau targets', () => {
  it('free runners only: not jailed, Luar Garisan, removed, under house arrest, or not a runner', () => {
    const arrest = { firedAt: iso(T0), route: 'hijau' as const, by: null, center: null, startedAt: null, ringId: 'u1', catchEventId: null }
    const players = [
      player('a', 'runner'),
      player('b', 'runner', { jailed: true }),
      player('c', 'runner', { disqualified_at: iso(T0) }),
      player('d', 'runner', { removed_at: iso(T0) }),
      player('e', 'runner', { arrest }),
      player('f', 'chaser'),
      player('g', 'marshal'),
    ]
    expect(hijauTargets(players).map((p) => p.id)).toEqual(['a'])
  })
})
