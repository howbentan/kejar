import { JAIL_RADIUS_M } from './catch.js'
import { phaseAt } from './clock.js'
import { distanceM } from './geo.js'
import { isOut } from './players.js'
import type { Game, LatLng, Player, Position } from './types.js'

/** How long a rescuer must stay close to Penjara before everyone eligible is freed (rules §9a). */
export const RESCUE_HOLD_MS = 10_000
/** A rescue's reach: the same as a jailbreak scan's. */
export const RESCUE_RADIUS_M = JAIL_RADIUS_M
/** How often the rescuer's phone sends its location during the hold. */
export const RESCUE_PING_MS = 1_500
/** A fix less accurate than this neither fails nor helps a rescue (GPS leniency, rules §9a). */
export const RESCUE_MAX_ACCURACY_M = 20

/**
 * Where a live rescue stands (rules §9a). It fails if the rescuer is out, or if any fix they sent during the hold
 * is clearly outside Penjara's 30 m plus its GPS error. A poor fix (over 20 m accuracy) is ignored, so one bad
 * reading never fails it. Otherwise it succeeds once the 10 s are up.
 */
export function rescueVerdict(i: {
  rescue: { by: string; startedAt: number }
  rescuer: Player
  fixes: Position[]
  jail: LatLng
  now: number
}): 'holding' | 'success' | 'failed' {
  if (isOut(i.rescuer)) return 'failed'
  const endsAt = i.rescue.startedAt + RESCUE_HOLD_MS
  const away = i.fixes.some((f) => {
    const at = Date.parse(f.at)
    if (at < i.rescue.startedAt || at > endsAt || !(f.accuracy_m <= RESCUE_MAX_ACCURACY_M)) return false
    return distanceM(f, i.jail) > RESCUE_RADIUS_M + Math.max(f.accuracy_m, 0)
  })
  if (away) return 'failed'
  return i.now >= endsAt ? 'success' : 'holding'
}

/** The Penjara reel's slots (rules §9a): nine black and one lime free slot. */
export const REEL_SLOTS = 10

/** True once this runner has pulled the reel during their current jail stay (a pull older than their catch is spent). */
export function reelPulledThisStay(p: Pick<Player, 'reel_pulled_at' | 'caught_at'>): boolean {
  if (!p.reel_pulled_at) return false
  return !p.caught_at || Date.parse(p.reel_pulled_at) >= Date.parse(p.caught_at)
}

/**
 * Where one pull of the reel lands. The server picks; the phone only animates to it. One slot in `REEL_SLOTS` is
 * free, except for a runner who has used their one escape: their reel is all black.
 */
export function pickReel(rng: () => number, freedOnce: boolean): 'free' | 'black' {
  if (freedOnce) return 'black'
  return Math.floor(rng() * REEL_SLOTS) === 0 ? 'free' : 'black'
}

/** The clock turns lime, and everyone is told once, when this much of the chase is left (rules §2.7). */
export const FIVE_LEFT_MS = 5 * 60_000

/**
 * True when `5 minutes left!` should go out now: mid-chase, not paused, no final whistle pending, not warned yet,
 * and 5 minutes or less on the clock. A game whose chase starts with 5 minutes or less left is due straight away.
 */
export function fiveLeftDue(game: Game, now: number): boolean {
  if (game.five_warned_at || game.paused_at || game.final_whistle_at || game.ended_at) return false
  const { phase, endsAt } = phaseAt(game, now)
  return phase === 'chasing' && endsAt !== null && endsAt - now <= FIVE_LEFT_MS
}
