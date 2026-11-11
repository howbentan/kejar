import type { Game, Phase, Ping } from './types.js'

export const MINUTE_MS = 60_000
/** Bonus pings (Mat Rempit/Flare) keep a 30 s alert lead. */
export const ALERT_LEAD_MS = 30_000
/** Check-ins design §4.2: scheduled pings alert 45 s before they reveal, so a late push still leaves time to check in. */
export const SCHEDULED_ALERT_LEAD_MS = 45_000

/**
 * Maps a schedule time (as if the game had never been paused) to wall time: each pause that began
 * at or before it pushes it later by the pause's length. An open pause runs up to `now`, so while
 * paused every countdown stays frozen. Without `now`, an open pause is ignored.
 */
export function toWall(game: Game, t: number, now?: number): number {
  const pauses = game.pauses.map((p) => ({ from: Date.parse(p.from), to: Date.parse(p.to) }))
  if (game.paused_at && now !== undefined) pauses.push({ from: Date.parse(game.paused_at), to: Math.max(now, Date.parse(game.paused_at)) })
  let w = t
  for (const p of pauses.sort((a, b) => a.from - b.from)) if (p.from <= w) w += p.to - p.from
  return w
}

function nominal(game: Game) {
  const start = Date.parse(game.started_at!)
  const hideEnd = start + game.settings.hideMin * MINUTE_MS
  return { start, hideEnd, end: hideEnd + game.settings.lengthMin * MINUTE_MS }
}

function bounds(game: Game, now?: number) {
  const n = nominal(game)
  return { start: n.start, hideEnd: toWall(game, n.hideEnd, now), end: toWall(game, n.end, now) }
}

/**
 * When the last free Dikejar goes out, the end is held this long so a wrong last catch can be undone (fair-play §1.4).
 * The hold freezes during a pause like every other timer (resume shifts `final_whistle_at`), and the game can't end
 * while paused.
 */
export const FINAL_WHISTLE_MS = 60_000

/** When a pending final whistle ends the game; an open pause holds it back, counted from when the whistle blew. */
function whistleEnd(game: Game, now: number): number {
  const fw = Date.parse(game.final_whistle_at!)
  const open = game.paused_at ? Math.max(0, now - Math.max(Date.parse(game.paused_at), fw)) : 0
  return fw + FINAL_WHISTLE_MS + open
}

export function phaseAt(game: Game, now: number): { phase: Phase; endsAt: number | null } {
  if (!game.started_at) return { phase: 'lobby', endsAt: null }
  const { hideEnd, end } = bounds(game, now)
  if (game.ended_at) return { phase: 'ended', endsAt: Math.min(end, Date.parse(game.ended_at)) }
  if (now < hideEnd) return { phase: 'hiding', endsAt: hideEnd }
  // A pending final whistle brings the end forward: the game is over when the hold is, if that comes before the clock.
  if (now < end) return { phase: 'chasing', endsAt: game.final_whistle_at ? Math.min(end, whistleEnd(game, now)) : end }
  // A pending final whistle holds the chase open past the clock time, until the server really ends the game:
  // an undo during the hold must still be possible, and nobody should see results that might change.
  if (game.final_whistle_at) return { phase: 'chasing', endsAt: whistleEnd(game, now) }
  return { phase: 'ended', endsAt: end }
}

/** Chase start is the end of hiding. */
export function chaseStartOf(game: Game, now?: number): number | null {
  return game.started_at ? bounds(game, now).hideEnd : null
}

export function pingTimes(game: Game, now?: number): { seq: number; alertAt: number; revealAt: number }[] {
  if (!game.started_at) return []
  const { hideEnd, end } = nominal(game)
  const step = game.settings.pingMin * MINUTE_MS
  const out: { seq: number; alertAt: number; revealAt: number }[] = []
  for (let seq = 1, t = hideEnd + step; t < end; seq++, t += step) {
    // The alert is placed on the wall clock on its own, so a pause after it moves only the reveal.
    out.push({ seq, alertAt: toWall(game, t - SCHEDULED_ALERT_LEAD_MS, now), revealAt: toWall(game, t, now) })
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
  if (!game.started_at || game.ended_at || game.paused_at) return work
  const bySeq = new Map(pings.map((p) => [p.seq, p]))
  for (const t of pingTimes(game, now)) {
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
  const scheduled = pingTimes(game, now)
    .filter((t) => t.revealAt > now)
    .map((t) => ({ alertAt: t.alertAt, revealAt: t.revealAt }))
  const bonus = pings
    .filter((p) => p.seq >= BONUS_SEQ_BASE && !p.revealed && Date.parse(p.reveal_at) > now)
    .map((p) => ({ alertAt: Date.parse(p.alert_at), revealAt: Date.parse(p.reveal_at) }))
  return [...scheduled, ...bonus].sort((a, b) => a.revealAt - b.revealAt)[0] ?? null
}
