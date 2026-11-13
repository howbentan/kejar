import { LUAR_GARISAN_MAX_ACCURACY_M } from './alerts.js'
import { distanceM } from './geo.js'
import type { Arrest, Position } from './types.js'

/** Super Ring's house arrest (new power-ups §6.2): 2:36 inside a 26 m circle. */
export const ARREST_MS = 156_000
export const ARREST_RADIUS_M = 26
/** On auto-jail (or Mak Kau Hijau) the runner has this long to open Kejar and start it, or goes to Penjara. */
export const ARREST_OPEN_MS = 60_000
/** At release, only a fix this recent (before the end) can show the runner still inside. */
export const ARREST_FIX_FRESH_MS = 20_000

/** When the house arrest ends: 2:36 after it started, or null while it waits for the runner to open Kejar. */
export function arrestEndsAt(a: Arrest): number | null {
  return a.startedAt ? Date.parse(a.startedAt) + ARREST_MS : null
}

/** A fix good enough to judge by: the same accuracy rule as Luar Garisan (50 m or better). */
export function usableFix(p: Position): boolean {
  return p.accuracy_m <= LUAR_GARISAN_MAX_ACCURACY_M
}

/** Inside the circle: within 26 m of the centre plus the fix's GPS error. Never while waiting (no centre yet). */
export function insideArrest(a: Arrest, p: Position): boolean {
  return !!a.center && distanceM(a.center, p) <= ARREST_RADIUS_M + Math.max(0, p.accuracy_m)
}

/**
 * The release check (key rule): free only if `latest` is usable, landed at or before the end and no more than
 * `ARREST_FIX_FRESH_MS` before it, and is inside. Anything else (outside, too old, too rough, none) is Penjara.
 */
export function releaseVerdict(a: Arrest, latest: Position | null): 'free' | 'revoked' {
  const endsAt = arrestEndsAt(a)
  if (endsAt === null || !latest || !usableFix(latest)) return 'revoked'
  const at = Date.parse(latest.at)
  if (at > endsAt || endsAt - at > ARREST_FIX_FRESH_MS) return 'revoked'
  return insideArrest(a, latest) ? 'free' : 'revoked'
}
