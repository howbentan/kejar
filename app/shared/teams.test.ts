import { describe, expect, it } from 'vitest'
import { shuffleRoles, validateTeams } from './teams.js'
import { seeded } from './testing.js'

describe('shuffleRoles', () => {
  it('keeps marshals and makes about one chaser per four players', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`)
    const roles = shuffleRoles(ids, ['p0'], seeded(1))
    expect(roles.p0).toBe('marshal')
    expect(Object.values(roles).filter((r) => r === 'chaser')).toHaveLength(3)
    expect(Object.values(roles).filter((r) => r === 'runner')).toHaveLength(8)
  })
  it('always makes at least one chaser', () => {
    const roles = shuffleRoles(['a', 'b', 'c'], [], seeded(2))
    expect(Object.values(roles).filter((r) => r === 'chaser')).toHaveLength(1)
  })
  it('gives different splits for different random seeds', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`)
    expect(shuffleRoles(ids, [], seeded(1))).not.toEqual(shuffleRoles(ids, [], seeded(99)))
  })
})

describe('validateTeams', () => {
  it('needs a chaser', () => {
    expect(validateTeams({ a: 'runner', b: 'runner' })).toEqual(['Need at least 1 chaser'])
  })
  it('needs two runners and no more chasers than runners', () => {
    expect(validateTeams({ a: 'chaser', b: 'chaser', c: 'runner' })).toEqual([
      'Need at least 2 runners',
      'More chasers than runners',
    ])
  })
  it('accepts one chaser and two runners', () => {
    expect(validateTeams({ a: 'chaser', b: 'runner', c: 'runner' })).toEqual([])
  })
})
