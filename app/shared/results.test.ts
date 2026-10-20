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
