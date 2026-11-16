import { ENDGAME_LEFT_MS, phaseAt } from './clock.js'
import { isOut } from './players.js'
import type { EndgameKind, Game, GameEvent, Player, Settings } from './types.js'

/** Bomba's times live in clock.ts so `pingTimes` can read them without an import cycle. */
export { BOMBA_LEFT_MIN, ENDGAME_LEFT_MS } from './clock.js'

type Switches = NonNullable<Settings['endgames']>

/** The organiser's switches. A game stored before they existed has none, so it reads as all off. */
export function endgamesOf(s: Settings): Switches {
  return s.endgames ?? { bomba: 'off', hebat: 'off', pkp: 'off', banjir: 'off' }
}

/**
 * The endgame a new game gets, or null. Core only knows Bomba. Full picks evenly among the kinds that are switched
 * on: one endgame per game.
 */
export function rollEndgame(s: Settings, rng: () => number): EndgameKind | null {
  const on = endgamesOf(s)
  if (s.mode === 'core') return on.bomba === 'on' ? 'bomba' : null
  const kinds = (['bomba', 'hebat', 'pkp', 'banjir'] as const).filter((k) => on[k] === 'on')
  return kinds.length ? kinds[Math.floor(rng() * kinds.length)]! : null
}

/**
 * True when the endgame should be revealed now: mid-chase, not paused, no final whistle pending, not revealed yet,
 * and at or under the kind's time left. Same shape as `fiveLeftDue`. A game that starts its chase inside that
 * window is due straight away.
 */
export function revealDue(game: Game, now: number): boolean {
  const e = game.endgame
  if (!e || e.revealedAt) return false
  if (game.paused_at || game.final_whistle_at || game.ended_at) return false
  const { phase, endsAt } = phaseAt(game, now)
  return phase === 'chasing' && endsAt !== null && endsAt - now <= ENDGAME_LEFT_MS[e.kind]
}

/** The endgame is out in the open, and is this kind when one is given. */
export function revealed(game: Pick<Game, 'endgame'>, kind?: EndgameKind): boolean {
  const e = game.endgame
  return !!e?.revealedAt && (kind === undefined || e.kind === kind)
}

/** Hang Hebat is on and someone is wanted. */
export function hebatLive(game: Pick<Game, 'endgame'>): boolean {
  return revealed(game, 'hebat') && !!game.endgame!.wanted
}

/** Penjara is shut: PKP has been revealed. */
export function pkpClosed(game: Pick<Game, 'endgame'>): boolean {
  return revealed(game, 'pkp')
}

/** A runner who can't be the wanted one: out of the game, or held under Super Ring's house arrest. */
export function wantedOut(p: Player): boolean {
  return isOut(p) || !!p.arrest
}

/**
 * When a runner's current free stretch began, read from events (endgame design §8.1-8.2). An undone out never
 * happened, so it neither ends nor restarts a stretch: undo stamps `freed_at` and writes an `arrest-ended` 'undone',
 * which `countRestartAt` rightly counts for check-ins but which must not count here. The stretch starts at the first
 * real release after the runner's latest out that stands, or at `chaseStart` if they have never really been out.
 */
function stretchStartOf(p: Player, events: GameEvent[], chaseStart: number): number {
  const mine = events.filter((e) => e.target_id === p.id)
  // Outs a marshal took back: a catch or a Super Ring catch (`kejar-undone`), an auto-jail or Mak Kau Hijau jailing
  // (`auto-jail-undone`), and an arrest whose end says it was undone.
  const undoneIds = new Set(mine.filter((e) => e.type === 'kejar-undone' || e.type === 'auto-jail-undone').map((e) => e.data.eventId))
  const undoneArrests = new Set(mine.filter((e) => e.type === 'arrest-ended' && e.data.outcome === 'undone').map((e) => e.data.firedAt))
  const out = mine
    .filter((e) => e.type === 'caught' || e.type === 'auto-jailed' || e.type === 'arrested')
    .filter((e) => !undoneIds.has(e.id) && !(e.type === 'arrested' && undoneArrests.has(e.data.firedAt)))
    .at(-1)
  if (!out) return chaseStart
  const outAt = Date.parse(out.at)
  const after = (e: GameEvent) => Date.parse(e.at) > outAt
  // The end of a house arrest that let them go. `freed_at` covers Penjara (a jailbreak, the reel, a Settle), unless
  // an undo since overwrote it; then the release is the first one the feed shows after the out (a rescue or a
  // Settle frees by count, so the feed can't say whose; the runner is free now, so one of them freed them).
  const releases = mine.filter((e) => after(e) && e.type === 'arrest-ended' && e.data.outcome === 'free').map((e) => Date.parse(e.at))
  const overwritten = mine.some((e) => after(e) && (e.type === 'kejar-undone' || e.type === 'auto-jail-undone'))
  if (!overwritten) {
    if (p.freed_at && Date.parse(p.freed_at) > outAt) releases.push(Date.parse(p.freed_at))
  } else {
    const freeing = events.filter((e) => after(e) && (e.type === 'jailbreak' || e.type === 'settled' || (e.type === 'reel-free' && e.actor_id === p.id)))
    releases.push(...freeing.map((e) => Date.parse(e.at)))
  }
  return Math.max(chaseStart, releases.length ? Math.min(...releases) : outAt)
}

/**
 * Who Hang Hebat puts the bounty on: the free runner who has gone longest without being caught, whose free stretch
 * started earliest (`stretchStartOf`). Ties go to the lowest tag id.
 */
export function pickWanted(players: Player[], events: GameEvent[], chaseStart: number, except?: string): Player | null {
  const starts = new Map<string, number>()
  const stretchStart = (p: Player) => {
    if (!starts.has(p.id)) starts.set(p.id, stretchStartOf(p, events, chaseStart))
    return starts.get(p.id)!
  }
  const pool = players.filter((p) => p.role === 'runner' && !p.removed_at && !wantedOut(p) && p.id !== except)
  pool.sort((a, b) => stretchStart(a) - stretchStart(b) || (a.tag_id ?? Infinity) - (b.tag_id ?? Infinity))
  return pool[0] ?? null
}

/** The same game with the endgame hidden until it is revealed, so no client learns it early. */
export function maskEndgame<G extends Pick<Game, 'endgame'>>(game: G): G {
  return revealed(game) ? game : { ...game, endgame: null }
}
