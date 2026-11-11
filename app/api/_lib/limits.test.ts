// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hashToken } from './secrets.js'
import { FAIL_LIMIT_PER_MIN, IP_KEYED_ACTIONS, IP_KEYED_LIMIT_PER_MIN, IP_LIMIT_PER_MIN, NEARBY_LIMIT_PER_MIN, LIMIT_WINDOW_MS, limitKey, TOKEN_LIMIT_PER_MIN } from './limits.js'

describe('limitKey', () => {
  it('has the agreed limits', () => {
    expect(TOKEN_LIMIT_PER_MIN).toBe(120)
    expect(IP_LIMIT_PER_MIN).toBe(60)
    expect(IP_KEYED_LIMIT_PER_MIN).toBe(200)
    expect(LIMIT_WINDOW_MS).toBe(60_000)
  })

  it('keys a player token by its hash with 120 a minute', () => {
    expect(limitKey('state', { token: 'abc' }, '1.2.3.4')).toEqual({ key: `tok:${hashToken('abc')}`, limit: 120 })
  })

  it('keys an organiserToken alone', () => {
    expect(limitKey('state', { organiserToken: 'org' }, null)).toEqual({ key: `tok:${hashToken('org')}`, limit: 120 })
  })

  it('lets token win over organiserToken', () => {
    expect(limitKey('state', { token: 'abc', organiserToken: 'org' }, null).key).toBe(`tok:${hashToken('abc')}`)
  })

  it('keys by IP with 60 a minute when there is no token', () => {
    expect(limitKey('state', {}, '1.2.3.4')).toEqual({ key: 'ip:1.2.3.4', limit: 60 })
    expect(limitKey('state', { token: '', organiserToken: 7 }, '1.2.3.4')).toEqual({ key: 'ip:1.2.3.4', limit: 60 })
  })

  it('uses ip:unknown when the IP is null', () => {
    expect(limitKey('state', {}, null)).toEqual({ key: 'ip:unknown', limit: 60 })
  })

  it('never puts the raw token in the key', () => {
    expect(limitKey('state', { token: 'super-secret-token' }, null).key).not.toContain('super-secret-token')
  })

  it('gives nearbyParks its own tighter bucket per organiser token (Overpass queries are slow and shared)', () => {
    expect(NEARBY_LIMIT_PER_MIN).toBe(20)
    const r = limitKey('nearbyParks', { organiserToken: 'org' }, '1.2.3.4')
    expect(r).toEqual({ key: `nearby:${hashToken('org')}`, limit: 20 })
    expect(r.key).not.toBe(limitKey('state', { organiserToken: 'org' }, null).key)
    expect(limitKey('nearbyParks', {}, '1.2.3.4')).toEqual({ key: 'ip:1.2.3.4', limit: 60 })
  })

  it('keys join and the invite redeems by IP with 200 a minute, even with a token', () => {
    expect(FAIL_LIMIT_PER_MIN).toBe(30)
    for (const a of ['join', 'redeemOrganiserInvite', 'redeemMarshalInvite']) {
      expect(IP_KEYED_ACTIONS).toContain(a)
      expect(limitKey(a, { token: 'forged', organiserToken: 'x' }, '1.2.3.4')).toEqual({ key: 'join-ip:1.2.3.4', limit: 200 })
      expect(limitKey(a, {}, null)).toEqual({ key: 'join-ip:unknown', limit: 200 })
    }
  })
})
