import { describe, expect, it } from 'vitest'
import { arenaAroundPoint } from './arenas.js'
import { JAIL_QR, newGameCode, stationFromQr, stationQr, tagIdFromQr, tagQr } from './ids.js'
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

describe('station codes', () => {
  it('round-trips station numbers 1–8', () => {
    expect(stationQr(3)).toBe('KEJAR:STATION:3')
    expect(stationFromQr('KEJAR:STATION:3')).toBe(3)
  })
  it('rejects other codes', () => {
    expect(stationFromQr('KEJAR:STATION:9')).toBeNull()
    expect(stationFromQr('KEJAR:STATION:0')).toBeNull()
    expect(stationFromQr('KEJAR:TAG:03')).toBeNull()
  })
})

describe('arenaAroundPoint with stations', () => {
  const C = { lat: 3.1, lng: 101.6 }
  const near = { lat: 3.1 + 100 / 111_195, lng: 101.6 }
  const far = { lat: 3.1 + 300 / 111_195, lng: 101.6 }
  it('keeps stations inside the play area', () => {
    expect(arenaAroundPoint(C, 200, [near]).stations).toEqual([near])
  })
  it('rejects a station outside the play area', () => {
    expect(() => arenaAroundPoint(C, 200, [far])).toThrow('Stations must be inside the play area')
  })
  it('allows at most 8 stations', () => {
    expect(() => arenaAroundPoint(C, 200, Array(9).fill(near))).toThrow('At most 8 stations')
  })
})
