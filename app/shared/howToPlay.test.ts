import { describe, expect, it } from 'vitest'
import { cardsFor, stickersFor } from './howToPlay'

const RUNNER = [
  "You're Dikejar",
  'When it buzzes, check in',
  "Miss two, you're out",
  'Tag ripped? Stop',
  'Break them out',
  'Grab power-ups',
  'Anything wrong? SOS',
]

describe('how to play cards', () => {
  it('gives runners 7 cards with the exact headlines in order', () => {
    expect(cardsFor('runner', 'core', false).map((c) => c.headline)).toEqual(RUNNER)
    expect(cardsFor('runner', 'core', true)).toHaveLength(7)
  })

  it('gives chasers 6 cards, or 7 with the snapshot card', () => {
    const off = cardsFor('chaser', 'core', false).map((c) => c.headline)
    expect(off).toEqual(["You're Kejar", 'Pings show circles', 'Rip, then scan', 'Stop the rescue', 'Grab power-ups', 'Anything wrong? SOS'])
    const on = cardsFor('chaser', 'core', true).map((c) => c.headline)
    expect(on).toHaveLength(7)
    expect(on[3]).toBe('They can see you too')
  })

  it('never names the legendaries and has no em-dashes', () => {
    for (const side of ['runner', 'chaser'] as const)
      for (const mode of ['core', 'full'] as const)
        for (const c of cardsFor(side, mode, true)) {
          const text = `${c.headline} ${c.line}`
          expect(text).not.toMatch(/dato|seri|bomoh|legend/i)
          expect(text).not.toContain('—')
        }
  })

  it('stickersFor never includes dato or bomoh', () => {
    for (const side of ['runner', 'chaser'] as const)
      for (const mode of ['core', 'full'] as const) {
        const k = stickersFor(side, mode)
        expect(k.length).toBeGreaterThan(0)
        expect(k).not.toContain('dato')
        expect(k).not.toContain('bomoh' as never)
      }
    expect(stickersFor('runner', 'core')).toEqual(['shield', 'cloak'])
  })
})
