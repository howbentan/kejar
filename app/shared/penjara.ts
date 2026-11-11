import { JAIL_RADIUS_M } from './catch.js'
import { distanceM } from './geo.js'
import { isOut } from './players.js'
import type { LatLng, Player, Position } from './types.js'

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
