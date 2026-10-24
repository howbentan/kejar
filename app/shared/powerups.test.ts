import { describe, expect, it } from 'vitest'
import { arenaAroundPoint } from './arenas.js'
import { iso, MIN, player, pos, T0 } from './fixtures.js'
import { distanceM, pointInPolygon } from './geo.js'
import { activeShield, decoySpot, judgeClaim, pickPowerUp } from './powerups.js'
import { seeded } from './testing.js'
import type { PowerUp, PowerUpKind } from './types.js'

const NOW = T0 + 20 * MIN
const C = { lat: 3.0, lng: 101.0 }
const S1 = { lat: 3.0 + 100 / 111_195, lng: 101.0 }
const arena = arenaAroundPoint(C, 200, [S1])
const aina = player('r1', 'runner')
const ben = player('c1', 'chaser')
const atS1 = pos(S1.lat, S1.lng, NOW - 5_000)

function pu(over: Partial<PowerUp> = {}): PowerUp {
  return {
    id: 'u1',
    game_id: 'g1',
    player_id: 'r1',
    kind: 'decoy',
    station: 1,
    claimed_at: iso(NOW - 5 * MIN),
    used_at: null,
    consumed_at: null,
    ...over,
  }
}

const base = { phase: 'chasing' as const, me: aina, station: 1, arena, myPos: atS1, powerUps: [] as PowerUp[], now: NOW }

describe('judgeClaim', () => {
  it('claim at the station succeeds', () => {
    expect(judgeClaim(base)).toEqual({ ok: true })
  })
  it('claim from 200 m away is rejected as too-far', () => {
    expect(judgeClaim({ ...base, myPos: pos(S1.lat + 200 / 111_195, S1.lng, NOW - 5_000) })).toEqual({
      ok: false,
      reason: 'too-far',
    })
  })
  it('a 40 s old position is rejected as too-far', () => {
    expect(judgeClaim({ ...base, myPos: pos(S1.lat, S1.lng, NOW - 40_000) })).toEqual({ ok: false, reason: 'too-far' })
  })
  it('second claim of the same station by the same player is already-claimed', () => {
    const mine = pu({ claimed_at: iso(NOW - 5 * MIN), used_at: iso(NOW - 4 * MIN) })
    expect(judgeClaim({ ...base, powerUps: [mine] })).toEqual({ ok: false, reason: 'already-claimed' })
  })
  it('another player within 60 s gets locked with the time left', () => {
    const theirs = pu({ player_id: 'r2', claimed_at: iso(NOW - 20_000) })
    expect(judgeClaim({ ...base, powerUps: [theirs] })).toEqual({ ok: false, reason: 'locked', lockedForMs: 40_000 })
  })
  it('marshals and jailed runners cannot claim', () => {
    expect(judgeClaim({ ...base, me: player('m1', 'marshal') })).toEqual({ ok: false, reason: 'cannot-claim' })
    expect(judgeClaim({ ...base, me: { ...aina, jailed: true } })).toEqual({ ok: false, reason: 'cannot-claim' })
  })
  it('a fourth unused power-up is hand-full', () => {
    const hand = [2, 3, 4].map((n) => pu({ id: `u${n}`, station: n }))
    expect(judgeClaim({ ...base, powerUps: hand })).toEqual({ ok: false, reason: 'hand-full' })
  })
  it('only during the chase, and only real stations', () => {
    expect(judgeClaim({ ...base, phase: 'hiding' })).toEqual({ ok: false, reason: 'not-chasing' })
    expect(judgeClaim({ ...base, station: 2 })).toEqual({ ok: false, reason: 'unknown-station' })
    expect(judgeClaim({ ...base, station: null })).toEqual({ ok: false, reason: 'unknown-station' })
  })
  it('chasers can claim too', () => {
    expect(judgeClaim({ ...base, me: ben })).toEqual({ ok: true })
  })
})

describe('pickPowerUp', () => {
  it('only gives runner kinds to runners and chaser kinds to chasers', () => {
    const rng = seeded(5)
    const runner = new Set<PowerUpKind>()
    const chaser = new Set<PowerUpKind>()
    for (let i = 0; i < 1000; i++) {
      runner.add(pickPowerUp('runner', rng))
      chaser.add(pickPowerUp('chaser', rng))
    }
    expect([...runner].sort()).toEqual(['cloak', 'decoy', 'shield'])
    expect([...chaser].sort()).toEqual(['flare', 'focus'])
  })
})

describe('decoySpot', () => {
  it('moves the position 120–180 m', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const d = distanceM(C, decoySpot(C, arena.boundary, seed))
      expect(d).toBeGreaterThanOrEqual(119)
      expect(d).toBeLessThanOrEqual(181)
    }
  })
  it('stays inside the boundary when possible', () => {
    const nearEdge = { lat: 3.0 + 180 / 111_195, lng: 101.0 }
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(pointInPolygon(decoySpot(nearEdge, arena.boundary, seed), arena.boundary)).toBe(true)
    }
  })
})

describe('activeShield', () => {
  it('is active once used, until consumed or 10 minutes pass', () => {
    const shield = pu({ kind: 'shield', used_at: iso(NOW - 5 * MIN) })
    expect(activeShield([shield], 'r1', NOW)).toEqual(shield)
    expect(activeShield([shield], 'r1', NOW + 6 * MIN)).toBeNull()
    expect(activeShield([{ ...shield, consumed_at: iso(NOW) }], 'r1', NOW)).toBeNull()
    expect(activeShield([{ ...shield, used_at: null }], 'r1', NOW)).toBeNull()
    expect(activeShield([shield], 'r2', NOW)).toBeNull()
  })
})
