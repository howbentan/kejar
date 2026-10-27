import { describe, expect, it } from 'vitest'
import { loadSession, saveSession } from './session'

function memoryStorage(): Storage {
  const s = new Map<string, string>()
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v) } as Storage
}

describe('game session storage', () => {
  it('round-trips a player token for a game code', () => {
    const storage = memoryStorage()
    saveSession(storage, 'ABC234', { token: 't1' })
    expect(loadSession(storage, 'ABC234')).toEqual({ token: 't1' })
  })

  it('keeps different games apart and ignores code case', () => {
    const storage = memoryStorage()
    saveSession(storage, 'ABC234', { token: 't1' })
    saveSession(storage, 'XYZ789', { token: 't2' })
    expect(loadSession(storage, 'abc234')).toEqual({ token: 't1' })
    expect(loadSession(storage, 'XYZ789')).toEqual({ token: 't2' })
  })

  it('returns an empty session for an unknown game or corrupt data', () => {
    const storage = memoryStorage()
    storage.setItem('kejar.game.BAD123', '{oops')
    expect(loadSession(storage, 'NONE22')).toEqual({})
    expect(loadSession(storage, 'BAD123')).toEqual({})
  })
})
