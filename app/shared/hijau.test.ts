import { describe, expect, it } from 'vitest'
import { iso, player, T0 } from './fixtures.js'
import { HIJAU_MS, hijauCounts, hijauStartsAt, hijauTargets, PENJARA_LOCK_MS, penjaraLockedLine, penjaraLockLeft } from './hijau.js'
import type { HijauRun } from './types.js'

const S = 1000

describe('Mak Kau Hijau timing (new power-ups §6.3)', () => {
  it('holds 20 s', () => {
    expect(HIJAU_MS).toBe(20_000)
  })

  it('with no windows it starts at the claim', () => {
    expect(hijauStartsAt(T0, [])).toBe(T0)
  })

  it('a window open at the claim pushes it to that reveal', () => {
    expect(hijauStartsAt(T0, [{ alertAt: T0 - 10 * S, revealAt: T0 + 35 * S }])).toBe(T0 + 35 * S)
  })

  it('a window opening 10 s after the claim pushes it to that reveal', () => {
    expect(hijauStartsAt(T0, [{ alertAt: T0 + 10 * S, revealAt: T0 + 55 * S }])).toBe(T0 + 55 * S)
  })

  it('back-to-back windows chain', () => {
    const windows = [
      { alertAt: T0 + 50 * S, revealAt: T0 + 100 * S },
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

  it('counts with 15 s or more left when the push went out', () => {
    expect(hijauCounts(run(T0))).toBe(true)
    expect(hijauCounts(run(T0 + 5 * S))).toBe(true)
  })

  it('is void with under 15 s left, or no push at all', () => {
    expect(hijauCounts(run(T0 + 5 * S + 1))).toBe(false)
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

describe('Penjara locked after Mak Kau Hijau (owner, 2026-11-13)', () => {
  const run = (over: Partial<HijauRun> = {}): HijauRun => ({
    claimedBy: 'c1',
    claimedAt: iso(T0),
    startsAt: iso(T0),
    deadline: iso(T0 + HIJAU_MS),
    sentAt: iso(T0),
    settledAt: null,
    tapped: [],
    targets: [],
    ...over,
  })
  const end = T0 + HIJAU_MS

  it('holds 3 minutes', () => {
    expect(PENJARA_LOCK_MS).toBe(180_000)
  })

  it('a settled run that counted locks Penjara until lockedUntil', () => {
    const g = { hijau: run({ settledAt: iso(end), lockedUntil: iso(end + PENJARA_LOCK_MS) }), paused_at: null }
    expect(penjaraLockLeft(g, end)).toBe(PENJARA_LOCK_MS)
    expect(penjaraLockLeft(g, end + 46 * S)).toBe(134 * S)
    expect(penjaraLockLeft(g, end + PENJARA_LOCK_MS)).toBe(0)
  })

  it('a void run (no lockedUntil) locks nothing, and no run locks nothing', () => {
    expect(penjaraLockLeft({ hijau: run({ settledAt: iso(end), lockedUntil: null }), paused_at: null }, end + S)).toBe(0)
    expect(penjaraLockLeft({ hijau: null, paused_at: null }, end)).toBe(0)
  })

  it('past the deadline but not yet settled: locked if it will count, open if it is void', () => {
    expect(penjaraLockLeft({ hijau: run(), paused_at: null }, end + 10 * S)).toBe(PENJARA_LOCK_MS - 10 * S)
    expect(penjaraLockLeft({ hijau: run({ sentAt: null }), paused_at: null }, end + 10 * S)).toBe(0)
    expect(penjaraLockLeft({ hijau: run(), paused_at: null }, end - S)).toBe(0)
  })

  it('freezes while paused', () => {
    const g = { hijau: run({ settledAt: iso(end), lockedUntil: iso(end + PENJARA_LOCK_MS) }), paused_at: iso(end + 60 * S) }
    expect(penjaraLockLeft(g, end + 10 * 60 * S)).toBe(120 * S)
  })

  it('reads as the time left, rounded up', () => {
    expect(penjaraLockedLine(134 * S)).toBe('Penjara is locked for 2:14.')
    expect(penjaraLockedLine(133_100)).toBe('Penjara is locked for 2:14.')
    expect(penjaraLockedLine(5 * S)).toBe('Penjara is locked for 0:05.')
  })
})
