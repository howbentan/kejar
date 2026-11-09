import type { GameEvent, LatLng, Player } from './types.js'

/** Spec §5.1. */
export const SOS_REPEAT_MS = 30_000
export const OUTSIDE_MARGIN_M = 20
/** Luar Garisan: a second outside report disqualifies only this long after the warning, so one re-sent fix cannot do both. */
export const LUAR_GARISAN_GRACE_MS = 30_000
export const START_RADIUS_M = 50
export const NOTE_MAX = 140

export type AlertKind = 'sos' | 'report' | 'outside' | 'missed' | 'auto-jail' | 'left-start' | 'flagged-catch'
export type ReportReason = 'unsafe' | 'dispute' | 'other'
export type SosReason = 'hurt' | 'lost' | 'unsafe' | 'dispute' | 'other'
/** How long after an SOS its sender can still add what's happening (motion design §6.0). */
export const SOS_DETAILS_MS = 5 * 60_000

export const SOS_REASON_LABEL: Record<SosReason, string> = {
  hurt: 'Hurt',
  lost: 'Lost',
  unsafe: 'Unsafe player',
  dispute: 'Catch dispute',
  other: 'Something else',
}

/** What a marshal records when closing an SOS (the takeover's chips); `handleAlert` refuses to close an SOS without one. */
export type SosOutcome = 'sorted' | 'first-aid' | 'left' | 'false-alarm'
export const SOS_OUTCOME_LABEL: Record<SosOutcome, string> = {
  sorted: 'Sorted, all good',
  'first-aid': 'First aid given',
  left: 'Player left the game',
  'false-alarm': 'False alarm',
}

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
  /** The player the alert is about, when an action (like undoing an auto-jail) needs it. */
  targetId: string | null
  handled: boolean
  /** The latest marshal who tapped "I'm going" on an SOS, or null. Only set on `sos` alerts. */
  respondingName: string | null
  /** What a marshal recorded when closing this alert, or null if it's still open or was closed without one. */
  outcome: string | null
  /** The marshal (or organiser) who closed this alert, or null if it's still open or the close carried no name. */
  closedByName: string | null
}

/** 'Aina #07' for a runner with a tag, otherwise the name. */
export function who(p: Player): string {
  return p.tag_id === null ? p.name : `${p.name} #${String(p.tag_id).padStart(2, '0')}`
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')

function place(data: Record<string, unknown>): LatLng | null {
  return typeof data.lat === 'number' && typeof data.lng === 'number' ? { lat: data.lat, lng: data.lng } : null
}

function toAlert(e: GameEvent, details: Map<string, GameEvent>, responding: Map<string, GameEvent>): Omit<Alert, 'handled'> | null {
  const d = e.data
  const base = {
    id: e.id,
    at: e.at,
    where: null as LatLng | null,
    targetId: null as string | null,
    respondingName: null as string | null,
    outcome: null as string | null,
    closedByName: null as string | null,
  }
  switch (e.type) {
    case 'sos': {
      const more = details.get(e.id)?.data
      const label = more ? SOS_REASON_LABEL[more.reason as SosReason] : undefined
      const withWho = more && s(more.withName) ? ` with ${s(more.withName)}` : ''
      return {
        ...base,
        kind: 'sos',
        text: `SOS from ${s(d.who)}${label ? `: ${label}${withWho}` : ''}`,
        where: place(d),
        respondingName: s(responding.get(e.id)?.data.name) || null,
      }
    }
    case 'report': {
      const label = REASON_LABEL[d.reason as ReportReason] ?? REASON_LABEL.other
      const note = s(d.note) ? ` — ${s(d.note)}` : ''
      return { ...base, kind: 'report', text: `${s(d.name)} reported ${s(d.targetName)}: ${label}${note}`, where: place(d) }
    }
    case 'outside':
      return { ...base, kind: 'outside', text: `${s(d.who)} left the play area` }
    case 'missed':
      return { ...base, kind: 'missed', text: `${s(d.who)} missed 2 check-ins` }
    case 'auto-jailed':
      return { ...base, kind: 'auto-jail', targetId: e.target_id, text: `${s(d.who)} missed 2 check-ins — sent to Penjara` }
    case 'left-start':
      return { ...base, kind: 'left-start', text: `${s(d.name)} left the start early` }
    case 'caught':
      if (d.flagged !== true) return null
      return { ...base, kind: 'flagged-catch', text: `Check catch: ${s(d.who)} by ${s(d.chaser)} (position unknown)` }
    default:
      return null
  }
}

/** Marshal alerts from the game's events: open ones newest first, then handled ones newest first. */
export function alertsFrom(events: GameEvent[]): Alert[] {
  const handled = new Set(events.filter((e) => e.type === 'handled').map((e) => s(e.data.eventId)))
  // The outcome recorded when each alert was closed, keyed by the alert's event id.
  const outcomes = new Map<string, string>()
  for (const e of events) if (e.type === 'handled' && s(e.data.outcome)) outcomes.set(s(e.data.eventId), s(e.data.outcome))
  // Who closed each alert, newest wins (events arrive oldest first), the same way as the outcome.
  const closers = new Map<string, string>()
  for (const e of events) if (e.type === 'handled' && s(e.data.name)) closers.set(s(e.data.eventId), s(e.data.name))
  // The latest "What's happening?" for each SOS (events arrive oldest first).
  const details = new Map<string, GameEvent>()
  for (const e of events) if (e.type === 'sos-details') details.set(s(e.data.sosId), e)
  // The latest marshal responding to each SOS (events arrive oldest first).
  const responding = new Map<string, GameEvent>()
  for (const e of events) if (e.type === 'sos-responding') responding.set(s(e.data.sosId), e)
  const all = events.flatMap((e) => {
    const a = toAlert(e, details, responding)
    return a ? [{ ...a, handled: handled.has(a.id), outcome: outcomes.get(a.id) ?? null, closedByName: closers.get(a.id) ?? null }] : []
  })
  const newest = (x: Alert, y: Alert) => Date.parse(y.at) - Date.parse(x.at)
  return [...all.filter((a) => !a.handled).sort(newest), ...all.filter((a) => a.handled).sort(newest)]
}
