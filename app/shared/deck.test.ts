import { describe, expect, it } from 'vitest'
import { backOf, cardsLeft, dealFrom, deckFor, grabOffer, RARITY, setsFor, SET, SIKE_PER_SET } from './deck.js'
import type { PowerUpKind } from './types.js'

const count = (cards: PowerUpKind[]) => cards.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})

describe('setsFor', () => {
  it('is one set per 10 runners or 5 chasers, rounded up, at least one', () => {
    expect(setsFor('runner', 14)).toBe(2)
    expect(setsFor('runner', 10)).toBe(1)
    expect(setsFor('runner', 0)).toBe(1)
    expect(setsFor('chaser', 3)).toBe(1)
    expect(setsFor('chaser', 6)).toBe(2)
  })
})

describe('deckFor', () => {
  it('Core runners: Durian x3 and Ponteng x3 per set', () => {
    expect(count(deckFor('core', 'runner', 2))).toEqual({ shield: 6, cloak: 6, sike: 4 })
  })
  it('Core chasers: Mat Rempit x2 and Pak Guard x2 per set', () => {
    expect(count(deckFor('core', 'chaser', 1))).toEqual({ flare: 2, focus: 2, sike: 2 })
  })
  it('Full runners: Gostan x2, Durian x2, Ponteng x2, Toyol x1, Abang Grab x1, Cheese Ais x1, Nasi Lemak KFC x1 per set (10 cards)', () => {
    expect(SET.full.runner).toEqual(['decoy', 'decoy', 'shield', 'shield', 'cloak', 'cloak', 'toyol', 'grab', 'cheese', 'combo'])
    expect(count(deckFor('full', 'runner', 1))).toEqual({ decoy: 2, shield: 2, cloak: 2, toyol: 1, grab: 1, cheese: 1, combo: 1, sike: 2 })
  })
  it('Full chasers: Mat Rempit x2, Pak Guard x2, Ah Long x1, Abang Grab x1, Tee And Gee x2, Nasi Lemak KFC x1 per set (9 cards)', () => {
    expect(SET.full.chaser).toEqual(['flare', 'flare', 'focus', 'focus', 'along', 'grab', 'toll', 'toll', 'combo'])
    expect(count(deckFor('full', 'chaser', 1))).toEqual({ flare: 2, focus: 2, along: 1, grab: 1, toll: 2, combo: 1, sike: 2 })
  })
  it('Core is unchanged: no Toyol, Ah Long or Abang Grab', () => {
    expect([...SET.core.runner, ...SET.core.chaser]).not.toEqual(expect.arrayContaining(['toyol']))
    expect(count([...SET.core.runner, ...SET.core.chaser])).toEqual({ shield: 3, cloak: 3, flare: 2, focus: 2 })
  })
})

describe('new cards', () => {
  it('Full decks carry the new cards; Core is unchanged', () => {
    expect(SET.full.runner.filter((k) => k === 'cheese')).toHaveLength(1)
    expect(SET.full.runner.filter((k) => k === 'combo')).toHaveLength(1)
    expect(SET.full.chaser.filter((k) => k === 'toll')).toHaveLength(2)
    expect(SET.full.chaser.filter((k) => k === 'combo')).toHaveLength(1)
    expect(SET.core.runner).not.toContain('cheese')
  })
})

describe('grabOffer', () => {
  it('offers 3 real cards from what the round has left, the same for the same Grab', () => {
    const deck = deckFor('full', 'runner', 1)
    const taken: PowerUpKind[] = ['toyol', 'combo']
    const a = grabOffer(deck, taken, 'seed:grab:u1')
    expect(a).toHaveLength(3)
    expect(a).not.toContain('sike')
    expect(a).not.toContain('toyol')
    expect(a).not.toContain('combo')
    expect(grabOffer(deck, taken, 'seed:grab:u1')).toEqual(a)
  })
})

describe('cardsLeft', () => {
  it('counts down, then shows the full deck again after a round ends', () => {
    expect(cardsLeft(6, 0)).toBe(6)
    expect(cardsLeft(6, 5)).toBe(1)
    expect(cardsLeft(6, 6)).toBe(6)
  })
})

describe('rarity, Sike and the deal', () => {
  it("names each card's rarity", () => {
    expect(RARITY.shield).toBe('common')
    expect(RARITY.grab).toBe('rare')
    expect(RARITY.toll).toBe('rare')
    expect(RARITY.toyol).toBe('epic')
    expect(RARITY.combo).toBe('epic')
    expect(SIKE_PER_SET).toBe(2)
  })
  it('a full runner set is 12 cards with 2 Sikes', () => {
    const deck = deckFor('full', 'runner', 1)
    expect(deck).toHaveLength(12)
    expect(deck.filter((k) => k === 'sike')).toHaveLength(2)
  })
  it('deals 5 cards from what this round has left, never a taken one', () => {
    const deck = deckFor('full', 'runner', 1)
    const taken: PowerUpKind[] = ['decoy', 'decoy', 'toyol', 'sike', 'sike']
    let seed = 1
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let n = 0; n < 50; n++) {
      const deal = dealFrom(deck, taken, rng)
      expect(deal).toHaveLength(5)
      expect(deal).not.toContain('decoy')
      expect(deal).not.toContain('toyol')
      expect(deal).not.toContain('sike')
    }
  })
  it('with fewer than 5 left in the round, deals from a fresh round', () => {
    const deck = deckFor('core', 'chaser', 1) // 6 cards
    expect(dealFrom(deck, ['flare', 'flare', 'focus'], () => 0.5)).toHaveLength(5)
  })
  it("a real card's back shows its rarity; a Sike's back is any of the three", () => {
    expect(backOf('toyol', () => 0)).toBe('epic')
    expect(new Set([0, 0.4, 0.8].map((r) => backOf('sike', () => r)))).toEqual(new Set(['common', 'rare', 'epic']))
  })
})
