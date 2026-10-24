import type { GameEvent, LatLng, Player } from './types.js'

/** Spec §5.1. */
export const SOS_REPEAT_MS = 30_000
export const OUTSIDE_MARGIN_M = 20
export const START_RADIUS_M = 50
export const NOTE_MAX = 140

export type AlertKind = 'sos' | 'report' | 'outside' | 'missed' | 'left-start' | 'flagged-catch'
export type ReportReason = 'unsafe' | 'dispute' | 'other'

export const REASON_LABEL: Record<ReportReason, string> = {
  unsafe: 'Unsafe play',
  dispute: 'Catch dispute',
  other: 'Something else',
}

export interface Alert {
  /** The event that raised it; `handleAlert` takes this. */
  id: string
  at: string
  kind: AlertKind
  text: string
  where: LatLng | null
  handled: boolean
}

/** 'Aina #07' for a runner with a tag, otherwise the name. */
export function who(p: Player): string {
  return p.tag_id === null ? p.name : `${p.name} #${String(p.tag_id).padStart(2, '0')}`
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')

function place(data: Record<string, unknown>): LatLng | null {
  return typeof data.lat === 'number' && typeof data.lng === 'number' ? { lat: data.lat, lng: data.lng } : null
}

function toAlert(e: GameEvent): Omit<Alert, 'handled'> | null {
  const d = e.data
  const base = { id: e.id, at: e.at, where: null as LatLng | null }
  switch (e.type) {
    case 'sos':
      return { ...base, kind: 'sos', text: `SOS from ${s(d.who)}`, where: place(d) }
    case 'report': {
      const label = REASON_LABEL[d.reason as ReportReason] ?? REASON_LABEL.other
      const note = s(d.note) ? ` — ${s(d.note)}` : ''
      return { ...base, kind: 'report', text: `${s(d.name)} reported ${s(d.targetName)}: ${label}${note}`, where: place(d) }
    }
    case 'outside':
      return { ...base, kind: 'outside', text: `${s(d.who)} left the play area` }
    case 'missed':
      return { ...base, kind: 'missed', text: `${s(d.who)} missed 2 check-ins` }
    case 'left-start':
      return { ...base, kind: 'left-start', text: `${s(d.name)} left the start early` }
    case 'caught':
      if (d.flagged !== true) return null
      return { ...base, kind: 'flagged-catch', text: `Check catch: ${s(d.who)} by ${s(d.chaser)} (position unknown)` }
    default:
      return null
  }
}

/**
 * Whether a runner has just missed their second check-in in a row, so marshals hear once per streak.
 * `windows` is [chase start, reveal 1, …, reveal k] (scheduled pings only), ending at the reveal being
 * processed; `lastAt` is the runner's latest position at that reveal. A check-in for ping j is a
 * position after reveal j-1 (or the chase start) and no later than reveal j.
 */
export function missedTwoInARow(windows: number[], lastAt: number | null): boolean {
  const k = windows.length - 1
  const L = lastAt ?? -Infinity
  return k >= 2 && L <= windows[k - 2] && (k === 2 || L > windows[k - 3])
}

/** Marshal alerts from the game's events: open ones newest first, then handled ones newest first. */
export function alertsFrom(events: GameEvent[]): Alert[] {
  const handled = new Set(events.filter((e) => e.type === 'handled').map((e) => s(e.data.eventId)))
  const all = events.flatMap((e) => {
    const a = toAlert(e)
    return a ? [{ ...a, handled: handled.has(a.id) }] : []
  })
  const newest = (x: Alert, y: Alert) => Date.parse(y.at) - Date.parse(x.at)
  return [...all.filter((a) => !a.handled).sort(newest), ...all.filter((a) => a.handled).sort(newest)]
}
