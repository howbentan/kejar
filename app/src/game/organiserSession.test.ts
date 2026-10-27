import { describe, expect, it } from 'vitest'
import { clearOrganiserSession, loadOrganiserSession, saveOrganiserSession } from './organiserSession'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('organiser session', () => {
  it('is empty until saved, then round-trips', () => {
    const storage = memoryStorage()
    expect(loadOrganiserSession(storage)).toBeNull()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    expect(loadOrganiserSession(storage)).toEqual({ organiserToken: 'tok1', name: 'Owner' })
  })

  it('is not scoped to a game code — one session for every game', () => {
    const storage = memoryStorage()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    expect(storage.getItem('kejar.organiser')).not.toBeNull()
  })

  it('clears', () => {
    const storage = memoryStorage()
    saveOrganiserSession(storage, { organiserToken: 'tok1', name: 'Owner' })
    clearOrganiserSession(storage)
    expect(loadOrganiserSession(storage)).toBeNull()
  })
})
