import { describe, expect, it } from 'vitest'
import { arenaAroundPoint } from './arenas.js'
import { iso, MIN, ping, player, pos, T0 } from './fixtures.js'
import { circlePolygon, distanceM, offset, pointInPolygon } from './geo.js'
import { buildPlayArea, inPlayArea } from './playArea.js'
import { activeShield, comboReady, decoySpot, flareBlocked, frozenForMs, judgeBomohClaim, judgeClaim, runningEffect, shieldArmedAt, slotBusy } from './powerups.js'
import { BONUS_SEQ_BASE } from './clock.js'
import type { Ping, PowerUp } from './types.js'

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
    sealed: false,
    taken_at: null, offer: null, twin_of: null, spot: null,
    ...over,
  }
}

const base = { phase: 'chasing' as const, me: aina, station: 1, arena, myPos: atS1, powerUps: [] as PowerUp[], pings: [] as Ping[], now: NOW }

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
  it('a power-up still in the slot makes the slot full', () => {
    const held = pu({ id: 'h1', station: 9, kind: 'shield' })
    expect(judgeClaim({ ...base, powerUps: [held] })).toEqual({ ok: false, reason: 'hand-full', busyKind: 'shield', busyRunning: false })
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

describe('judgeBomohClaim', () => {
  const dropped = { lat: S1.lat, lng: S1.lng, claimedBy: null, claimedAt: null }
  const bombase = { phase: 'chasing' as const, me: ben, stash: dropped, myPos: atS1, now: NOW }

  it('a chaser in reach of a dropped, unclaimed stash can claim it', () => {
    expect(judgeBomohClaim(bombase)).toEqual({ ok: true })
  })
  it('only during the chase', () => {
    expect(judgeBomohClaim({ ...bombase, phase: 'hiding' })).toEqual({ ok: false, reason: 'not-chasing' })
  })
  it('runners and marshals cannot claim Bomoh', () => {
    expect(judgeBomohClaim({ ...bombase, me: aina })).toEqual({ ok: false, reason: 'cannot-claim' })
    expect(judgeBomohClaim({ ...bombase, me: player('m1', 'marshal') })).toEqual({ ok: false, reason: 'cannot-claim' })
  })
  it('nothing to find when the stash is missing, not yet dropped, or already claimed', () => {
    expect(judgeBomohClaim({ ...bombase, stash: null })).toEqual({ ok: false, reason: 'no-stash' })
    expect(judgeBomohClaim({ ...bombase, stash: undefined })).toEqual({ ok: false, reason: 'no-stash' })
    expect(judgeBomohClaim({ ...bombase, stash: { ...dropped, lat: null, lng: null } })).toEqual({ ok: false, reason: 'no-stash' })
    expect(judgeBomohClaim({ ...bombase, stash: { ...dropped, claimedBy: 'c2', claimedAt: iso(NOW - MIN) } })).toEqual({
      ok: false,
      reason: 'no-stash',
    })
  })
  it('too far from the dropped spot, or a stale fix, is too-far', () => {
    expect(judgeBomohClaim({ ...bombase, myPos: pos(S1.lat + 200 / 111_195, S1.lng, NOW - 5_000) })).toEqual({ ok: false, reason: 'too-far' })
    expect(judgeBomohClaim({ ...bombase, myPos: pos(S1.lat, S1.lng, NOW - 40_000) })).toEqual({ ok: false, reason: 'too-far' })
    expect(judgeBomohClaim({ ...bombase, myPos: null })).toEqual({ ok: false, reason: 'too-far' })
  })
  it('never checks the hand: a chaser holding a power-up can still claim', () => {
    // No powerUps/pings input exists; Bomoh never occupies a slot.
    expect(judgeBomohClaim(bombase)).toEqual({ ok: true })
  })
})

describe('slotBusy', () => {
  it('a card that was taken (Toyol / Ah Long) no longer fills the slot', () => {
    expect(slotBusy([pu({ kind: 'cloak', taken_at: iso(NOW - 1_000) })], 'r1', [], NOW)).toBeNull()
  })
  it('a card row from before migration 0011 (no taken_at at all) still fills the slot', () => {
    const { taken_at: _, ...old } = pu({ kind: 'cloak' })
    expect(slotBusy([old as PowerUp], 'r1', [], NOW)).toEqual({ kind: 'cloak', running: false })
  })
  it('Toyol and Ah Long are done the moment they are used', () => {
    expect(slotBusy([pu({ kind: 'toyol', used_at: iso(NOW - 1_000) })], 'r1', [], NOW)).toBeNull()
    expect(slotBusy([pu({ kind: 'along', used_at: iso(NOW - 1_000) })], 'c1', [], NOW)).toBeNull()
  })
  it('an unused Toyol still fills the slot', () => {
    expect(slotBusy([pu({ kind: 'toyol' })], 'r1', [], NOW)).toEqual({ kind: 'toyol', running: false })
  })

  const T = NOW - 60_000
  const used = (kind: PowerUp['kind'], over: Partial<PowerUp> = {}) => pu({ kind, used_at: iso(T), ...over })
  const revealed = (seq: number, at: number, alertAt = at - 30_000): Ping => ({ ...ping(seq, at), alert_at: iso(alertAt), revealed: true })

  it('an unused card is busy, not running', () => {
    expect(slotBusy([pu({ kind: 'cloak' })], 'r1', [], NOW)).toEqual({ kind: 'cloak', running: false })
  })
  it('Ponteng is running until the next reveal after it was used', () => {
    expect(slotBusy([used('cloak')], 'r1', [], NOW)).toEqual({ kind: 'cloak', running: true })
    expect(slotBusy([used('cloak')], 'r1', [revealed(3, T + 5_000)], NOW)).toBeNull()
  })
  it('Durian is running until it blocks a catch or 10 minutes pass', () => {
    expect(slotBusy([used('shield')], 'r1', [], NOW)).toEqual({ kind: 'shield', running: true })
    expect(slotBusy([used('shield', { consumed_at: iso(T + 1_000) })], 'r1', [], NOW)).toBeNull()
    expect(slotBusy([used('shield', { used_at: iso(NOW - 11 * MIN) })], 'r1', [], NOW)).toBeNull()
  })
  it("Mat Rempit is running until its own surprise ping is revealed, even if a scheduled one came first", () => {
    const flare = pu({ player_id: 'c1', kind: 'flare', used_at: iso(T) })
    const scheduled = revealed(3, T + 10_000)
    expect(slotBusy([flare], 'c1', [scheduled], NOW)).toEqual({ kind: 'flare', running: true })
    expect(slotBusy([flare], 'c1', [scheduled, revealed(BONUS_SEQ_BASE, T + 30_000, T)], NOW)).toBeNull()
  })
  it("someone else's card doesn't fill my slot", () => {
    expect(slotBusy([pu({ player_id: 'r2' })], 'r1', [], NOW)).toBeNull()
  })
})

describe('decoySpot', () => {
  it('moves the position 120–180 m', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const d = distanceM(C, decoySpot(C, arena, seed))
      expect(d).toBeGreaterThanOrEqual(119)
      expect(d).toBeLessThanOrEqual(181)
    }
  })
  it('stays inside the boundary when possible', () => {
    const nearEdge = { lat: 3.0 + 180 / 111_195, lng: 101.0 }
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(pointInPolygon(decoySpot(nearEdge, arena, seed), arena.boundary)).toBe(true)
    }
  })
  it('never lands in the lake', () => {
    // A 120 m wide lake in the middle: several of the 12 candidate spots land in it.
    const lake = circlePolygon(C, 60, 24)
    const area = buildPlayArea({ outline: arena.boundary, water: [lake], circle: null })
    const start = offset(C, 100, Math.PI)
    for (let i = 0; i < 50; i++) {
      const spot = decoySpot(start, area, `s${i}`)
      expect(inPlayArea(spot, area)).toBe(true)
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

describe('flareBlocked', () => {
  const bonus = (revealAt: number, revealed: boolean): Ping => ({ ...ping(BONUS_SEQ_BASE, revealAt), revealed })
  it('blocks while another surprise ping is still on its way', () => {
    expect(flareBlocked([bonus(NOW + 10_000, false)], NOW)).toEqual({ reason: 'flare-pending', readyInMs: 10_000 + 3 * MIN })
  })
  it('blocks for 3 minutes after a surprise ping is revealed', () => {
    expect(flareBlocked([bonus(NOW - 60_000, true)], NOW)).toEqual({ reason: 'flare-cooldown', readyInMs: 120_000 })
  })
  it('is clear once 3 minutes have passed, or with no surprise pings', () => {
    expect(flareBlocked([bonus(NOW - 3 * MIN, true)], NOW)).toBeNull()
    expect(flareBlocked([], NOW)).toBeNull()
  })
})

describe('new-card rules', () => {
  const shield = (over: Partial<PowerUp> = {}) => pu({ kind: 'shield', ...over })
  const used = (kind: PowerUp['kind'], over: Partial<PowerUp> = {}) => pu({ kind, used_at: iso(NOW - 1_000), ...over })

  it('a frozen chaser cannot claim, with the time left', () => {
    const v = judgeClaim({ ...base, me: { ...ben, frozen_until: iso(NOW + 90_000) } })
    expect(v).toEqual({ ok: false, reason: 'frozen', frozenForMs: 90_000 })
  })
  it('frozenForMs is 0 when not frozen or expired', () => {
    expect(frozenForMs({}, NOW)).toBe(0)
    expect(frozenForMs({ frozen_until: null }, NOW)).toBe(0)
    expect(frozenForMs({ frozen_until: iso(NOW - 1) }, NOW)).toBe(0)
    expect(frozenForMs({ frozen_until: iso(NOW + 5_000) }, NOW)).toBe(5_000)
  })
  it('a frozen chaser cannot scan Bomoh either', () => {
    const stash = { lat: S1.lat, lng: S1.lng, claimedBy: null, claimedAt: null } as never
    const v = judgeBomohClaim({ phase: 'chasing', me: { ...ben, frozen_until: iso(NOW + 30_000) }, stash, myPos: atS1, now: NOW })
    expect(v).toEqual({ ok: false, reason: 'frozen', frozenForMs: 30_000 })
  })
  it('a twin shield arms when its partner blocks, and runs its own 10 minutes', () => {
    const first = shield({ used_at: iso(NOW - 2 * MIN), consumed_at: iso(NOW - MIN) })
    const twin = shield({ id: 't', twin_of: first.id, used_at: iso(NOW - 2 * MIN) })
    expect(shieldArmedAt(twin, [first, twin])).toBe(NOW - MIN)
    expect(activeShield([first, twin], 'r1', NOW + 8 * MIN)?.id).toBe('t')
    expect(activeShield([first, twin], 'r1', NOW + 10 * MIN)).toBeNull()
  })
  it('a twin shield arms when its partner runs out unused', () => {
    const first = shield({ used_at: iso(NOW - 10 * MIN) })
    const twin = shield({ id: 't', twin_of: first.id, used_at: iso(NOW - 10 * MIN) })
    expect(shieldArmedAt(twin, [first, twin])).toBe(NOW)
  })
  it('a waiting twin is not active while its partner is, but keeps the slot busy', () => {
    const first = shield({ used_at: iso(NOW - MIN) })
    const twin = shield({ id: 't', twin_of: first.id, used_at: iso(NOW - MIN) })
    expect(activeShield([first, twin], 'r1', NOW)?.id).toBe(first.id)
    expect(slotBusy([twin], 'r1', [], NOW)).toEqual({ kind: 'shield', running: true })
  })
  it('shieldArmedAt is null for an unused shield and used_at for a plain one', () => {
    expect(shieldArmedAt(shield(), [])).toBeNull()
    expect(shieldArmedAt(shield({ used_at: iso(NOW - MIN) }), [])).toBe(NOW - MIN)
  })
  it('a used combo or cheese frees the slot, an unused one holds it', () => {
    expect(slotBusy([used('combo')], 'r1', [], NOW)).toBeNull()
    expect(slotBusy([used('cheese')], 'r1', [], NOW)).toBeNull()
    expect(slotBusy([pu({ kind: 'combo' })], 'r1', [], NOW)).toEqual({ kind: 'combo', running: false })
  })
  it('a used toll keeps the slot until the next reveal', () => {
    expect(slotBusy([used('toll', { player_id: 'c1' })], 'c1', [], NOW)).toEqual({ kind: 'toll', running: true })
  })
  it('comboReady is true for a used, unconsumed, untaken combo only', () => {
    expect(comboReady([used('combo')], 'r1')).toBe(true)
    expect(comboReady([pu({ kind: 'combo' })], 'r1')).toBe(false)
    expect(comboReady([used('combo', { consumed_at: iso(NOW) })], 'r1')).toBe(false)
    expect(comboReady([used('combo', { taken_at: iso(NOW) })], 'r1')).toBe(false)
    expect(comboReady([used('combo')], 'r2')).toBe(false)
  })
  it('runningEffect names only used cards still running', () => {
    expect(runningEffect([pu({ kind: 'cloak' })], 'r1', [], NOW)).toBeNull()
    expect(runningEffect([used('cloak')], 'r1', [], NOW)).toBe('cloak')
    expect(runningEffect([used('combo')], 'r1', [], NOW)).toBeNull()
  })
})
