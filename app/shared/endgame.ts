import { countRestartAt } from './checkins.js'
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
 * on; Banjir Kilat never rolls, whatever its switch says.
 */
export function rollEndgame(s: Settings, rng: () => number): EndgameKind | null {
  const on = endgamesOf(s)
  if (s.mode === 'core') return on.bomba === 'on' ? 'bomba' : null
  const kinds = (['bomba', 'hebat', 'pkp'] as const).filter((k) => on[k] === 'on')
  return kinds.length ? kinds[Math.floor(rng() * kinds.length)]! : null
}

/**
 * True when the endgame should be revealed now: mid-chase, not paused, no final whistle pending, not revealed yet,
 * and at or under the kind's time left. Same shape as `fiveLeftDue`. A game that starts its chase inside that
 * window is due straight away.
 */
export function revealDue(game: Game, now: number): boolean {
  const e = game.endgame
  if (!e || e.revealedAt || e.kind === 'banjir') return false
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
 * Who Hang Hebat puts the bounty on: the free runner who has gone longest without being caught, whose free stretch
 * started earliest. A stretch starts at `chaseStart` or at their latest release (`countRestartAt` covers Penjara and
 * house arrest; an undone catch never moved `freed_at`). Ties go to the lowest tag id.
 */
export function pickWanted(players: Player[], events: GameEvent[], chaseStart: number, except?: string): Player | null {
  const stretchStart = (p: Player) => {
    const at = countRestartAt(p, events)
    return at ? Math.max(chaseStart, Date.parse(at)) : chaseStart
  }
  const pool = players.filter((p) => p.role === 'runner' && !p.removed_at && !wantedOut(p) && p.id !== except)
  pool.sort((a, b) => stretchStart(a) - stretchStart(b) || (a.tag_id ?? Infinity) - (b.tag_id ?? Infinity))
  return pool[0] ?? null
}

/** The same game with the endgame hidden until it is revealed, so no client learns it early. */
export function maskEndgame<G extends Pick<Game, 'endgame'>>(game: G): G {
  return revealed(game) ? game : { ...game, endgame: null }
}
