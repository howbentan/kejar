import { describe, expect, it } from 'vitest'
import { isExpired, MARSHAL_INVITE_TTL_MS, ORGANISER_INVITE_TTL_MS } from './invites.js'

describe('isExpired', () => {
  it('is false strictly before the expiry time', () => {
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:09.999Z'))).toBe(false)
  })

  it('is true at or after the expiry time', () => {
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:10.000Z'))).toBe(true)
    expect(isExpired('2026-01-01T00:00:10.000Z', Date.parse('2026-01-01T00:00:11.000Z'))).toBe(true)
  })
})

describe('TTLs', () => {
  it('organiser invites last 48 hours, marshal invites last 6', () => {
    expect(ORGANISER_INVITE_TTL_MS).toBe(48 * 60 * 60 * 1000)
    expect(MARSHAL_INVITE_TTL_MS).toBe(6 * 60 * 60 * 1000)
  })
})
