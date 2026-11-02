import { distanceM, hash, offset } from './geo.js'
import { inPlayArea } from './playArea.js'
import { BONUS_SEQ_BASE } from './clock.js'
import type { Arena, LatLng, Phase, Ping, Player, Position, PowerUp, PowerUpKind } from './types.js'

/** Spec §4.8.1. */
export const CLAIM_RADIUS_M = 30
export const CLAIM_FRESH_MS = 30_000
export const STATION_LOCK_MS = 60_000
export const SHIELD_MS = 10 * 60_000
/** Power-ups §5a: after each surprise ping is revealed, the chasers wait this long for the next. */
export const FLARE_COOLDOWN_MS = 3 * 60_000
const MAX_ACCURACY_M = 20
const DECOY_MIN_M = 120
const DECOY_MAX_M = 180

export type ClaimJudgement =
  | { ok: true }
  | {
      ok: false
      reason: 'not-chasing' | 'cannot-claim' | 'unknown-station' | 'too-far' | 'already-claimed' | 'locked' | 'hand-full'
      lockedForMs?: number
      /** For hand-full: what's in the slot, and whether its effect is still running. */
      busyKind?: PowerUpKind
      busyRunning?: boolean
    }

export function judgeClaim(i: {
  phase: Phase
  me: Player
  station: number | null
  arena: Arena
  myPos: Position | null
  powerUps: PowerUp[]
  pings: Ping[]
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

  const busy = slotBusy(i.powerUps, i.me.id, i.pings, i.now)
  if (busy) return { ok: false, reason: 'hand-full', busyKind: busy.kind, busyRunning: busy.running }
  return { ok: true }
}

/**
 * What fills a player's one slot (power-ups §5a): an unused card, or a used one whose effect is still
 * running. Durian runs until it blocks a catch or 10 minutes pass; Gostan, Ponteng and Pak Guard until
 * the next reveal after use; Mat Rempit until its own surprise ping is revealed.
 */
export function slotBusy(powerUps: PowerUp[], playerId: string, pings: Ping[], now: number): { kind: PowerUpKind; running: boolean } | null {
  for (const u of powerUps.filter((x) => x.player_id === playerId)) {
    if (u.taken_at !== null) continue // Toyol or Ah Long took it: gone from the hand
    if (u.used_at === null) return { kind: u.kind, running: false }
    // Done the moment they succeed (power-ups §5a): nothing keeps running.
    if (u.kind === 'toyol' || u.kind === 'along') continue
    const usedAt = Date.parse(u.used_at)
    const revealedAfter = (bonusOnly: boolean) =>
      pings.some((p) =>
        p.revealed && p.seq > 0 && (bonusOnly ? p.seq >= BONUS_SEQ_BASE && Date.parse(p.alert_at) >= usedAt : Date.parse(p.reveal_at) > usedAt),
      )
    const running =
      u.kind === 'shield'
        ? u.consumed_at === null && now - usedAt < SHIELD_MS
        : u.kind === 'flare'
          ? !revealedAfter(true)
          : !revealedAfter(false)
    if (running) return { kind: u.kind, running: true }
  }
  return null
}

/** Mat Rempit is one at a time, team-wide, with a 3-minute cooldown after each surprise ping (power-ups §5a). */
export function flareBlocked(pings: Ping[], now: number): { reason: 'flare-pending' | 'flare-cooldown'; readyInMs: number } | null {
  const bonus = pings.filter((p) => p.seq >= BONUS_SEQ_BASE)
  const pending = bonus.filter((p) => !p.revealed)
  // The player is told when it'll be ready either way: the pending ping's reveal plus the cooldown.
  if (pending.length) return { reason: 'flare-pending', readyInMs: Math.max(...pending.map((p) => Date.parse(p.reveal_at))) + FLARE_COOLDOWN_MS - now }
  const last = Math.max(...bonus.map((p) => Date.parse(p.reveal_at)), -Infinity)
  const readyInMs = last + FLARE_COOLDOWN_MS - now
  return readyInMs > 0 ? { reason: 'flare-cooldown', readyInMs } : null
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
