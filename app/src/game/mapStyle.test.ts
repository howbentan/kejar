import { describe, expect, it } from 'vitest'
import { kejarMapStyle } from './mapStyle'

const labels = kejarMapStyle.layers.filter((l) => l.type === 'symbol')

describe('kejarMapStyle', () => {
  it('names streets, parks, places and water so players can tell where they are', () => {
    expect(labels.map((l) => l.id).sort()).toEqual(['park-names', 'place-names', 'street-names', 'water-names'])
  })

  it('draws names in faint grey, never lime text (spec §9)', () => {
    for (const l of labels) {
      const paint = (l as { paint?: Record<string, unknown> }).paint ?? {}
      expect(String(paint['text-color'])).toMatch(/^rgba\(245, ?245, ?243/)
    }
  })

  it('draws names below the game layers', () => {
    const ids = kejarMapStyle.layers.map((l) => l.id)
    expect(ids[ids.length - 1]).not.toBe('arena')
    expect(ids.indexOf('street-names')).toBeGreaterThan(ids.indexOf('roads'))
  })
})
