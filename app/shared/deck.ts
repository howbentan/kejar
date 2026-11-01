import { hash } from './geo.js'
import type { PowerUpKind } from './types.js'

export type Side = 'runner' | 'chaser'
export type Mode = 'core' | 'full'

/**
 * One set of each side's deck (power-ups design §5b, rules doc §3). Full lacks Toyol, Ah Long and
 * Abang Grab until Plan D adds them.
 */
export const SET: Record<Mode, Record<Side, PowerUpKind[]>> = {
  core: {
    runner: ['shield', 'shield', 'shield', 'cloak', 'cloak', 'cloak'],
    chaser: ['flare', 'flare', 'focus', 'focus'],
  },
  full: {
    runner: ['decoy', 'decoy', 'shield', 'shield', 'cloak', 'cloak'],
    chaser: ['flare', 'flare', 'focus', 'focus'],
  },
}

/** One set per 10 runners or 5 chasers, rounded up, and always at least one. */
export function setsFor(side: Side, players: number): number {
  return Math.max(1, Math.ceil(players / (side === 'runner' ? 10 : 5)))
}

export function deckFor(mode: Mode, side: Side, sets: number): PowerUpKind[] {
  return Array.from({ length: sets }, () => SET[mode][side]).flat()
}

/** mulberry32: small, fast, and the same everywhere for the same seed. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The card at draw number `index`. Each round of `deck.length` draws is its own shuffle of the whole mix,
 * so running out reshuffles (power-ups §5b; cards still held aren't held back, a simplification).
 */
export function cardAt(seed: string, deck: PowerUpKind[], index: number): PowerUpKind {
  const round = Math.floor(index / deck.length)
  const rnd = prng(hash(`${seed}:${round}`))
  const cards = [...deck]
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards[index % deck.length]
}

/** Cards left in the current round; a finished round shows the full deck, since the next draw reshuffles. */
export function cardsLeft(deckLength: number, draws: number): number {
  return deckLength - (draws % deckLength)
}
