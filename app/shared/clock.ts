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

/** Ping rows at or above this seq are bonus pings (Flare), not part of the schedule. */
export const BONUS_SEQ_BASE = 1000

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
  // Bonus pings (Flare) carry their own times and sit outside the schedule.
  for (const b of pings.filter((p) => p.seq >= BONUS_SEQ_BASE)) {
    if (now >= Date.parse(b.alert_at) && !b.alerted) work.alert.push(b.seq)
    if (now >= Date.parse(b.reveal_at) && !b.revealed) work.reveal.push(b.seq)
  }
  work.end = phaseAt(game, now).phase === 'ended'
  return work
}

/** The next ping still to be revealed: scheduled or bonus, whichever comes first. */
export function nextReveal(game: Game, pings: Ping[], now: number): { alertAt: number; revealAt: number } | null {
  const scheduled = pingTimes(game)
    .filter((t) => t.revealAt > now)
    .map((t) => ({ alertAt: t.alertAt, revealAt: t.revealAt }))
  const bonus = pings
    .filter((p) => p.seq >= BONUS_SEQ_BASE && !p.revealed && Date.parse(p.reveal_at) > now)
    .map((p) => ({ alertAt: Date.parse(p.alert_at), revealAt: Date.parse(p.reveal_at) }))
  return [...scheduled, ...bonus].sort((a, b) => a.revealAt - b.revealAt)[0] ?? null
}
