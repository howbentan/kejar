import type { LegendaryKind, Settings } from './types.js'

/**
 * One legendary per side, picked by the app (new power-ups design §6.1): Dikejar get Dato Seri or Super Ring, Kejar get
 * Bomoh or Mak Kau Hijau. The organiser only switches each side on or off.
 */
export const SIDE_PAIRS = { runner: ['dato', 'ring'], chaser: ['bomoh', 'hijau'] } as const

/** What the organiser picks: each side's legendary on or off. */
export type SideSwitch = { runner: 'off' | 'on'; chaser: 'off' | 'on' }

/** Every legendary, Dikejar's pair first, in the order cards, steps and notices are listed. */
export const LEGENDARY_KINDS: readonly LegendaryKind[] = ['dato', 'ring', 'bomoh', 'hijau']

/** Each legendary's card colour, the word the organiser's kit, walk and packing list use. */
export const LEGENDARY_COLOUR: Record<LegendaryKind, 'yellow' | 'orange' | 'purple' | 'green'> = {
  dato: 'yellow',
  ring: 'orange',
  bomoh: 'purple',
  hijau: 'green',
}

/** Each legendary's name, for the organiser's own screens only (never a player's or a marshal's). */
export const LEGENDARY_NAME: Record<LegendaryKind, string> = {
  dato: 'Dato Seri',
  ring: 'Super Ring',
  bomoh: 'Bomoh',
  hijau: 'Mak Kau Hijau',
}

/** A side is on if either of its pair is on a hidden stash. Reads older games' per-legendary settings. */
export function sidesOf(l: Partial<Settings['legendaries']>): SideSwitch {
  const on = (pair: readonly LegendaryKind[]) => (pair.some((k) => l[k] === 'stash') ? 'on' : 'off')
  return { runner: on(SIDE_PAIRS.runner), chaser: on(SIDE_PAIRS.chaser) }
}

/**
 * For each side that's on, one of its pair on a hidden stash at random (a draw under 0.5 picks the first), and
 * everything else off. Only the sides that are on draw from `rng`.
 */
export function pickLegendaries(sides: SideSwitch, rng: () => number): Settings['legendaries'] {
  const out: Settings['legendaries'] = { dato: 'off', ring: 'off', bomoh: 'off', hijau: 'off' }
  for (const side of ['runner', 'chaser'] as const) {
    if (sides[side] !== 'on') continue
    const pair = SIDE_PAIRS[side]
    out[rng() < 0.5 ? pair[0] : pair[1]] = 'stash'
  }
  return out
}

/** The other legendary of the same side: the one tried when the picked one has no free card. */
export function fallbackFor(kind: LegendaryKind): LegendaryKind {
  const pair: readonly LegendaryKind[] = (SIDE_PAIRS.runner as readonly LegendaryKind[]).includes(kind) ? SIDE_PAIRS.runner : SIDE_PAIRS.chaser
  return pair[0] === kind ? pair[1] : pair[0]
}
