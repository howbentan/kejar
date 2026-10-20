import type { Game, Phase, Ping } from './types.js'

export const MINUTE_MS = 60_000
/** Spec §4.5: the check-in alert goes out 30 s before each ping. */
export const ALERT_LEAD_MS = 30_000

function bounds(game: Game) {
  const start = Date.parse(game.started_at!)
  const hideEnd = start + game.settings.hideMin * MINUTE_MS
  const end = hideEnd + game.settings.lengthMin * MINUTE_MS
  return { start, hideEnd, end }
}

export function phaseAt(game: Game, now: number): { phase: Phase; endsAt: number | null } {
  if (!game.started_at) return { phase: 'lobby', endsAt: null }
  const { hideEnd, end } = bounds(game)
  if (game.ended_at) return { phase: 'ended', endsAt: Math.min(end, Date.parse(game.ended_at)) }
  if (now < hideEnd) return { phase: 'hiding', endsAt: hideEnd }
  if (now < end) return { phase: 'chasing', endsAt: end }
  return { phase: 'ended', endsAt: end }
}

/** Chase start is the end of hiding. */
export function chaseStartOf(game: Game): number | null {
  return game.started_at ? bounds(game).hideEnd : null
}

export function pingTimes(game: Game): { seq: number; alertAt: number; revealAt: number }[] {
  if (!game.started_at) return []
  const { hideEnd, end } = bounds(game)
  const step = game.settings.pingMin * MINUTE_MS
  const out: { seq: number; alertAt: number; revealAt: number }[] = []
  for (let seq = 1, t = hideEnd + step; t < end; seq++, t += step) {
    out.push({ seq, alertAt: t - ALERT_LEAD_MS, revealAt: t })
  }
  return out
}

export interface DueWork {
  alert: number[]
  reveal: number[]
  end: boolean
}

export function dueWork(game: Game, pings: Ping[], now: number): DueWork {
  const work: DueWork = { alert: [], reveal: [], end: false }
  if (!game.started_at || game.ended_at) return work
  const bySeq = new Map(pings.map((p) => [p.seq, p]))
  for (const t of pingTimes(game)) {
    const row = bySeq.get(t.seq)
    if (now >= t.alertAt && !row?.alerted) work.alert.push(t.seq)
    if (now >= t.revealAt && !row?.revealed) work.reveal.push(t.seq)
  }
  work.end = phaseAt(game, now).phase === 'ended'
  return work
}
