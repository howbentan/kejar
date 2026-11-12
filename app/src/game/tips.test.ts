import { describe, expect, it } from 'vitest'
import { INFO } from './powerInfo'
import { pickTip, TIPS } from './tips'

const RULES = ['Tag ripped?', 'Penjara']

describe('tips', () => {
  it('has at least 6, each 60 characters or fewer, with no em-dash', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(6)
    for (const t of TIPS) {
      expect((t.name + t.rest).length).toBeLessThanOrEqual(60)
      expect(t.name + t.rest).not.toContain('—')
    }
  })

  it('names only real power-ups or rule lines', () => {
    const names = new Set(Object.values(INFO).map((i) => i.name))
    for (const t of TIPS) expect(names.has(t.name) || RULES.includes(t.name)).toBe(true)
  })

  it('picks an index in range', () => {
    expect(pickTip(() => 0)).toBe(0)
    expect(pickTip(() => 0.9999)).toBe(TIPS.length - 1)
  })
})
