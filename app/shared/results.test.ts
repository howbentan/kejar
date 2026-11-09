import { describe, expect, it } from 'vitest'
import { event, game, iso, MIN, player, T0 } from './fixtures.js'
import { computeResults } from './results.js'

// Chase starts at T0+5; game ends at T0+50.
const g = game({ ended_at: iso(T0 + 50 * MIN) })
const ben = player('c1', 'chaser', { name: 'Ben' })
const lee = player('c2', 'chaser', { name: 'Lee' })

describe('computeResults', () => {
  it('runners win when any runner is free at the end', () => {
    const r = computeResults(g, [ben, player('r1', 'runner'), player('r2', 'runner', { jailed: true })], [])
    expect(r.winner).toBe('runners')
    expect(r.survivors).toEqual(['r1'])
  })

  it('chasers win when all are caught', () => {
    const r = computeResults(g, [ben, player('r1', 'runner', { jailed: true })], [])
    expect(r.winner).toBe('chasers')
    expect(r.survivors).toEqual([])
  })

  it("an auto-jailed runner's survival ends at the auto-jail, and it isn't a catch", () => {
    const players = [ben, player('r1', 'runner', { jailed: true }), player('r2', 'runner', { jailed: true })]
    const events = [
      event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r2' }),
      event('auto-jailed', T0 + 15 * MIN, { target_id: 'r1' }),
    ]
    const r = computeResults(g, players, events)
    expect(r.longestSurvivor).toEqual({ id: 'r1', ms: 10 * MIN })
    expect(r.mostCatches).toEqual({ id: 'c1', count: 1 })
  })

  it('an auto-jail a marshal undid does not end survival', () => {
    const players = [ben, player('r1', 'runner'), player('r2', 'runner', { jailed: true })]
    const events = [
      event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r2' }),
      event('auto-jailed', T0 + 15 * MIN, { target_id: 'r1' }),
      event('auto-jail-undone', T0 + 16 * MIN, { target_id: 'r1', data: { eventId: 'aj1' } }),
    ]
    events[1].id = 'aj1'
    expect(computeResults(g, players, events).longestSurvivor).toEqual({ id: 'r1', ms: 45 * MIN })
  })

  it('undoing a later auto-jail does not cancel an earlier real one', () => {
    const players = [ben, player('r1', 'runner'), player('r2', 'runner', { jailed: true })]
    const a = event('auto-jailed', T0 + 15 * MIN, { target_id: 'r1' })
    const b = event('auto-jailed', T0 + 27 * MIN, { target_id: 'r1' })
    const events = [
      event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r2' }),
      a,
      b,
      event('auto-jail-undone', T0 + 28 * MIN, { target_id: 'r1', data: { eventId: b.id } }),
    ]
    expect(computeResults(g, players, events).longestSurvivor).toEqual({ id: 'r1', ms: 10 * MIN })
  })

  it('an auto-jail alone never counts for Most catches', () => {
    const r = computeResults(g, [ben, player('r1', 'runner', { jailed: true })], [event('auto-jailed', T0 + 15 * MIN, { target_id: 'r1' })])
    expect(r.mostCatches).toBeNull()
  })

  it('awards pick longest survivor, most catches, jailbreak hero', () => {
    const players = [ben, lee, player('r1', 'runner', { jailed: true }), player('r2', 'runner', { jailed: true }), player('r3', 'runner')]
    const events = [
      event('caught', T0 + 10 * MIN, { actor_id: 'c1', target_id: 'r1' }),
      event('caught', T0 + 20 * MIN, { actor_id: 'c1', target_id: 'r2' }),
      event('caught', T0 + 30 * MIN, { actor_id: 'c2', target_id: 'r3' }),
      event('jailbreak', T0 + 35 * MIN, { actor_id: 'r3', data: { freed: 1 } }),
    ]
    const r = computeResults(g, players.map((p) => (p.id === 'r3' ? { ...p, jailed: false } : p)), events)
    expect(r.longestSurvivor).toEqual({ id: 'r3', ms: 25 * MIN })
    expect(r.mostCatches).toEqual({ id: 'c1', count: 2 })
    expect(r.jailbreakHero).toEqual({ id: 'r3', freed: 1 })
  })

  it('a runner never caught survives the whole chase', () => {
    const r = computeResults(g, [ben, player('r1', 'runner')], [])
    expect(r.longestSurvivor).toEqual({ id: 'r1', ms: 45 * MIN })
  })

  it('has no catch or jailbreak awards when nothing happened', () => {
    const r = computeResults(g, [ben, player('r1', 'runner')], [])
    expect(r.mostCatches).toBeNull()
    expect(r.jailbreakHero).toBeNull()
  })
})

describe('removed players', () => {
  it('leaves removed players out of the awards', () => {
    const ev = [
      event('caught', T0 + 10 * MIN, { actor_id: 'gone', target_id: 'r1' }),
      event('caught', T0 + 11 * MIN, { actor_id: 'gone', target_id: 'r2' }),
      event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r3' }),
    ]
    const players = [player('c1', 'chaser'), player('r1', 'runner', { jailed: true }), player('r2', 'runner', { jailed: true }), player('r3', 'runner', { jailed: true })]
    expect(computeResults(game(), players, ev).mostCatches).toEqual({ id: 'c1', count: 1 })
  })
})

describe('Luar Garisan', () => {
  const out = (id: string, min: number) => event('luar-garisan', T0 + min * MIN, { actor_id: id, data: { who: id } })

  it('a disqualified runner is not a survivor, and their survival ends at Luar Garisan', () => {
    const players = [ben, player('r1', 'runner', { disqualified_at: iso(T0 + 10 * MIN) })]
    const r = computeResults(g, players, [out('r1', 10)])
    expect(r.winner).toBe('chasers')
    expect(r.survivors).toEqual([])
    // Out of the running for the award, so a lone disqualified runner leaves nobody to win it.
    expect(r.longestSurvivor).toBeNull()
  })

  it('survival ends at Luar Garisan, so a later catch of another runner gives them the award', () => {
    const players = [
      ben,
      player('r1', 'runner', { disqualified_at: iso(T0 + 20 * MIN) }),
      player('r2', 'runner', { jailed: true }),
    ]
    const events = [out('r1', 20), event('caught', T0 + 8 * MIN, { actor_id: 'c1', target_id: 'r2' })]
    expect(computeResults(g, players, events).longestSurvivor).toEqual({ id: 'r2', ms: 3 * MIN })
  })

  it('a disqualified runner is not a survivor while another is still free', () => {
    const players = [ben, player('r1', 'runner', { disqualified_at: iso(T0 + 10 * MIN) }), player('r2', 'runner')]
    const r = computeResults(g, players, [out('r1', 10)])
    expect(r.winner).toBe('runners')
    expect(r.survivors).toEqual(['r2'])
  })

  it('a disqualified player wins no award', () => {
    const players = [
      player('c1', 'chaser', { disqualified_at: iso(T0 + 30 * MIN) }),
      lee,
      player('r1', 'runner', { disqualified_at: iso(T0 + 40 * MIN) }),
      player('r2', 'runner', { jailed: true }),
      player('r3', 'runner', { jailed: true }),
    ]
    const events = [
      event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r2' }),
      event('caught', T0 + 14 * MIN, { actor_id: 'c1', target_id: 'r3' }),
      event('caught', T0 + 16 * MIN, { actor_id: 'c2', target_id: 'r3' }),
      out('c1', 30),
      out('r1', 40),
    ]
    const r = computeResults(g, players, events)
    expect(r.mostCatches).toEqual({ id: 'c2', count: 1 })
    expect(r.longestSurvivor?.id).not.toBe('r1')
    expect(r.longestSurvivor).toEqual({ id: 'r3', ms: 9 * MIN })
  })

  it('a disqualified jailbreak hero wins nothing', () => {
    const players = [ben, player('r1', 'runner', { disqualified_at: iso(T0 + 40 * MIN) })]
    const events = [event('jailbreak', T0 + 20 * MIN, { actor_id: 'r1', data: { freed: 2 } }), out('r1', 40)]
    expect(computeResults(g, players, events).jailbreakHero).toBeNull()
  })
})
