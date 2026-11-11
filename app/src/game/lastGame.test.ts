import { describe, expect, it } from 'vitest'
import { RECONNECT_MS, reconnectHref, saveLastGame } from './lastGame'
import { saveOrganiserSession } from './organiserSession'
import { saveSession } from './session'

function memoryStorage(): Storage {
  const s = new Map<string, string>()
  return {
    getItem: (k: string) => s.get(k) ?? null,
    setItem: (k: string, v: string) => void s.set(k, v),
    removeItem: (k: string) => void s.delete(k),
  } as Storage
}

describe('reconnect from the last game', () => {
  it('returns /g/CODE for a recent player game with a token', () => {
    const s = memoryStorage()
    saveSession(s, 'abc234', { token: 't' })
    expect(reconnectHref(s, Date.now())).toBe('/g/ABC234')
  })

  it('returns /host/CODE for a recent organiser game with an organiser session', () => {
    const s = memoryStorage()
    saveOrganiserSession(s, { organiserToken: 'o', name: 'Owner' })
    saveLastGame(s, 'ABC234', 'organiser', 1000)
    expect(reconnectHref(s, 1000 + 60_000)).toBe('/host/ABC234')
  })

  it('is null once older than 24 hours', () => {
    const s = memoryStorage()
    saveSession(s, 'ABC234', { token: 't' })
    saveLastGame(s, 'ABC234', 'player', 5000)
    expect(reconnectHref(s, 5000 + RECONNECT_MS - 1)).toBe('/g/ABC234')
    expect(reconnectHref(s, 5000 + RECONNECT_MS + 1)).toBeNull()
  })

  it('is null for a player record with no token for that code', () => {
    const s = memoryStorage()
    saveLastGame(s, 'ABC234', 'player', 1000)
    expect(reconnectHref(s, 2000)).toBeNull()
  })

  it('is null for an organiser record with no organiser session', () => {
    const s = memoryStorage()
    saveLastGame(s, 'ABC234', 'organiser', 1000)
    expect(reconnectHref(s, 2000)).toBeNull()
  })

  it('is null and never throws for malformed storage', () => {
    const s = memoryStorage()
    s.setItem('kejar.lastGame', '{oops')
    expect(reconnectHref(s, 2000)).toBeNull()
    s.setItem('kejar.lastGame', '{"code":5}')
    expect(reconnectHref(s, 2000)).toBeNull()
    s.setItem('kejar.lastGame', '{"code":"ABC234","role":"boss","at":1000}')
    expect(reconnectHref(s, 2000)).toBeNull()
  })

  it('the newest record wins', () => {
    const s = memoryStorage()
    saveSession(s, 'ABC234', { token: 't' })
    saveOrganiserSession(s, { organiserToken: 'o', name: 'Owner' })
    saveLastGame(s, 'XYZ789', 'organiser')
    expect(reconnectHref(s)).toBe('/host/XYZ789')
  })
})
