import { describe, expect, it } from 'vitest'
import { nextOccurrence, startsLabel } from './plannedStart'

const at = (h: number, m: number, day = 12) => new Date(2026, 10, day, h, m, 0, 0).getTime()

describe('planned start', () => {
  it('00:10 picked at 23:50 means tomorrow', () => expect(nextOccurrence('00:10', at(23, 50))).toBe(at(0, 10, 13)))
  it('19:30 picked at 18:00 means today', () => expect(nextOccurrence('19:30', at(18, 0))).toBe(at(19, 30)))
  it('a time already passed today means tomorrow', () => expect(nextOccurrence('09:00', at(18, 0))).toBe(at(9, 0, 13)))

  it('says when and how long', () => {
    expect(startsLabel(at(19, 30), at(19, 18))).toBe('starts 7:30 pm · in 12 min')
    expect(startsLabel(at(20, 5), at(19, 0))).toBe('starts 8:05 pm · in 1 h 5 min')
    expect(startsLabel(at(0, 10, 13), at(23, 50))).toBe('starts 12:10 am · in 20 min')
  })

  it('once passed, starting soon', () => expect(startsLabel(at(19, 30), at(19, 31))).toBe('starting soon'))
})
