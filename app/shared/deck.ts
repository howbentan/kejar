import { hash } from './geo.js'
import type { PowerUpKind } from './types.js'

export type Side = 'runner' | 'chaser'
export type Mode = 'core' | 'full'

/**
 * One set of each side's deck (power-ups design §5b, rules doc §3). Full adds Gostan, plus Toyol
 * (runners), Ah Long (chasers) and Abang Grab (both sides) from Plan D, then Cheese Ais (runners), Tee And Gee
 * (chasers) and Nasi Lemak KFC (both sides) from Plan E1.
 */
export const SET: Record<Mode, Record<Side, PowerUpKind[]>> = {
  core: {
    runner: ['shield', 'shield', 'shield', 'cloak', 'cloak', 'cloak'],
    chaser: ['flare', 'flare', 'focus', 'focus'],
  },
  full: {
    runner: ['decoy', 'decoy', 'shield', 'shield', 'cloak', 'cloak', 'toyol', 'grab', 'cheese', 'combo'],
    chaser: ['flare', 'flare', 'focus', 'focus', 'along', 'grab', 'toll', 'toll', 'combo'],
  },
}

/** One set per 10 runners or 5 chasers, rounded up, and always at least one. */
export function setsFor(side: Side, players: number): number {
  return Math.max(1, Math.ceil(players / (side === 'runner' ? 10 : 5)))
}

export type Rarity = 'common' | 'rare' | 'epic'

/** Each deck card's rarity (owner, 2026-11-24): its colour on the back and the frame. Legendaries have none. */
export const RARITY: Record<Exclude<PowerUpKind, 'sike' | 'dato' | 'ring'>, Rarity> = {
  shield: 'common', cloak: 'common', decoy: 'common', flare: 'common', focus: 'common',
  cheese: 'rare', grab: 'rare', toll: 'rare',
  toyol: 'epic', along: 'epic', combo: 'epic',
}

/** Empty cards in every set of the deck, so they grow with the players like the rest. */
export const SIKE_PER_SET = 2

export function deckFor(mode: Mode, side: Side, sets: number): PowerUpKind[] {
  return Array.from({ length: sets }, () => [...SET[mode][side], ...Array<PowerUpKind>(SIKE_PER_SET).fill('sike')]).flat()
}

/**
 * The 5 face-down cards a scan deals: drawn at random from what this round of the deck has left (the deck minus the
 * cards already taken this round). The picked one is taken; the other 4 stay in the deck. With fewer than `n` left,
 * the deal comes from a fresh round.
 */
export function dealFrom(deck: PowerUpKind[], takenThisRound: PowerUpKind[], rng: () => number, n = 5): PowerUpKind[] {
  let left = [...deck]
  for (const k of takenThisRound) {
    const i = left.indexOf(k)
    if (i !== -1) left.splice(i, 1)
  }
  if (left.length < n) left = [...deck]
  const out: PowerUpKind[] = []
  for (let i = 0; i < n && left.length; i++) out.push(left.splice(Math.floor(rng() * left.length), 1)[0])
  return out
}

/** The colour on a card's back: a real card shows its rarity, a Sike borrows any of the three. */
export function backOf(card: PowerUpKind, rng: () => number): Rarity {
  if (card === 'sike') return (['common', 'rare', 'epic'] as const)[Math.min(2, Math.floor(rng() * 3))]
  return RARITY[card as keyof typeof RARITY] ?? 'common'
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
