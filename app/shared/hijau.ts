import { fairlyWarned } from './checkins.js'
import type { HijauRun, Player } from './types.js'

/** Mak Kau Hijau (new power-ups §6.3): runners have 45 s to tap green, one shared deadline. */
export const HIJAU_MS = 45_000

/**
 * When the 45 s starts: the earliest moment at or after the claim whose 45 s overlaps no check-in window
 * (scheduled or Mat Rempit, alert to reveal), so runners never face two buttons at once. Touching a window's
 * edge is fine. Each step moves to a later reveal, so it always ends.
 */
export function hijauStartsAt(claimedAt: number, windows: { alertAt: number; revealAt: number }[]): number {
  let t = claimedAt
  for (;;) {
    const hit = windows.find((w) => w.alertAt < t + HIJAU_MS && w.revealAt > t)
    if (!hit) return t
    t = hit.revealAt
  }
}

/**
 * Whether this run jails anyone: the one batch push went out at least 25 s before the deadline (the check-in
 * late-push rule, fair-play §1.1). No push at all is void. Unlike a check-in this ignores `checkinMode`: in
 * schedule mode a check-in is known in advance so it always counts, but Mak Kau Hijau is a surprise, so only
 * the push can warn anyone.
 */
export function hijauCounts(run: HijauRun): boolean {
  return fairlyWarned(run.sentAt ? Date.parse(run.sentAt) : null, Date.parse(run.deadline), 'push')
}

/** Who must tap green: runners who are free, not Luar Garisan, not removed and not under house arrest. */
export function hijauTargets(players: Player[]): Player[] {
  return players.filter((p) => p.role === 'runner' && !p.jailed && !p.disqualified_at && !p.removed_at && !p.arrest)
}
