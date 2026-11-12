import { describe, expect, it } from 'vitest'
import { forgetName, loadName, saveName } from './nameMemory'

function memoryStorage(): Storage {
  const s = new Map<string, string>()
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v), removeItem: (k: string) => void s.delete(k) } as Storage
}
const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } } as unknown as Storage

describe('name memory', () => {
  it('round-trips a trimmed name', () => {
    const s = memoryStorage()
    saveName(s, '  Aina ')
    expect(loadName(s)).toBe('Aina')
  })

  it('forgets it', () => {
    const s = memoryStorage()
    saveName(s, 'Aina')
    forgetName(s)
    expect(loadName(s)).toBe('')
  })

  it('never throws when storage is blocked', () => {
    expect(loadName(broken)).toBe('')
    expect(() => saveName(broken, 'Aina')).not.toThrow()
    expect(() => forgetName(broken)).not.toThrow()
  })
})
