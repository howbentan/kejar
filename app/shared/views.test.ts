import { describe, expect, it } from 'vitest'
import { event, game, MIN, ping, player, pos, T0 } from './fixtures.js'
import { distanceM } from './geo.js'
import type { Player, Position, PowerUp } from './types.js'
import { BONUS_SEQ_BASE, SCHEDULED_ALERT_LEAD_MS } from './clock.js'
import { viewFor } from './views.js'

const g = game()
const NOW = T0 + 16 * MIN // chase started at +5; pings revealed at +10 and +15
const pings = [ping(1, T0 + 10 * MIN), ping(2, T0 + 15 * MIN)]

const chaser = player('c1', 'chaser', { name: 'Ben' })
const aina = player('r1', 'runner', { name: 'Aina', tag_id: 7 })
const hafiz = player('r2', 'runner', { name: 'Hafiz', tag_id: 3 })
const wei = player('r3', 'runner', { name: 'Wei', tag_id: 14 })
const siti = player('m1', 'marshal', { name: 'Siti' })
const players = [chaser, aina, hafiz, wei, siti]

const A = { lat: 3.002, lng: 101.002 }
const B = { lat: 3.004, lng: 101.004 }
const positions: Record<string, Position[]> = {
  c1: [pos(3.005, 101.005, NOW - 5_000)],
  r1: [pos(A.lat, A.lng, T0 + 14.9 * MIN), pos(B.lat, B.lng, T0 + 15.5 * MIN)],
  r2: [pos(3.003, 101.003, T0 + 9 * MIN)],
  m1: [pos(3.006, 101.006, NOW - 2_000)],
}

const view = (me: Player, over: Partial<Parameters<typeof viewFor>[0]> = {}) =>
  viewFor({ game: g, me, players, positions, pings, events: [], now: NOW, results: null, powerUps: [], ...over })

describe('chaser view', () => {
  it('chaser sees runners fuzzed at the last reveal, not live', () => {
    const dot = view(chaser).dots.find((d) => d.id === 'r1')!
    expect(dot.kind).toBe('runner')
    expect(dot.fuzzy).toBe(true)
    expect(dot.label).toBe('#07')
    expect(distanceM(dot, A)).toBeLessThanOrEqual(15)
    expect(distanceM(dot, B)).toBeGreaterThan(100)
  })

  it('missed check-in shows last known position, flagged', () => {
    const dot = view(chaser).dots.find((d) => d.id === 'r2')!
    expect(dot.missed).toBe(true)
    expect(distanceM(dot, { lat: 3.003, lng: 101.003 })).toBeLessThanOrEqual(15)
  })

  it('runner with no position at reveal is listed as never checked in', () => {
    const v = view(chaser)
    expect(v.dots.find((d) => d.id === 'r3')).toBeUndefined()
    expect(v.feed.map((f) => f.text)).toContain('#14 never checked in')
  })

  it('shows no runner dots before the first reveal', () => {
    const v = view(chaser, { pings: [], now: T0 + 6 * MIN })
    expect(v.dots.filter((d) => d.kind === 'runner')).toEqual([])
  })

  it('never shows jailed runners', () => {
    const jailed = { ...aina, jailed: true }
    const v = view(chaser, { players: [chaser, jailed, hafiz, wei, siti] })
    expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
  })
})

describe('runner view', () => {
  it('runner sees teammates but never chasers', () => {
    const v = view(aina)
    expect(v.dots.find((d) => d.id === 'r1')?.kind).toBe('me')
    expect(v.dots.find((d) => d.id === 'r2')?.kind).toBe('teammate')
    expect(v.dots.some((d) => d.kind === 'chaser')).toBe(false)
  })

  it('chaserNearby only when a fresh chaser fix is within 100 m', () => {
    const me = pos(3.0, 101.0, NOW - 5_000)
    const at = (dLat: number, ageMs: number) => ({ c1: [pos(3.0 + dLat, 101.0, NOW - ageMs)], r1: [me] })
    expect(view(aina, { positions: at(0.0008, 5_000) }).chaserNearby).toBe(true) // ~89 m, fresh
    expect(view(aina, { positions: at(0.0008, 2 * MIN) }).chaserNearby).toBe(false) // stale
    expect(view(aina, { positions: at(0.0011, 5_000) }).chaserNearby).toBe(false) // ~122 m
  })

  it('is never true for a chaser', () => {
    expect(view(chaser).chaserNearby).toBe(false)
  })
})

describe('marshal and jailed views', () => {
  it('marshal sees everyone live', () => {
    const v = view(siti)
    expect(v.dots.find((d) => d.id === 'r1')).toMatchObject({ kind: 'runner', lat: B.lat, lng: B.lng })
    expect(v.dots.find((d) => d.id === 'c1')?.kind).toBe('chaser')
  })

  it('jailed runner sees everyone delayed by the spectator delay', () => {
    const jailed = { ...hafiz, jailed: true }
    const ps = { ...positions, c1: [pos(3.001, 101.001, NOW - 3 * MIN), pos(3.009, 101.009, NOW - 1 * MIN)] }
    const v = view(jailed, { players: [chaser, aina, jailed, wei, siti], positions: ps })
    expect(v.dots.find((d) => d.id === 'c1')).toMatchObject({ lat: 3.001, lng: 101.001 })
  })
})

describe('timers and counts', () => {
  it('gives the next alert and reveal during the chase', () => {
    const v = view(aina)
    expect(v.nextRevealAt).toBe(T0 + 20 * MIN)
    expect(v.nextAlertAt).toBe(T0 + 20 * MIN - SCHEDULED_ALERT_LEAD_MS)
  })
  it('counts free and jailed runners', () => {
    const v = view(chaser, { players: [chaser, { ...aina, jailed: true }, hafiz, wei, siti] })
    expect(v.counts).toEqual({ runnersFree: 2, runnersJailed: 1, chasers: 1 })
  })
})

describe('end of game and jail details', () => {
  it('shares the roster once the game has ended so results can show names', () => {
    const v = view(aina, { game: game({ ended_at: new Date(NOW).toISOString() }) })
    expect(v.roster.map((r) => r.name)).toContain('Ben')
  })
  it('hides the roster from players mid-game', () => {
    expect(view(aina).roster).toEqual([])
  })
  it('tells a jailed runner who caught them', () => {
    const jailed = { ...aina, jailed: true, caught_by: 'c1' }
    expect(view(jailed, { players: [chaser, jailed, hafiz, wei, siti] }).caughtBy).toBe('Ben')
    expect(view(aina).caughtBy).toBeNull()
  })
})

describe('ping moment', () => {
  it('tells every player when the last ping went out', () => {
    expect(view(aina).lastRevealAt).toBe(T0 + 15 * MIN)
    expect(view(chaser).lastRevealAt).toBe(T0 + 15 * MIN)
  })
  it('is null before the first ping', () => {
    expect(view(aina, { pings: [] }).lastRevealAt).toBeNull()
  })
})

describe('feed wording', () => {
  const feedOf = (events: Parameters<typeof viewFor>[0]['events']) => view(siti, { events }).feed.map((f) => f.text)
  it('uses the singular for one runner', () => {
    expect(
      feedOf([
        event('ping', T0 + 10 * MIN, { data: { seen: 1 } }),
        event('jailbreak', T0 + 11 * MIN, { actor_id: 'r3', data: { freed: 1 } }),
      ]),
    ).toEqual(['Wei broke 1 runner out of jail', 'Ping — 1 runner seen'])
  })
  it('announces pauses and resumes', () => {
    expect(feedOf([event('paused', T0 + 10 * MIN), event('resumed', T0 + 11 * MIN)])).toEqual([
      'Game resumed',
      'Game paused by a marshal',
    ])
  })
  it('uses the plural otherwise', () => {
    expect(feedOf([event('ping', T0 + 10 * MIN, { data: { seen: 0 } })])).toEqual(['Ping — 0 runners seen'])
  })
})

describe('power-up effects', () => {
  const used = (id: string, playerId: string, kind: PowerUp['kind'], usedAt: number): PowerUp => ({
    id,
    game_id: 'g1',
    player_id: playerId,
    kind,
    station: 1,
    claimed_at: new Date(usedAt - MIN).toISOString(),
    used_at: new Date(usedAt).toISOString(),
    consumed_at: null,
  })

  it('cloaked runner is missing from the next reveal only', () => {
    const cloak = used('u1', 'r1', 'cloak', T0 + 14 * MIN)
    expect(view(chaser, { powerUps: [cloak] }).dots.find((d) => d.id === 'r1')).toBeUndefined()
    const later = [...pings, ping(3, T0 + 20 * MIN)]
    const ps = { ...positions, r1: [...positions.r1, pos(B.lat, B.lng, T0 + 19 * MIN)] }
    expect(
      view(chaser, { powerUps: [cloak], pings: later, positions: ps, now: T0 + 21 * MIN }).dots.find((d) => d.id === 'r1'),
    ).toBeDefined()
  })

  it('decoyed runner appears 120–180 m from their real spot at the next reveal', () => {
    const dot = view(chaser, { powerUps: [used('u1', 'r1', 'decoy', T0 + 14 * MIN)] }).dots.find((d) => d.id === 'r1')!
    const d = distanceM(dot, A)
    expect(d).toBeGreaterThanOrEqual(119)
    expect(d).toBeLessThanOrEqual(181)
  })

  it('focus shows nearby runners exactly at the next reveal', () => {
    const ps = { ...positions, c1: [pos(A.lat + 0.0005, A.lng, T0 + 14.8 * MIN)] } // ~56 m from Aina
    const dot = view(chaser, { positions: ps, powerUps: [used('u1', 'c1', 'focus', T0 + 14 * MIN)] }).dots.find(
      (d) => d.id === 'r1',
    )!
    expect(dot).toMatchObject({ lat: A.lat, lng: A.lng, exact: true })
    expect(dot.fuzzy).toBeUndefined()
  })

  it('a flare reveal between scheduled pings becomes the last reveal', () => {
    const flare = ping(BONUS_SEQ_BASE, T0 + 16.5 * MIN)
    const v = view(chaser, { pings: [...pings, flare], now: T0 + 17 * MIN })
    expect(v.lastRevealAt).toBe(T0 + 16.5 * MIN)
    const dot = v.dots.find((d) => d.id === 'r1')!
    expect(distanceM(dot, B)).toBeLessThanOrEqual(15) // Aina's spot at 15.5 min, not the 15-min reveal
  })

  it('a scheduled reveal after a flare is the last reveal (ordered by time, not number)', () => {
    const flare = ping(BONUS_SEQ_BASE, T0 + 16.5 * MIN)
    const v = view(chaser, { pings: [...pings, flare, ping(3, T0 + 20 * MIN)], now: T0 + 21 * MIN })
    expect(v.lastRevealAt).toBe(T0 + 20 * MIN)
  })

  it('hand lists my unused power-ups only, and shows an active shield', () => {
    const mine = { ...used('u1', 'r1', 'decoy', T0), used_at: null }
    const v = view(aina, {
      powerUps: [mine, used('u2', 'r1', 'shield', T0 + 15 * MIN), { ...used('u3', 'c1', 'flare', T0), used_at: null }],
    })
    expect(v.hand.map((u) => u.id)).toEqual(['u1'])
    expect(v.shieldActive).toBe(true)
  })

  it('lists the stations with their numbers', () => {
    const S = { lat: 3.004, lng: 101.004 }
    const v = view(aina, { game: game({ arena: { ...g.arena, stations: [S] } }) })
    expect(v.stations).toEqual([{ n: 1, lat: S.lat, lng: S.lng }])
  })

  it('feed announces pickups and chaser power-ups but not runner ones', () => {
    const feed = view(siti, {
      events: [
        event('powerup', T0 + 10 * MIN, { actor_id: 'r1' }),
        event('used', T0 + 11 * MIN, { actor_id: 'c1', data: { kind: 'flare' } }),
        event('used', T0 + 12 * MIN, { actor_id: 'c1', data: { kind: 'focus' } }),
        event('used', T0 + 13 * MIN, { actor_id: 'r1', data: { kind: 'cloak' } }),
        event('shielded', T0 + 14 * MIN, { target_id: 'r1' }),
      ],
    }).feed.map((f) => f.text)
    expect(feed).toEqual([
      '#07 was shielded!',
      'A chaser used Focus',
      'Flare! Ping in 30 s',
      'Aina picked up a power-up',
    ])
  })
})

describe('power-up secrecy', () => {
  const used = (playerId: string, kind: PowerUp['kind'], usedAt: number): PowerUp => ({
    id: `${playerId}-${kind}`,
    game_id: 'g1',
    player_id: playerId,
    kind,
    station: 1,
    claimed_at: new Date(usedAt - MIN).toISOString(),
    used_at: new Date(usedAt).toISOString(),
    consumed_at: null,
  })

  it('a cloaked runner looks exactly like a runner who never checked in', () => {
    const v = view(chaser, { powerUps: [used('r1', 'cloak', T0 + 14 * MIN)] })
    expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
    expect(v.feed.map((f) => f.text)).toContain('#07 never checked in')
  })

  it('a decoyed runner inside a Focus is shown exactly at the decoy spot, like the others', () => {
    const ps = { ...positions, c1: [pos(A.lat + 0.0005, A.lng, T0 + 14.8 * MIN)] }
    const dot = view(chaser, {
      positions: ps,
      powerUps: [used('r1', 'decoy', T0 + 14 * MIN), used('c1', 'focus', T0 + 14 * MIN)],
    }).dots.find((d) => d.id === 'r1')!
    expect(dot.exact).toBe(true)
    expect(dot.fuzzy).toBeUndefined()
    expect(distanceM(dot, A)).toBeGreaterThanOrEqual(119)
  })
})
