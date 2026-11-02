import { alertLeadFor, checkedIn } from './checkins.js'
import { alertsFrom, type Alert, type ReportReason } from './alerts.js'
import { BONUS_SEQ_BASE, chaseStartOf, MINUTE_MS, nextReveal, phaseAt, pingTimes } from './clock.js'
import { distanceM, fuzz } from './geo.js'
import { cardsLeft, deckFor, setsFor } from './deck.js'
import { MOMENT_WINDOW_MS } from './moments.js'
import { POWER_NAME } from './powerNames.js'
import { activeShield, decoySpot, flareBlocked, SHIELD_MS, slotBusy } from './powerups.js'
import type { Arena, Game, GameEvent, LatLng, Phase, Ping, Player, Position, PowerUp, PowerUpKind, Results, Role, Settings } from './types.js'

/** Spec §4.5–4.6 constants. */
export const FUZZ_RADIUS_M = 15
export const NEARBY_M = 100
export const FRESH_MS = 60_000
/** Focus shows runners this close to the chaser exactly. */
export const FOCUS_M = 75
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
  /** Exact specifically because of Pak Guard's Focus; null for every other dot. */
  revealedBy: 'focus' | null
  at: string
  /**
   * Set only for a runner just caught or auto-jailed, within the slide-off window (`MOMENT_WINDOW_MS` of
   * `caught_at`) — their last known position, for a one-shot client-side slide to Penjara before they
   * disappear for good. Absent for every other dot.
   */
  caughtAt?: string
}

export interface RosterEntry {
  id: string
  name: string
  role: Role | null
  tag_id: number | null
  jailed: boolean
}

/** A report made once the game had already ended; marshal/organiser-only, for the inbox's After game tab. */
export interface PostGameReport {
  id: string
  at: string
  name: string
  targetName: string
  reason: ReportReason
  note: string
}

/** A player's "how fun was it?" rating; marshal/organiser-only, for the inbox's After game tab. */
export interface PostGameRating {
  id: string
  at: string
  name: string
  rating: number
  note: string
}

export interface View {
  phase: Phase
  endsAt: number | null
  now: number
  /** A marshal has paused the game: every countdown is frozen. */
  paused: boolean
  /** Safety alerts: for marshals and the organiser only. */
  alerts: Alert[]
  /** Live position of each player with a currently open SOS; marshal-only, empty otherwise. */
  sosPositions: Record<string, LatLng>
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
  /** Why I'm in Penjara: caught by a chaser, or auto-jailed for missing two check-ins. */
  jailReason: 'caught' | 'missed-checkins' | null
  /** My running Durian's end time; null for effects that wait for the next ping (motion design §7b). */
  activeEndsAt: number | null
  /** A chaser holding Mat Rempit while the team waits: when it unlocks (power-ups design §5a). */
  flareReadyAt: number | null
  /** Auto-jailed: the scheduled check-ins that sent me to Penjara (reveal times, oldest first). */
  jailCheckins: { at: number; ok: boolean }[] | null
  /** A free runner's standing for the next scheduled ping during the chase; null otherwise. */
  checkin: Checkin | null
  feed: FeedItem[]
  counts: { runnersFree: number; runnersJailed: number; chasers: number }
  /** Everyone in the game: shown in the lobby and to marshals; empty for players mid-game. */
  roster: RosterEntry[]
  /** Reports filed once the game had already ended; marshals and the organiser only, for the After game tab. */
  reports: PostGameReport[]
  /** "How fun was it?" ratings; marshals and the organiser only, for the After game tab. */
  ratings: PostGameRating[]
  /** Power-up stations, numbered from 1. */
  stations: { n: number; lat: number; lng: number }[]
  /** My unused power-ups. */
  hand: PowerUp[]
  shieldActive: boolean
  /** Cards left in my side's shared deck (power-ups §5b); null for marshals and the organiser. */
  deckLeft: number | null
  /** My power-up whose effect is still running, which keeps my one slot busy (§5a). */
  activePowerUp: PowerUpKind | null
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
/**
 * A feed line (motion design §8.2): what happened, then what it means for the viewer's side, whether it
 * needs them to act now, and a short label for the ticker. Marshals and the organiser get no meaning.
 */
export interface FeedItem {
  at: string
  text: string
  means: string | null
  act: boolean
  label: string | null
}

export interface Checkin {
  state: 'early' | 'open' | 'in' | 'missed'
  alertAt: number
  revealAt: number
  /** 1 when the last scheduled ping that counted for me was missed. A second miss auto-jails, so never 2. */
  missedInRow: 0 | 1
}

export const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const tagLabel = (p: Player) => (p.tag_id === null ? p.name : `#${String(p.tag_id).padStart(2, '0')}`)

export function latestAtOrBefore(list: Position[] | undefined, t: number): Position | undefined {
  if (!list) return undefined
  let found: Position | undefined
  for (const p of list) if (Date.parse(p.at) <= t) found = p
  return found
}

function dotFor(p: Player, at: Position, kind: MapDot['kind']): MapDot {
  return { id: p.id, kind, lat: at.lat, lng: at.lng, at: at.at, label: p.role === 'runner' ? tagLabel(p) : p.name, revealedBy: null }
}

function kindOf(p: Player, me: Player): MapDot['kind'] {
  if (p.id === me.id) return 'me'
  if (p.role === 'chaser') return 'chaser'
  if (p.role === 'marshal') return 'marshal'
  return 'runner'
}

/**
 * A runner just caught or auto-jailed (`caught_at` within `MOMENT_WINDOW_MS` of real wall-clock `now`) still
 * gets a dot at their last known position, so the client can play a one-shot slide to Penjara before they
 * disappear for good. Not a general exception: a runner whose jailing has been undone (`jailed` back to
 * `false`, e.g. a marshal's auto-jail undo) falls out immediately, even mid-window. Always uses the real
 * `now` — never a function-local, possibly-delayed time — because the slide-off is a real-time UI moment,
 * independent of the spectator-delay mechanic some callers apply to everything else.
 */
function slidingDot(p: Player, i: ViewInput, kind: MapDot['kind']): MapDot | null {
  if (!p.jailed || !p.caught_at) return null
  const caughtAt = Date.parse(p.caught_at)
  if (!(i.now - caughtAt >= 0 && i.now - caughtAt < MOMENT_WINDOW_MS)) return null
  const at = latestAtOrBefore(i.positions[p.id], i.now)
  if (!at) return null
  return { ...dotFor(p, at, kind), caughtAt: p.caught_at }
}

/** Everyone's position as of time `t` (marshals live; jailed spectators delayed). */
function everyoneAt(i: ViewInput, t: number): MapDot[] {
  const dots: MapDot[] = []
  for (const p of i.players) {
    if (p.role === 'runner' && p.jailed && p.id !== i.me.id) {
      const sliding = slidingDot(p, i, kindOf(p, i.me))
      if (sliding) dots.push(sliding)
      continue
    }
    const at = latestAtOrBefore(i.positions[p.id], t)
    if (at) dots.push(dotFor(p, at, kindOf(p, i.me)))
  }
  return dots
}

/** Live position of each player with a currently open SOS, keyed by that player's id (not the alert id). */
function sosPositionsFor(i: ViewInput): Record<string, LatLng> {
  const result: Record<string, LatLng> = {}
  const open = alertsFrom(i.events).filter((a) => a.kind === 'sos' && !a.handled)
  for (const alert of open) {
    const sent = i.events.find((e) => e.id === alert.id)
    const senderId = sent?.actor_id
    if (!senderId) continue
    const at = latestAtOrBefore(i.positions[senderId], i.now)
    if (at) result[senderId] = { lat: at.lat, lng: at.lng }
  }
  return result
}

/** Reports filed after the game had already ended (ones filed mid-game already surface via `alerts`). */
function postGameReportsFor(i: ViewInput): PostGameReport[] {
  if (i.me.role !== 'marshal' || !i.game.ended_at) return []
  const endedAt = Date.parse(i.game.ended_at)
  return i.events
    .filter((e) => e.type === 'report' && Date.parse(e.at) >= endedAt)
    .map((e) => ({
      id: e.id,
      at: e.at,
      name: String(e.data.name ?? ''),
      targetName: String(e.data.targetName ?? ''),
      reason: (e.data.reason as ReportReason) ?? 'other',
      note: String(e.data.note ?? ''),
    }))
}

/** Every "how fun was it?" rating; only ever submitted post-game, so no time filter needed. */
function ratingsFor(i: ViewInput): PostGameRating[] {
  if (i.me.role !== 'marshal') return []
  return i.events
    .filter((e) => e.type === 'rated')
    .map((e) => ({ id: e.id, at: e.at, name: String(e.data.name ?? ''), rating: Number(e.data.rating ?? 0), note: String(e.data.note ?? '') }))
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
  const alertAt =
    last.seq >= BONUS_SEQ_BASE
      ? Date.parse(last.alert_at)
      : (pingTimes(i.game, i.now).find((t) => t.seq === last.seq)?.alertAt ?? revealAt - alertLeadFor(last.seq))
  const prev = revealed[revealed.length - 2]
  const prevAt = prev ? Date.parse(prev.reveal_at) : (chaseStartOf(i.game, i.now) ?? revealAt)

  const cloaked = new Set(landingAt(i, 'cloak', revealAt, prevAt).map((u) => u.player_id))
  const decoyed = new Set(landingAt(i, 'decoy', revealAt, prevAt).map((u) => u.player_id))
  const focusers = landingAt(i, 'focus', revealAt, prevAt)
    .map((u) => latestAtOrBefore(i.positions[u.player_id], revealAt))
    .filter((p): p is Position => !!p)

  for (const p of i.players) {
    if (p.role !== 'runner') continue
    if (p.jailed) {
      const sliding = slidingDot(p, i, 'runner')
      if (sliding) dots.push(sliding)
      continue
    }
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
      const spot = decoySpot(at, i.game.arena, seed)
      dot = focused
        ? { ...dotFor(p, at, 'runner'), ...spot, exact: true, revealedBy: 'focus' }
        : { ...dotFor(p, at, 'runner'), ...spot, fuzzy: true }
    } else if (focused) {
      dot = { ...dotFor(p, at, 'runner'), exact: true, revealedBy: 'focus' }
    } else {
      dot = { ...dotFor(p, at, 'runner'), ...fuzz(at, FUZZ_RADIUS_M, seed), fuzzy: true }
    }
    // Missed = no location inside this ping's check-in window (45 s scheduled, 30 s bonus).
    if (!checkedIn(alertAt, revealAt, Date.parse(at.at))) dot.missed = true
    dots.push(dot)
  }
  return { dots, notes }
}

function runnerDots(i: ViewInput): { dots: MapDot[]; nearby: boolean } {
  const dots: MapDot[] = []
  for (const p of i.players) {
    if (p.role !== 'runner') continue
    if (p.jailed) {
      const sliding = slidingDot(p, i, 'teammate')
      if (sliding) dots.push(sliding)
      continue
    }
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

function deckLeftFor(i: ViewInput): number | null {
  const side = i.me.role
  if (side !== 'runner' && side !== 'chaser') return null
  const stored = side === 'runner' ? i.game.runner_sets : i.game.chaser_sets
  const sets = stored ?? setsFor(side, i.players.filter((p) => p.role === side).length)
  const draws = (side === 'runner' ? i.game.runner_draws : i.game.chaser_draws) ?? 0
  return cardsLeft(deckFor(i.game.settings.mode ?? 'core', side, sets).length, draws)
}

/**
 * Same window and since-release rule as auto-jail (checkedIn, pingTimes, freed_at), so the banner never
 * says "Checked in" for a ping the server will count as missed.
 */
function checkinFor(i: ViewInput, phase: Phase): Checkin | null {
  if (i.me.role !== 'runner' || i.me.jailed || phase !== 'chasing') return null
  const times = pingTimes(i.game, i.now)
  const next = times.find((t) => t.revealAt > i.now)
  if (!next) return null
  const mine = i.positions[i.me.id]
  const lastAt = (t: number) => {
    const at = latestAtOrBefore(mine, t)
    return at ? Date.parse(at.at) : null
  }
  const prev = times.filter((t) => t.revealAt <= i.now).at(-1)
  const since = Math.max(chaseStartOf(i.game, i.now)!, i.me.freed_at ? Date.parse(i.me.freed_at) : -Infinity)
  const missedInRow = prev && prev.alertAt >= since && !checkedIn(prev.alertAt, prev.revealAt, lastAt(prev.revealAt)) ? 1 : 0
  const state = checkedIn(next.alertAt, next.revealAt, lastAt(i.now))
    ? 'in'
    : i.now >= next.alertAt
      ? 'open'
      : missedInRow
        ? 'missed'
        : 'early'
  return { state, alertAt: next.alertAt, revealAt: next.revealAt, missedInRow }
}

function jailCheckinsFor(i: ViewInput, reason: View['jailReason']): View['jailCheckins'] {
  if (reason !== 'missed-checkins') return null
  const latest = i.events.filter((e) => e.type === 'auto-jailed' && e.target_id === i.me.id).at(-1)
  const list = Array.isArray(latest?.data.checkins) ? (latest.data.checkins as { revealAt: number; ok: boolean }[]) : []
  return list.map((c) => ({ at: c.revealAt, ok: c.ok }))
}

function jailReasonFor(i: ViewInput): View['jailReason'] {
  if (!i.me.jailed) return null
  if (i.me.caught_by) return 'caught'
  const latest = i.events
    .filter((e) => (e.type === 'caught' || e.type === 'auto-jailed') && e.target_id === i.me.id)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return latest?.type === 'auto-jailed' ? 'missed-checkins' : 'caught'
}

interface FeedContext {
  meId: string
  side: 'runner' | 'chaser' | null
  freeNow: number
  jailedNow: number
}

type Line = Omit<FeedItem, 'at'>
const plain = (text: string): Line => ({ text, means: null, act: false, label: null })

/** The two-part lines (motion §8.2). Runner power-up uses never appear, so nothing secret leaks. */
function feedLine(e: GameEvent, byId: Map<string, Player>, ctx: FeedContext): Line | null {
  const actor = e.actor_id ? byId.get(e.actor_id) : undefined
  const target = e.target_id ? byId.get(e.target_id) : undefined
  const tag = target ? tagLabel(target) : 'A Dikejar'
  const two = (text: string, label: string, dikejar: string, kejar: string, actFor: 'runner' | null = null): Line => ({
    text,
    label,
    means: ctx.side === 'runner' ? dikejar : ctx.side === 'chaser' ? kejar : null,
    act: actFor !== null && ctx.side === actFor,
  })
  switch (e.type) {
    case 'ping': {
      const seen = Number(e.data.seen ?? 0)
      const missed = Number(e.data.missed ?? 0)
      const tail = missed > 0 ? `, ${missed} missed check-in${missed === 1 ? '' : 's'}` : ''
      return two(`Ping: ${seen} Dikejar seen${tail}.`, 'PING', 'Kejar now know roughly where you were.', 'Fresh circles are on your map.')
    }
    case 'used':
      if (e.data.kind === 'flare')
        return two('A Kejar used Mat Rempit.', 'Mat Rempit', 'Check in now. An extra ping lands in 30 s.', 'Extra ping in 30 s. Get close to the circles.', 'runner')
      if (e.data.kind === 'focus')
        return two(
          'A Kejar used Pak Guard.',
          'Pak Guard',
          'At the next ping, anyone within 75 m of that Kejar shows exactly. Move away.',
          'Next ping shows Dikejar near them exactly.',
          'runner',
        )
      return null
    case 'stolen': {
      // The feed never says who stole or who lost; only the player who lost the card is told what it was.
      const thief = e.data.kind === 'along' ? 'Ah Long' : 'Toyol'
      if (e.target_id && e.target_id === ctx.meId) {
        const taken = POWER_NAME[e.data.takenKind as PowerUpKind] as string | undefined
        return plain(`${thief} took your ${taken ?? 'power-up'}!`)
      }
      return plain(thief === 'Ah Long' ? 'Ah Long came to collect!' : 'Toyol stole a power-up!')
    }
    case 'caught':
      if (!actor || !target) return plain('A Dikejar was caught.')
      return two(`${actor.name} caught ${tag}.`, 'CATCH', `${tag} is walking to Penjara. ${ctx.freeNow} Dikejar still free.`, `Nice. ${ctx.freeNow} Dikejar left to find.`)
    case 'shielded':
      return two(`${tag} blocked a catch with Durian.`, 'Durian', `${tag} is still free. Their Durian is used up.`, `That catch didn't count. ${tag} has no Durian now.`)
    case 'jailbreak': {
      const n = Number(e.data.freed ?? 0)
      return two(
        `${actor?.name ?? 'A Dikejar'} freed ${n} Dikejar from Penjara.`,
        'FREE',
        ctx.jailedNow === 0 ? 'Penjara is empty again.' : `${ctx.jailedNow} still inside.`,
        `${n} more Dikejar ${n === 1 ? 'is' : 'are'} loose near Penjara.`,
      )
    }
    case 'auto-jailed':
      return two(
        `${tag} missed 2 check-ins in a row.`,
        '2×',
        `${tag} went to Penjara. Check in when your phone buzzes, or you're next.`,
        `One less to find. ${tag} is in Penjara.`,
      )
    default: {
      const text = feedText(e, byId)
      return text ? plain(text) : null
    }
  }
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
      return `${actor?.name ?? 'A runner'} broke ${count(Number(e.data.freed ?? 0), 'runner')} out of Penjara`
    case 'ended':
      return 'Game over'
    case 'powerup':
      return actor ? `${actor.name} picked up a power-up` : null
    case 'used':
      // Runner power-ups stay secret; chasers' ones are announced.
      if (e.data.kind === 'flare') return 'A Kejar used Mat Rempit — extra ping in 30 s'
      if (e.data.kind === 'focus') return 'A Kejar used Pak Guard'
      return null
    case 'shielded':
      return target ? `${tagLabel(target)} blocked a catch with Durian` : 'A Dikejar blocked a catch with Durian'
    case 'paused':
      return 'Game paused by a marshal'
    case 'resumed':
      return 'Game resumed'
    case 'removed':
      return `${String(e.data.name ?? 'A player')} left the game`
    case 'auto-jail-undone':
      return target ? `${tagLabel(target)} is back in the game (marshal)` : 'A runner is back in the game (marshal)'
    case 'auto-jailed':
      return target ? `${tagLabel(target)} missed 2 check-ins — sent to Penjara` : 'A runner missed 2 check-ins — sent to Penjara'
    default:
      return null
  }
}

export function viewFor(i: ViewInput): View {
  const v = fullView(i)
  // A removed player's page keeps polling: give it nothing of the game (spec §5.1).
  if (i.me.removed_at) {
    return { ...v, dots: [], feed: [], alerts: [], sosPositions: {}, roster: [], reportable: [], stations: [], hand: [], chaserNearby: false, caughtBy: null, jailReason: null, activeEndsAt: null, flareReadyAt: null, jailCheckins: null, checkin: null, deckLeft: null, activePowerUp: null, reports: [], ratings: [] }
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

  const runnersNow = i.players.filter((p) => p.role === 'runner')
  const feedContext: FeedContext = {
    meId: i.me.id,
    side: i.me.role === 'runner' || i.me.role === 'chaser' ? i.me.role : null,
    freeNow: runnersNow.filter((p) => !p.jailed).length,
    jailedNow: runnersNow.filter((p) => p.jailed).length,
  }
  // Newest first; events recorded in the same millisecond keep their recorded order (later first).
  const feed = [
    ...i.events.flatMap((e) => {
      const line = feedLine(e, byId, feedContext)
      return line ? [{ at: e.at, ...line }] : []
    }),
    ...notes.map((n) => ({ ...n, means: null, act: false, label: null })),
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
    sosPositions: role === 'marshal' ? sosPositionsFor(i) : {},
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
    jailReason: jailReasonFor(i),
    activeEndsAt: (() => {
      const shield = activeShield(i.powerUps, i.me.id, i.now)
      return shield?.used_at ? Date.parse(shield.used_at) + SHIELD_MS : null
    })(),
    flareReadyAt: (() => {
      const holding = i.powerUps.some((u) => u.player_id === i.me.id && u.kind === 'flare' && u.used_at === null && u.taken_at === null)
      const blocked = holding ? flareBlocked(i.pings, i.now) : null
      return blocked ? i.now + blocked.readyInMs : null
    })(),
    jailCheckins: jailCheckinsFor(i, jailReasonFor(i)),
    checkin: checkinFor(i, phase),
    feed,
    counts: {
      runnersFree: runners.filter((p) => !p.jailed).length,
      runnersJailed: runners.filter((p) => p.jailed).length,
      chasers: i.players.filter((p) => p.role === 'chaser').length,
    },
    roster: showRoster
      ? i.players.map((p) => ({ id: p.id, name: p.name, role: p.role, tag_id: p.tag_id, jailed: p.jailed }))
      : [],
    reports: postGameReportsFor(i),
    ratings: ratingsFor(i),
    stations: (i.game.arena.stations ?? []).map((s, k) => ({ n: k + 1, lat: s.lat, lng: s.lng })),
    hand: i.powerUps.filter((u) => u.player_id === i.me.id && u.used_at === null && u.taken_at === null),
    shieldActive: activeShield(i.powerUps, i.me.id, i.now) !== null,
    deckLeft: deckLeftFor(i),
    activePowerUp: (() => {
      const busy = slotBusy(i.powerUps, i.me.id, i.pings, i.now)
      return busy?.running ? busy.kind : null
    })(),
    results: i.results,
  }
}
