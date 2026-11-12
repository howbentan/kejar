import type { Phase } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

/**
 * What home knows about the game you can reconnect to (home upgrades design): where, what phase, how long left,
 * and when it is planned to start. Times use the server's clock: `skewMs` is how far the server is ahead of this
 * phone, so a phone with a wrong clock still counts down right.
 */
export interface HomeStatus {
  code: string
  park: string
  phase: Phase
  paused: boolean
  players: number | null
  endsAt: number | null
  startsAt: number | null
  skewMs: number
}

export function statusFrom(code: string, view: View, deviceNow: number): HomeStatus {
  const startsAt = view.settings.startsAt ? Date.parse(view.settings.startsAt) : NaN
  return {
    code: code.toUpperCase(),
    park: view.arena.name,
    phase: view.phase,
    paused: view.paused === true,
    players: view.roster.length > 0 ? view.roster.length : null,
    endsAt: view.endsAt ?? null,
    startsAt: Number.isFinite(startsAt) ? startsAt : null,
    skewMs: view.now - deviceNow,
  }
}

export function statusLine(s: HomeStatus, deviceNow: number): { title: string; detail: string; live: boolean } {
  const title = s.phase === 'ended' ? 'see results' : s.phase === 'lobby' ? 'back to the lobby' : 'reconnect'
  let status: string
  if (s.paused) status = 'paused'
  else if (s.phase === 'lobby') status = s.players ? `lobby · ${s.players} players` : 'lobby'
  else if (s.phase === 'chasing' && s.endsAt !== null) {
    const min = Math.max(0, Math.ceil((s.endsAt - (deviceNow + s.skewMs)) / 60_000))
    status = `chasing · ${min} min left`
  } else status = s.phase
  const live = !s.paused && (s.phase === 'hiding' || s.phase === 'chasing')
  return { title, detail: `${s.code} · ${s.park} · ${status}`, live }
}

/** Milliseconds until the planned start, by the server's clock; null unless the game is in its lobby with one set. */
export function startsIn(s: HomeStatus, deviceNow: number): number | null {
  if (s.phase !== 'lobby' || s.startsAt === null) return null
  return s.startsAt - (deviceNow + s.skewMs)
}
