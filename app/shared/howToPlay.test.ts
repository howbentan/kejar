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

  it('adds the endgame card at the end of both decks only when asked', () => {
    for (const side of ['runner', 'chaser'] as const) {
      expect(cardsFor(side, 'core', false).some((c) => c.scene === 'endgame')).toBe(false)
      const on = cardsFor(side, 'core', false, true)
      expect(on.at(-1)).toEqual({ scene: 'endgame', headline: 'Endgame', line: "Near the end, <b>something changes</b>. You'll find out when it happens." })
      expect(on).toHaveLength(cardsFor(side, 'core', false).length + 1)
    }
  })

  it('tells the held-key rescue as it is: 20 s held, a 5 s reset, one rescuer, a 10 s head start', () => {
    const card = (side: 'runner' | 'chaser', scene: string) => cardsFor(side, 'core', true).find((c) => c.scene === scene)!.line
    const breakOut = card('runner', 'break-out')
    expect(breakOut).toContain('<b>hold the key for 20 s</b>')
    expect(breakOut).toContain('Let go and it waits 5 s, then resets.')
    expect(breakOut).toContain('One rescuer at a time')
    expect(breakOut).toContain('10 s head start')
    const stop = card('chaser', 'stop-rescue')
    expect(stop).toContain('<b>hold the key for 20 s</b>')
    expect(stop).toContain('10 s head start')
    for (const side of ['runner', 'chaser'] as const)
      for (const c of cardsFor(side, 'core', true)) expect(c.line).not.toMatch(/10 seconds|you get 10/)
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
