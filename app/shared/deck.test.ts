import { describe, expect, it } from 'vitest'
import { cardAt, cardsLeft, deckFor, setsFor, SET } from './deck.js'
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
    expect(count(deckFor('core', 'runner', 2))).toEqual({ shield: 6, cloak: 6 })
  })
  it('Core chasers: Mat Rempit x2 and Pak Guard x2 per set', () => {
    expect(count(deckFor('core', 'chaser', 1))).toEqual({ flare: 2, focus: 2 })
  })
  it('Full runners: Gostan x2, Durian x2, Ponteng x2, Toyol x1, Abang Grab x1 per set (8 cards)', () => {
    expect(SET.full.runner).toEqual(['decoy', 'decoy', 'shield', 'shield', 'cloak', 'cloak', 'toyol', 'grab'])
    expect(count(deckFor('full', 'runner', 1))).toEqual({ decoy: 2, shield: 2, cloak: 2, toyol: 1, grab: 1 })
  })
  it('Full chasers: Mat Rempit x2, Pak Guard x2, Ah Long x1, Abang Grab x1 per set (6 cards)', () => {
    expect(SET.full.chaser).toEqual(['flare', 'flare', 'focus', 'focus', 'along', 'grab'])
    expect(count(deckFor('full', 'chaser', 1))).toEqual({ flare: 2, focus: 2, along: 1, grab: 1 })
  })
  it('Core is unchanged: no Toyol, Ah Long or Abang Grab', () => {
    expect([...SET.core.runner, ...SET.core.chaser]).not.toEqual(expect.arrayContaining(['toyol']))
    expect(count([...SET.core.runner, ...SET.core.chaser])).toEqual({ shield: 3, cloak: 3, flare: 2, focus: 2 })
  })
})

describe('cardAt', () => {
  const deck = deckFor('core', 'runner', 1)
  const round = (seed: string, r: number) => Array.from({ length: deck.length }, (_, i) => cardAt(seed, deck, r * deck.length + i))

  it('one round deals exactly the deck', () => {
    expect(count(round('g1:runner', 0))).toEqual(count(deck))
  })
  it('the next round is a fresh shuffle of the same mix', () => {
    expect(count(round('g1:runner', 1))).toEqual(count(deck))
  })
  it('is the same for the same seed and index', () => {
    expect(round('g1:runner', 0)).toEqual(round('g1:runner', 0))
  })
  it('different games get different orders', () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => round(`g${i}:runner`, 0).join(',')))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('cardsLeft', () => {
  it('counts down, then shows the full deck again after a round ends', () => {
    expect(cardsLeft(6, 0)).toBe(6)
    expect(cardsLeft(6, 5)).toBe(1)
    expect(cardsLeft(6, 6)).toBe(6)
  })
})
