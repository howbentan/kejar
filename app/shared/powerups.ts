import { distanceM, hash, offset } from './geo.js'
import { inPlayArea } from './playArea.js'
import type { Arena, LatLng, Phase, Player, Position, PowerUp, PowerUpKind } from './types.js'

/** Spec §4.8.1. */
export const CLAIM_RADIUS_M = 30
export const CLAIM_FRESH_MS = 30_000
export const STATION_LOCK_MS = 60_000
export const HAND_MAX = 3
export const SHIELD_MS = 10 * 60_000
const MAX_ACCURACY_M = 20
const DECOY_MIN_M = 120
const DECOY_MAX_M = 180

export const RUNNER_KINDS: PowerUpKind[] = ['decoy', 'shield', 'cloak']
export const CHASER_KINDS: PowerUpKind[] = ['flare', 'focus']

export type ClaimJudgement =
  | { ok: true }
  | {
      ok: false
      reason: 'not-chasing' | 'cannot-claim' | 'unknown-station' | 'too-far' | 'already-claimed' | 'locked' | 'hand-full'
      lockedForMs?: number
    }

export function judgeClaim(i: {
  phase: Phase
  me: Player
  station: number | null
  arena: Arena
  myPos: Position | null
  powerUps: PowerUp[]
  now: number
}): ClaimJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.me.role === null || i.me.role === 'marshal' || i.me.jailed) return { ok: false, reason: 'cannot-claim' }
  const spot = i.station === null ? undefined : i.arena.stations?.[i.station - 1]
  if (!spot) return { ok: false, reason: 'unknown-station' }

  const p = i.myPos
  const slack = p ? Math.min(Math.max(p.accuracy_m, 0), MAX_ACCURACY_M) : 0
  if (!p || i.now - Date.parse(p.at) > CLAIM_FRESH_MS || distanceM(p, spot) > CLAIM_RADIUS_M + slack) {
    return { ok: false, reason: 'too-far' }
  }

  const here = i.powerUps.filter((u) => u.station === i.station)
  if (here.some((u) => u.player_id === i.me.id)) return { ok: false, reason: 'already-claimed' }
  const lastClaim = Math.max(...here.map((u) => Date.parse(u.claimed_at)), -Infinity)
  const lockedForMs = lastClaim + STATION_LOCK_MS - i.now
  if (lockedForMs > 0) return { ok: false, reason: 'locked', lockedForMs }

  const inHand = i.powerUps.filter((u) => u.player_id === i.me.id && u.used_at === null).length
  if (inHand >= HAND_MAX) return { ok: false, reason: 'hand-full' }
  return { ok: true }
}

export function pickPowerUp(role: 'runner' | 'chaser', rng: () => number): PowerUpKind {
  const kinds = role === 'runner' ? RUNNER_KINDS : CHASER_KINDS
  return kinds[Math.floor(rng() * kinds.length)]
}

/** A fake position 120–180 m away, kept inside the play area (and out of lakes) if any of 12 directions allows it. */
export function decoySpot(p: LatLng, area: Pick<Arena, 'boundary' | 'holes'>, seed: string): LatLng {
  const h = hash(seed)
  const start = ((h & 0xffff) / 0x10000) * 2 * Math.PI
  const dist = DECOY_MIN_M + ((h >>> 16) / 0x10000) * (DECOY_MAX_M - DECOY_MIN_M)
  const options = Array.from({ length: 12 }, (_, k) => offset(p, dist, start + (k * Math.PI) / 6))
  return options.find((o) => inPlayArea(o, area)) ?? options[0]
}

/** The runner's shield that is switched on, unused, and less than 10 minutes old. */
export function activeShield(powerUps: PowerUp[], runnerId: string, now: number): PowerUp | null {
  return (
    powerUps.find(
      (u) =>
        u.player_id === runnerId &&
        u.kind === 'shield' &&
        u.used_at !== null &&
        u.consumed_at === null &&
        now - Date.parse(u.used_at) < SHIELD_MS,
    ) ?? null
  )
}
