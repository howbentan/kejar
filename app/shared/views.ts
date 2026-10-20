import { chaseStartOf, MINUTE_MS, phaseAt, pingTimes } from './clock.js'
import { distanceM, fuzz } from './geo.js'
import type { Arena, Game, GameEvent, Phase, Ping, Player, Position, Results, Role, Settings } from './types.js'

/** Spec §4.5–4.6 constants. */
export const FUZZ_RADIUS_M = 15
export const NEARBY_M = 100
export const FRESH_MS = 60_000
const FEED_MAX = 20

export interface MapDot {
  id: string
  kind: 'me' | 'runner' | 'chaser' | 'marshal' | 'teammate'
  lat: number
  lng: number
  label?: string
  fuzzy?: boolean
  missed?: boolean
  at: string
}

export interface RosterEntry {
  id: string
  name: string
  role: Role | null
  tag_id: number | null
  jailed: boolean
}

export interface View {
  phase: Phase
  endsAt: number | null
  now: number
  me: Player
  arena: Arena
  settings: Settings
  dots: MapDot[]
  nextRevealAt: number | null
  nextAlertAt: number | null
  chaserNearby: boolean
  feed: { at: string; text: string }[]
  counts: { runnersFree: number; runnersJailed: number; chasers: number }
  /** Everyone in the game: shown in the lobby and to marshals; empty for players mid-game. */
  roster: RosterEntry[]
  results: Results | null
}

export interface ViewInput {
  game: Game
  me: Player
  players: Player[]
  positions: Record<string, Position[]>
  pings: Ping[]
  events: GameEvent[]
  now: number
  results: Results | null
}

const tagLabel = (p: Player) => (p.tag_id === null ? p.name : `#${String(p.tag_id).padStart(2, '0')}`)

function latestAtOrBefore(list: Position[] | undefined, t: number): Position | undefined {
  if (!list) return undefined
  let found: Position | undefined
  for (const p of list) if (Date.parse(p.at) <= t) found = p
  return found
}

function dotFor(p: Player, at: Position, kind: MapDot['kind']): MapDot {
  return { id: p.id, kind, lat: at.lat, lng: at.lng, at: at.at, label: p.role === 'runner' ? tagLabel(p) : p.name }
}

function kindOf(p: Player, me: Player): MapDot['kind'] {
  if (p.id === me.id) return 'me'
  if (p.role === 'chaser') return 'chaser'
  if (p.role === 'marshal') return 'marshal'
  return 'runner'
}

/** Everyone's position as of time `t` (marshals live; jailed spectators delayed). */
function everyoneAt(i: ViewInput, t: number): MapDot[] {
  const dots: MapDot[] = []
  for (const p of i.players) {
    if (p.role === 'runner' && p.jailed && p.id !== i.me.id) continue
    const at = latestAtOrBefore(i.positions[p.id], t)
    if (at) dots.push(dotFor(p, at, kindOf(p, i.me)))
  }
  return dots
}

function chaserDots(i: ViewInput): { dots: MapDot[]; notes: { at: string; text: string }[] } {
  const dots: MapDot[] = []
  const notes: { at: string; text: string }[] = []
  for (const p of i.players) {
    if (p.role === 'chaser') {
      const at = latestAtOrBefore(i.positions[p.id], i.now)
      if (at) dots.push(dotFor(p, at, p.id === i.me.id ? 'me' : 'chaser'))
    }
  }
  const revealed = i.pings.filter((p) => p.revealed && p.seq > 0).sort((a, b) => a.seq - b.seq)
  const last = revealed[revealed.length - 1]
  if (!last) return { dots, notes }
  const revealAt = Date.parse(last.reveal_at)
  const prev = revealed[revealed.length - 2]
  const prevAt = prev ? Date.parse(prev.reveal_at) : (chaseStartOf(i.game) ?? revealAt)
  for (const p of i.players) {
    if (p.role !== 'runner' || p.jailed) continue
    const at = latestAtOrBefore(i.positions[p.id], revealAt)
    if (!at) {
      notes.push({ at: last.reveal_at, text: `${tagLabel(p)} never checked in` })
      continue
    }
    const spot = fuzz(at, FUZZ_RADIUS_M, `${p.id}:${last.seq}`)
    const dot: MapDot = { ...dotFor(p, at, 'runner'), ...spot, fuzzy: true }
    if (Date.parse(at.at) < prevAt) dot.missed = true
    dots.push(dot)
  }
  return { dots, notes }
}

function runnerDots(i: ViewInput): { dots: MapDot[]; nearby: boolean } {
  const dots: MapDot[] = []
  for (const p of i.players) {
    if (p.role !== 'runner' || p.jailed) continue
    const at = latestAtOrBefore(i.positions[p.id], i.now)
    if (at) dots.push(dotFor(p, at, p.id === i.me.id ? 'me' : 'teammate'))
  }
  const mine = latestAtOrBefore(i.positions[i.me.id], i.now)
  const fresh = (p: Position) => i.now - Date.parse(p.at) < FRESH_MS
  const nearby =
    !!mine &&
    fresh(mine) &&
    i.players.some((p) => {
      if (p.role !== 'chaser') return false
      const c = latestAtOrBefore(i.positions[p.id], i.now)
      return !!c && fresh(c) && distanceM(c, mine) <= NEARBY_M
    })
  return { dots, nearby }
}

function feedText(e: GameEvent, byId: Map<string, Player>): string | null {
  const actor = e.actor_id ? byId.get(e.actor_id) : undefined
  const target = e.target_id ? byId.get(e.target_id) : undefined
  switch (e.type) {
    case 'joined':
      return actor ? `${actor.name} joined` : null
    case 'roles':
      return 'Roles assigned'
    case 'started':
      return 'Game started — runners, go hide!'
    case 'chase':
      return 'Chasers released'
    case 'ping':
      return `Ping — ${Number(e.data.seen ?? 0)} runners seen`
    case 'caught':
      return target && actor ? `${tagLabel(target)} caught by ${actor.name}` : 'A runner was caught'
    case 'jailbreak':
      return `${actor?.name ?? 'A runner'} broke ${Number(e.data.freed ?? 0)} runners out of jail`
    case 'ended':
      return 'Game over'
  }
}

export function viewFor(i: ViewInput): View {
  const { phase, endsAt } = phaseAt(i.game, i.now)
  const byId = new Map(i.players.map((p) => [p.id, p]))
  const role = i.me.role
  const delayMs = i.game.settings.spectatorDelayMin * MINUTE_MS

  let dots: MapDot[] = []
  let chaserNearby = false
  let notes: { at: string; text: string }[] = []

  if (phase === 'lobby' || phase === 'ended') {
    const at = latestAtOrBefore(i.positions[i.me.id], i.now)
    if (at) dots = [dotFor(i.me, at, 'me')]
  } else if (role === 'marshal') {
    dots = everyoneAt(i, i.now)
  } else if (role === 'runner' && i.me.jailed) {
    dots = everyoneAt(i, i.now - delayMs)
  } else if (role === 'chaser') {
    ;({ dots, notes } = chaserDots(i))
  } else if (role === 'runner') {
    const r = runnerDots(i)
    dots = r.dots
    chaserNearby = r.nearby
  }

  const upcoming = phase === 'hiding' || phase === 'chasing' ? pingTimes(i.game).find((t) => t.revealAt > i.now) : undefined

  const feed = [
    ...i.events.flatMap((e) => {
      const text = feedText(e, byId)
      return text ? [{ at: e.at, text }] : []
    }),
    ...notes,
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, FEED_MAX)

  const runners = i.players.filter((p) => p.role === 'runner')
  const showRoster = phase === 'lobby' || role === 'marshal'

  return {
    phase,
    endsAt,
    now: i.now,
    me: i.me,
    arena: i.game.arena,
    settings: i.game.settings,
    dots,
    nextRevealAt: upcoming?.revealAt ?? null,
    nextAlertAt: upcoming?.alertAt ?? null,
    chaserNearby,
    feed,
    counts: {
      runnersFree: runners.filter((p) => !p.jailed).length,
      runnersJailed: runners.filter((p) => p.jailed).length,
      chasers: i.players.filter((p) => p.role === 'chaser').length,
    },
    roster: showRoster
      ? i.players.map((p) => ({ id: p.id, name: p.name, role: p.role, tag_id: p.tag_id, jailed: p.jailed }))
      : [],
    results: i.results,
  }
}
