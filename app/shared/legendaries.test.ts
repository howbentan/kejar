import { describe, expect, it } from 'vitest'
import { fallbackFor, LEGENDARY_KINDS, pickLegendaries, SIDE_PAIRS, sidesOf } from './legendaries.js'
import { seeded } from './testing.js'

describe('SIDE_PAIRS', () => {
  it('pairs Dato Seri with Super Ring for Dikejar, Bomoh with Mak Kau Hijau for Kejar', () => {
    expect(SIDE_PAIRS).toEqual({ runner: ['dato', 'ring'], chaser: ['bomoh', 'hijau'] })
    expect(LEGENDARY_KINDS).toEqual(['dato', 'ring', 'bomoh', 'hijau'])
  })
})

describe('pickLegendaries', () => {
  it('with both sides on, gives exactly one stash per pair, and over 50 seeded picks hits every member', () => {
    const rng = seeded(42)
    const seen = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const l = pickLegendaries({ runner: 'on', chaser: 'on' }, rng)
      expect([l.dato, l.ring].filter((v) => v === 'stash')).toHaveLength(1)
      expect([l.bomoh, l.hijau].filter((v) => v === 'stash')).toHaveLength(1)
      for (const k of LEGENDARY_KINDS) if (l[k] === 'stash') seen.add(k)
    }
    expect([...seen].sort()).toEqual(['bomoh', 'dato', 'hijau', 'ring'])
  })

  it('a side that is off has both of its pair off', () => {
    const rng = seeded(3)
    for (let i = 0; i < 20; i++) {
      const runnerOnly = pickLegendaries({ runner: 'on', chaser: 'off' }, rng)
      expect(runnerOnly.bomoh).toBe('off')
      expect(runnerOnly.hijau).toBe('off')
      const chaserOnly = pickLegendaries({ runner: 'off', chaser: 'on' }, rng)
      expect(chaserOnly.dato).toBe('off')
      expect(chaserOnly.ring).toBe('off')
    }
    expect(pickLegendaries({ runner: 'off', chaser: 'off' }, rng)).toEqual({ dato: 'off', ring: 'off', bomoh: 'off', hijau: 'off' })
  })

  it('a low draw picks the first of the pair and a high one the second', () => {
    expect(pickLegendaries({ runner: 'on', chaser: 'on' }, () => 0.1)).toEqual({ dato: 'stash', ring: 'off', bomoh: 'stash', hijau: 'off' })
    expect(pickLegendaries({ runner: 'on', chaser: 'on' }, () => 0.9)).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
  })
})

describe('sidesOf', () => {
  it('reads the old per-legendary shape as sides', () => {
    expect(sidesOf({ dato: 'stash', bomoh: 'off' } as never)).toEqual({ runner: 'on', chaser: 'off' })
    expect(sidesOf({ dato: 'off', bomoh: 'stash', ring: 'off', hijau: 'off' })).toEqual({ runner: 'off', chaser: 'on' })
    expect(sidesOf({ dato: 'off', bomoh: 'off', ring: 'stash', hijau: 'stash' })).toEqual({ runner: 'on', chaser: 'on' })
    expect(sidesOf({ dato: 'off', bomoh: 'off', ring: 'off', hijau: 'off' })).toEqual({ runner: 'off', chaser: 'off' })
  })
})

describe('fallbackFor', () => {
  it('is the other one of the pair', () => {
    expect(fallbackFor('dato')).toBe('ring')
    expect(fallbackFor('ring')).toBe('dato')
    expect(fallbackFor('bomoh')).toBe('hijau')
    expect(fallbackFor('hijau')).toBe('bomoh')
  })
})
