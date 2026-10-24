import { alertsFrom, type Alert } from './alerts.js'
import { chaseStartOf, MINUTE_MS, nextReveal, phaseAt } from './clock.js'
import { distanceM, fuzz } from './geo.js'
import { activeShield, decoySpot } from './powerups.js'
import type { Arena, Game, GameEvent, Phase, Ping, Player, Position, PowerUp, Results, Role, Settings } from './types.js'

/** Spec §4.5–4.6 constants. */
export const FUZZ_RADIUS_M = 15
export const NEARBY_M = 100
export const FRESH_MS = 60_000
/** Focus shows runners this close to the chaser exactly. */
export const FOCUS_M = 150
const FEED_MAX = 20

export interface MapDot {
  id: string
  kind: 'me' | 'runner' | 'chaser' | 'marshal' | 'teammate'
  lat: number
  lng: number
  label?: string
  fuzzy?: boolean
  missed?: boolean
  /** Shown at the true spot because of a chaser's Focus. */
  exact?: true
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
  /** A marshal has paused the game: every countdown is frozen. */
  paused: boolean
  /** Safety alerts: for marshals and the organiser only. */
  alerts: Alert[]
  /** Everyone I could report. */
  reportable: { id: string; name: string }[]
  me: Player
  arena: Arena
  settings: Settings
  dots: MapDot[]
  nextRevealAt: number | null
  nextAlertAt: number | null
  /** When the most recent ping revealed runners to chasers (drives the "you've been pinged" moment). */
  lastRevealAt: number | null
  chaserNearby: boolean
  /** Name of the chaser who caught me, while I'm jailed. */
  caughtBy: string | null
  feed: { at: string; text: string }[]
  counts: { runnersFree: number; runnersJailed: number; chasers: number }
  /** Everyone in the game: shown in the lobby and to marshals; empty for players mid-game. */
  roster: RosterEntry[]
  /** Power-up stations, numbered from 1. */
  stations: { n: number; lat: number; lng: number }[]
  /** My unused power-ups. */
  hand: PowerUp[]
  shieldActive: boolean
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
  powerUps: PowerUp[]
}

/** '1 runner', '3 runners'. */
export const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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

/** Revealed pings in time order (bonus Flare pings are numbered out of order). */
function revealedPings(pings: Ping[]): Ping[] {
  return pings.filter((p) => p.revealed && p.seq > 0).sort((a, b) => Date.parse(a.reveal_at) - Date.parse(b.reveal_at))
}

/** Power-ups of `kind` whose effect lands on this reveal: the first reveal at or after they were used. */
function landingAt(i: ViewInput, kind: PowerUp['kind'], revealAt: number, prevRevealAt: number): PowerUp[] {
  return i.powerUps.filter((u) => {
    if (u.kind !== kind || !u.used_at) return false
    const usedAt = Date.parse(u.used_at)
    return usedAt <= revealAt && usedAt > prevRevealAt
  })
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
  const revealed = revealedPings(i.pings)
  const last = revealed[revealed.length - 1]
  if (!last) return { dots, notes }
  const revealAt = Date.parse(last.reveal_at)
  const prev = revealed[revealed.length - 2]
  const prevAt = prev ? Date.parse(prev.reveal_at) : (chaseStartOf(i.game, i.now) ?? revealAt)

  const cloaked = new Set(landingAt(i, 'cloak', revealAt, prevAt).map((u) => u.player_id))
  const decoyed = new Set(landingAt(i, 'decoy', revealAt, prevAt).map((u) => u.player_id))
  const focusers = landingAt(i, 'focus', revealAt, prevAt)
    .map((u) => latestAtOrBefore(i.positions[u.player_id], revealAt))
    .filter((p): p is Position => !!p)

  for (const p of i.players) {
    if (p.role !== 'runner' || p.jailed) continue
    const at = latestAtOrBefore(i.positions[p.id], revealAt)
    // A cloaked runner must look exactly like one who never checked in.
    if (!at || cloaked.has(p.id)) {
      notes.push({ at: last.reveal_at, text: `${tagLabel(p)} never checked in` })
      continue
    }
    const seed = `${p.id}:${last.seq}`
    const focused = focusers.some((f) => distanceM(f, at) <= FOCUS_M)
    let dot: MapDot
    if (decoyed.has(p.id)) {
      // Drawn the same way as everyone else in range, so a Focus can't expose a Decoy.
      const spot = decoySpot(at, i.game.arena.boundary, seed)
      dot = focused ? { ...dotFor(p, at, 'runner'), ...spot, exact: true } : { ...dotFor(p, at, 'runner'), ...spot, fuzzy: true }
    } else if (focused) {
      dot = { ...dotFor(p, at, 'runner'), exact: true }
    } else {
      dot = { ...dotFor(p, at, 'runner'), ...fuzz(at, FUZZ_RADIUS_M, seed), fuzzy: true }
    }
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
      return `Ping — ${count(Number(e.data.seen ?? 0), 'runner')} seen`
    case 'caught':
      return target && actor ? `${tagLabel(target)} caught by ${actor.name}` : 'A runner was caught'
    case 'jailbreak':
      return `${actor?.name ?? 'A runner'} broke ${count(Number(e.data.freed ?? 0), 'runner')} out of jail`
    case 'ended':
      return 'Game over'
    case 'powerup':
      return actor ? `${actor.name} picked up a power-up` : null
    case 'used':
      // Runner power-ups stay secret; chasers' ones are announced.
      if (e.data.kind === 'flare') return 'Flare! Ping in 30 s'
      if (e.data.kind === 'focus') return 'A chaser used Focus'
      return null
    case 'shielded':
      return target ? `${tagLabel(target)} was shielded!` : 'A runner was shielded!'
    case 'paused':
      return 'Game paused by a marshal'
    case 'resumed':
      return 'Game resumed'
    case 'removed':
      return `${String(e.data.name ?? 'A player')} left the game`
    default:
      return null
  }
}

export function viewFor(i: ViewInput): View {
  const v = fullView(i)
  // A removed player's page keeps polling: give it nothing of the game (spec §5.1).
  if (i.me.removed_at) {
    return { ...v, dots: [], feed: [], alerts: [], roster: [], reportable: [], stations: [], hand: [], chaserNearby: false, caughtBy: null }
  }
  return v
}

function fullView(i: ViewInput): View {
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

  const lastReveal = revealedPings(i.pings).at(-1)
  const upcoming = phase === 'hiding' || phase === 'chasing' ? nextReveal(i.game, i.pings, i.now) : null

  // Newest first; events recorded in the same millisecond keep their recorded order (later first).
  const feed = [
    ...i.events.flatMap((e) => {
      const text = feedText(e, byId)
      return text ? [{ at: e.at, text }] : []
    }),
    ...notes,
  ]
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at) || b.order - a.order)
    .map(({ entry }) => entry)
    .slice(0, FEED_MAX)

  const runners = i.players.filter((p) => p.role === 'runner')
  const showRoster = phase === 'lobby' || phase === 'ended' || role === 'marshal'

  return {
    phase,
    endsAt,
    now: i.now,
    paused: !!i.game.paused_at,
    alerts: role === 'marshal' ? alertsFrom(i.events) : [],
    reportable: i.players.filter((p) => p.id !== i.me.id).map((p) => ({ id: p.id, name: p.name })),
    me: i.me,
    arena: i.game.arena,
    settings: i.game.settings,
    dots,
    nextRevealAt: upcoming?.revealAt ?? null,
    nextAlertAt: upcoming?.alertAt ?? null,
    lastRevealAt: lastReveal ? Date.parse(lastReveal.reveal_at) : null,
    chaserNearby,
    caughtBy: i.me.jailed && i.me.caught_by ? (byId.get(i.me.caught_by)?.name ?? null) : null,
    feed,
    counts: {
      runnersFree: runners.filter((p) => !p.jailed).length,
      runnersJailed: runners.filter((p) => p.jailed).length,
      chasers: i.players.filter((p) => p.role === 'chaser').length,
    },
    roster: showRoster
      ? i.players.map((p) => ({ id: p.id, name: p.name, role: p.role, tag_id: p.tag_id, jailed: p.jailed }))
      : [],
    stations: (i.game.arena.stations ?? []).map((s, k) => ({ n: k + 1, lat: s.lat, lng: s.lng })),
    hand: i.powerUps.filter((u) => u.player_id === i.me.id && u.used_at === null),
    shieldActive: activeShield(i.powerUps, i.me.id, i.now) !== null,
    results: i.results,
  }
}
