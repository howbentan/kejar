import { BONUS_SEQ_BASE, SCHEDULED_ALERT_LEAD_MS } from './clock.js'

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
