// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hashToken } from './secrets.js'
import { IP_LIMIT_PER_MIN, LIMIT_WINDOW_MS, limitKey, TOKEN_LIMIT_PER_MIN } from './limits.js'

describe('limitKey', () => {
  it('has the agreed limits', () => {
    expect(TOKEN_LIMIT_PER_MIN).toBe(120)
    expect(IP_LIMIT_PER_MIN).toBe(60)
    expect(LIMIT_WINDOW_MS).toBe(60_000)
  })

  it('keys a player token by its hash with 120 a minute', () => {
    expect(limitKey({ token: 'abc' }, '1.2.3.4')).toEqual({ key: `tok:${hashToken('abc')}`, limit: 120 })
  })

  it('keys an organiserToken alone', () => {
    expect(limitKey({ organiserToken: 'org' }, null)).toEqual({ key: `tok:${hashToken('org')}`, limit: 120 })
  })

  it('lets token win over organiserToken', () => {
    expect(limitKey({ token: 'abc', organiserToken: 'org' }, null).key).toBe(`tok:${hashToken('abc')}`)
  })

  it('keys by IP with 60 a minute when there is no token', () => {
    expect(limitKey({}, '1.2.3.4')).toEqual({ key: 'ip:1.2.3.4', limit: 60 })
    expect(limitKey({ token: '', organiserToken: 7 }, '1.2.3.4')).toEqual({ key: 'ip:1.2.3.4', limit: 60 })
  })

  it('uses ip:unknown when the IP is null', () => {
    expect(limitKey({}, null)).toEqual({ key: 'ip:unknown', limit: 60 })
  })

  it('never puts the raw token in the key', () => {
    expect(limitKey({ token: 'super-secret-token' }, null).key).not.toContain('super-secret-token')
  })
})
