import { offset, hash } from './geo.js'
import { SIDE_PAIRS } from './legendaries.js'
import { inPlayArea } from './playArea.js'
import {
  DEFAULT_SETTINGS,
  placedStash,
  type Arena,
  type Game,
  type LatLng,
  type LegendaryKind,
  type PlacedStash,
  type Player,
  type Slip,
  type TupperSide,
} from './types.js'

/** How close a player must be for the Tupperware side quest to wake up. */
export const SIDE_QUEST_RADIUS_M = 50

/** Runners are Dikejar and chasers are Kejar; marshals (and players with no role yet) have no side. */
export function sideOf(role: Player['role']): TupperSide | null {
  return role === 'runner' ? 'dikejar' : role === 'chaser' ? 'kejar' : null
}

const stashOf = (game: Game, kind: LegendaryKind) =>
  ({ dato: game.dato_stash, ring: game.ring_stash, bomoh: game.bomoh_stash, hijau: game.hijau_stash })[kind]

/**
 * The side's Tupperware: its legendary that is on a hidden stash (Full mode only), with the spot it was dropped at.
 * Null when the side is off or the box hasn't been dropped yet. Older games may lack legendary keys, so they're read
 * with the defaults.
 */
export function boxFor(game: Game, side: TupperSide): { legendary: LegendaryKind; spot: PlacedStash } | null {
  if (game.settings.mode !== 'full') return null
  const legendaries = { ...DEFAULT_SETTINGS.legendaries, ...game.settings.legendaries }
  const pair = side === 'dikejar' ? SIDE_PAIRS.runner : SIDE_PAIRS.chaser
  const legendary = pair.find((k) => legendaries[k] === 'stash')
  const spot = legendary ? placedStash(stashOf(game, legendary)) : null
  return legendary && spot ? { legendary, spot } : null
}

const STEP_M = 10
const MAX_REACH_M = 300
const MIN_R_M = 20
const DIRECTIONS = 12

/** How far you can walk from `start` along `bearing` in 10 m steps and still be in the play area, up to 300 m. */
function reach(start: LatLng, bearing: number, area: Pick<Arena, 'boundary' | 'holes'>): number {
  let d = 0
  while (d + STEP_M <= MAX_REACH_M && inPlayArea(offset(start, d + STEP_M, bearing), area)) d += STEP_M
  return d
}

/**
 * Where the two Tupperwares go: one for each side, the same distance from the start on opposite sides of it, so
 * neither team gets the shorter walk. The direction is picked from the seed, then turned in 30 degree steps until
 * both spots have room (at least 20 m, at most 60% of the shorter reach). With no room anywhere, both are the start.
 */
export function mirroredSpots(arena: Pick<Arena, 'start' | 'boundary' | 'holes'>, seed: string): Record<TupperSide, LatLng> {
  const theta = ((hash(seed) % 36000) / 36000) * 2 * Math.PI
  for (let k = 0; k < DIRECTIONS; k++) {
    const dir = theta + (k * Math.PI) / 6
    const r = 0.6 * Math.min(reach(arena.start, dir, arena), reach(arena.start, dir + Math.PI, arena))
    if (r >= MIN_R_M) return { dikejar: offset(arena.start, r, dir), kejar: offset(arena.start, r, dir + Math.PI) }
  }
  return { dikejar: arena.start, kejar: arena.start }
}

export type SlipVerdict = { ok: true } | { ok: false; reason: 'wrong' | 'no-try' | 'not-yours' | 'taken' | 'no-box' }

/**
 * What a scanned slip means, in the order the spec fixes: a player's one try comes first, then whether it's a real,
 * unused slip from this organisation, then the right side, then whether the box exists and is still there.
 * Distance, phase and the rest stay with the legendary claim checks.
 */
export function judgeSlip(i: {
  slip: Slip | null
  organisationId: string
  gameId: string
  side: TupperSide
  triedBefore: boolean
  box: ReturnType<typeof boxFor>
}): SlipVerdict {
  const { slip } = i
  if (i.triedBefore) return { ok: false, reason: 'no-try' }
  if (!slip || slip.organisation_id !== i.organisationId || slip.used_at || (slip.bound_game_id && slip.bound_game_id !== i.gameId)) {
    return { ok: false, reason: 'wrong' }
  }
  if (slip.side !== i.side) return { ok: false, reason: 'not-yours' }
  if (!i.box) return { ok: false, reason: 'no-box' }
  if (i.box.spot.claimedBy !== null) return { ok: false, reason: 'taken' }
  return { ok: true }
}
