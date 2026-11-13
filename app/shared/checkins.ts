import { BONUS_SEQ_BASE, SCHEDULED_ALERT_LEAD_MS } from './clock.js'
import type { CheckinMode, GameEvent, Player } from './types.js'

export { SCHEDULED_ALERT_LEAD_MS }
/** Mat Rempit (Flare) bonus pings keep a 30 s alert, and never count towards auto-jail. */
export const BONUS_ALERT_LEAD_MS = 30_000

export const alertLeadFor = (seq: number): number => (seq >= BONUS_SEQ_BASE ? BONUS_ALERT_LEAD_MS : SCHEDULED_ALERT_LEAD_MS)

/**
 * A check-in for a ping is a location sent inside its window: from the alert up to the reveal
 * (checkins design §4.2). A pause after the alert stretches the window rather than moving it (§4.6).
 */
export function checkedIn(alertAt: number, revealAt: number, lastAt: number | null): boolean {
  return lastAt !== null && lastAt >= alertAt && lastAt <= revealAt
}

/**
 * Check-ins only count from the chase start or the runner's last release, whichever is later
 * (checkins design §4.4).
 */
export function checkinsSince(chaseStart: number, freedAt: string | null): number {
  return Math.max(chaseStart, freedAt ? Date.parse(freedAt) : -Infinity)
}

/**
 * When a runner's check-in count last restarted (the `freedAt` for `checkinsSince`): their last release from
 * Penjara (`freed_at`), or the end of a Super Ring house arrest that let them go (released, or undone). House
 * arrest replaces Penjara, so it restarts the count like the auto-jail undo does, but it never sets `freed_at`,
 * which would play the client's "freed" Penjara moment for someone who never went in.
 */
export function countRestartAt(p: Pick<Player, 'id' | 'freed_at'>, events: GameEvent[]): string | null {
  const ended = events.filter((e) => e.type === 'arrest-ended' && e.target_id === p.id && (e.data.outcome === 'free' || e.data.outcome === 'undone')).at(-1)
  if (!ended) return p.freed_at
  return !p.freed_at || Date.parse(ended.at) > Date.parse(p.freed_at) ? ended.at : p.freed_at
}

/** A check-in that counts: the ping's alert went out at or after `since`, and a location landed in its window. */
export function countedCheckIn(alertAt: number, revealAt: number, lastAt: number | null, since: number): boolean {
  return alertAt >= since && checkedIn(alertAt, revealAt, lastAt)
}

/** A ping only counts toward auto-jail if its alert went out at least this long before the reveal. */
export const LATE_PING_MIN_WARNING_MS = 25_000

/**
 * Whether a scheduled ping gave the runner fair warning. In 'schedule' mode the warning is the schedule itself,
 * not a push, so it always did. Otherwise the alert must have been sent at least 25 s before the reveal; a late
 * one (a server that woke up after the alert time) is skipped, neither a miss nor a reset.
 */
export function fairlyWarned(alertSentAt: number | null, revealAt: number, mode: CheckinMode): boolean {
  if (mode === 'schedule') return true
  return alertSentAt !== null && revealAt - alertSentAt >= LATE_PING_MIN_WARNING_MS
}

export interface ScheduledCheckin {
  alertAt: number
  revealAt: number
  /** The runner's latest location time at or before this reveal. */
  lastAt: number | null
}

/**
 * Two missed scheduled check-ins in a row, both counted from `since` (the chase start or the runner's
 * last release): a ping only counts if its alert went out at or after `since` (checkins design §4.4).
 * `pings` are the scheduled pings revealed so far, oldest first, ending with the one being processed.
 */
export function autoJailDue(pings: ScheduledCheckin[], since: number): boolean {
  if (pings.length < 2) return false
  return pings.slice(-2).every((p) => p.alertAt >= since && !checkedIn(p.alertAt, p.revealAt, p.lastAt))
}
