import { describe, expect, it } from 'vitest'
import { arenaAroundPoint } from './arenas.js'
import { JAIL_QR, newGameCode, tagIdFromQr, tagQr } from './ids.js'
import { seeded } from './testing.js'

describe('newGameCode', () => {
  it('makes 6 easy-to-read characters', () => {
    expect(newGameCode(seeded(2))).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
  })
})

describe('tag QR codes', () => {
  it('round-trips a tag number', () => {
    expect(tagQr(7)).toBe('KEJAR:TAG:07')
    expect(tagIdFromQr('KEJAR:TAG:07')).toBe(7)
  })
  it('rejects anything that is not a Kejar tag', () => {
    expect(tagIdFromQr('hello')).toBeNull()
    expect(tagIdFromQr('KEJAR:TAG:00')).toBeNull()
    expect(tagIdFromQr(JAIL_QR)).toBeNull()
  })
})

describe('arenaAroundPoint', () => {
  it('builds a circular arena with the jail at the centre', () => {
    const a = arenaAroundPoint({ lat: 3.1, lng: 101.6 })
    expect(a.id).toBe('around-me')
    expect(a.boundary).toHaveLength(24)
    expect(a.jail).toEqual({ lat: 3.1, lng: 101.6 })
  })
})
