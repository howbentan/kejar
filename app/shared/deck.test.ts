import { describe, expect, it } from 'vitest'
import { cardAt, cardsLeft, deckFor, setsFor } from './deck.js'
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
  it('Full runners (until Plan D): Gostan, Durian and Ponteng x2 each', () => {
    expect(count(deckFor('full', 'runner', 1))).toEqual({ decoy: 2, shield: 2, cloak: 2 })
  })
  it('Full chasers (until Plan D): Mat Rempit and Pak Guard x2 each', () => {
    expect(count(deckFor('full', 'chaser', 1))).toEqual({ flare: 2, focus: 2 })
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
