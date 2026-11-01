import { describe, expect, it } from 'vitest'
import { validateTeams } from './teams.js'

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
