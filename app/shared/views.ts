import { alertLeadFor, checkedIn, checkinsSince, countedCheckIn, countRestartAt, fairlyWarned } from './checkins.js'
import { alertsFrom, type Alert, type ReportReason } from './alerts.js'
import { BONUS_SEQ_BASE, chaseStartOf, MINUTE_MS, nextReveal, phaseAt, pingTimes } from './clock.js'
import { hebatLive, maskEndgame, revealed, rollEndgame } from './endgame.js'
import { FLOOD_GRACE_MS, floodNow, floodSteps, wetElapsed, wetSince, type FloodNow } from './flood.js'
import { distanceM, fuzz } from './geo.js'
import { cardsLeft, deckFor, setsFor } from './deck.js'
import { isTicked, kitOf, packItems, placeItems, SECRET_PACK_IDS, SECRET_PLACE_IDS, type KitItem, type PlaceItem } from './kit.js'
import { MOMENT_WINDOW_MS } from './moments.js'
import { legacyRescue, reelPulledThisStay, RESCUE_RESET_MS, rescueProgress } from './penjara.js'
import { isOut, undoableArrestId, undoableCatchId } from './players.js'
import { ARREST_OPEN_MS, arrestEndsAt } from './arrest.js'
import { hijauCounts, hijauTargets, penjaraLockLeft } from './hijau.js'
import { boxFor, legendaryOn, mirroredSpots, sideOf, TUPPER_SIDES } from './tupperware.js'
import { POWER_NAME } from './powerNames.js'
import { activeShield, comboReady, decoySpot, flareBlocked, frozenForMs, SHIELD_MS, shieldArmedAt, slotBusy, stationLockedUntil, TOLL_RADIUS_M } from './powerups.js'
import { placedStash, type Arena, type Game, type GameEvent, type LatLng, type LegendaryKind, type EndgameKind, type Phase, type PlacedStash, type Ping, type Player, type Position, type PowerUp, type PowerUpKind, type Results, type Role, type Settings, type TupperSide } from './types.js'

/** Spec §4.5–4.6 constants. */
export const FUZZ_RADIUS_M = 15
export const NEARBY_M = 100
export const FRESH_MS = 60_000
/** Checkins design §5.2: runners see chasers as fuzzy circles of about 30 m, twice the runners' 15 m. */
export const CHASER_SNAPSHOT_FUZZ_M = 30
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
  /** Shown at the true spot because of a chaser's Focus, Bomoh's team-wide reveal, a toll gate or a green tap. */
  exact?: true
  /** Hang Hebat: this runner is the wanted one. Set in the Kejar's, marshals' and spectators' views while it lasts. */
  wanted?: true
  /**
   * Exact specifically because of Pak Guard's Focus, Bomoh's reveal, Tee And Gee's gate, or tapping green in Mak Kau
   * Hijau (`hijau`: at the tapped spot, until the next ping reveal), or Bomba's last call (`lastcall`: every free
   * runner, whatever hid them); null for every other dot.
   */
  revealedBy: 'focus' | 'bomoh' | 'toll' | 'hijau' | 'lastcall' | null
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
  /** Luar Garisan: set once disqualified for leaving the play area twice. */
  disqualified_at?: string | null
  /** The catching chaser's name; null when auto-jailed for missed check-ins (or never caught). */
  caught_by?: string | null
  caught_at?: string | null
  freed_once?: boolean
  /** This person has push alerts on. Sent only in the organiser's and marshals' rosters. */
  pushOn?: boolean
  /**
   * The catch `Undo kejar` would undo (fair-play §1.4): this runner's latest catch while it still holds them, in
   * the chase, or the `arrested` event of a live house arrest a catch fired (Super Ring). Sent only in the
   * organiser's and marshals' rosters; null when there is nothing to undo.
   */
  undoKejarId?: string | null
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
  /** The organiser cancelled this game: there is nothing else to show (cancel design, 2026-11-16). */
  cancelled?: true
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
  /**
   * The game's settings. `legendaries` is in the organiser's own view only: even the name of a secret card stays
   * off players' and marshals' phones.
   */
  settings: Omit<Settings, 'legendaries' | 'endgames'> & { legendaries?: Settings['legendaries']; endgames?: Settings['endgames'] }
  /**
   * The game can roll an endgame (in Core, only Bomba's switch counts): the how-to-play card shows. Says only that
   * there may be one, never which.
   */
  endgameOn: boolean
  dots: MapDot[]
  nextRevealAt: number | null
  nextAlertAt: number | null
  /** When the most recent ping revealed runners to chasers (drives the "you've been pinged" moment). */
  lastRevealAt: number | null
  chaserNearby: boolean
  /**
   * The organiser's own view of the Tupperwares, present in every phase (also once the game has ended); null outside
   * Full. Never in a player's or marshal's view.
   */
  tupperware?: Partial<Record<TupperSide, { legendary: LegendaryKind; suggested: LatLng; dropped: LatLng | null; claimed: boolean }>> | null
  /** The Tupperware side quest has woken up for me: something is near, and my side's box is still unclaimed. */
  sideQuest: boolean
  /** Name of the chaser who caught me, while I'm jailed. */
  caughtBy: string | null
  /** Luar Garisan: I've been warned for being outside the play area and have not yet come back or been disqualified. */
  outWarned: boolean
  /**
   * Why I'm in Penjara: caught by a chaser, auto-jailed for missing two check-ins, or sent from Super Ring's house
   * arrest (`bail-revoked`: a fix outside the circle, or no fresh fix inside it at the end), or by Mak Kau Hijau
   * (`hijau`: didn't tap green in time).
   */
  jailReason: 'caught' | 'missed-checkins' | 'bail-revoked' | 'hijau' | 'banjir' | null
  /** Banjir Kilat: when my 30 s in the water runs out (server ms), or null when I'm not in the water. */
  wetUntil?: number | null
  /**
   * My Super Ring house arrest, while it lasts (null otherwise): when it ends (held still while paused), the
   * circle's centre, and while it waits for me to open Kejar, the deadline to start it (both others null then).
   */
  arrest: { endsAt: number | null; center: LatLng | null; openBy: number | null } | null
  /**
   * Mak Kau Hijau's takeover (new power-ups §6.3): for a runner who must tap green, from its start until it
   * settles; the deadline is held still while paused. Null for everyone else (chasers get a feed line).
   * `claimedAt` names the run and never moves (a resume shifts `startsAt` and `deadline`).
   */
  hijau: { claimedAt: number; startsAt: number; deadline: number; tapped: boolean } | null
  /**
   * Penjara is locked for 3 minutes after a Mak Kau Hijau that counted (owner, 2026-11-13): when it opens again, held
   * still while paused (count from `now` then, like `hijau`). Null when it isn't locked, and outside the chase.
   */
  penjaraLockedUntil: number | null
  /** My running Durian's end time; null for effects that wait for the next ping (motion design §7b). */
  activeEndsAt: number | null
  /** A chaser holding Mat Rempit while the team waits: when it unlocks (power-ups design §5a). */
  flareReadyAt: number | null
  /** Auto-jailed: the scheduled check-ins that sent me to Penjara (reveal times, oldest first). */
  jailCheckins: { at: number; ok: boolean }[] | null
  /** A free runner's standing for the next scheduled ping during the chase; null otherwise. */
  checkin: Checkin | null
  /**
   * With the chaser-snapshot switch on, a free runner sees where the chasers were at the alert of the most
   * recent scheduled ping they checked into (checkins design §5); null for everyone else, and before a
   * runner's first check-in.
   */
  chaserSnapshot: ChaserSnapshot | null
  /**
   * A chaser, with the switch on, between a scheduled ping's alert and its reveal: runners checking in can
   * see where they were at the alert, so their unseen window has started (checkins design §5.4).
   */
  snapshotted: boolean
  /**
   * The endgame once it is revealed (null before, on every role, and for a Hang Hebat with nobody wanted). Jailed
   * runners get it live too: the takeover is a game event every player needs. `label` is the wanted runner's tag and
   * `name` their name, both public from the reveal (the feed line names them too), for the wanted poster.
   */
  endgame: { kind: EndgameKind; revealedAt: number; wanted: { id: string; label: string; name: string } | null; bountyCaught: boolean; flood?: FloodNow | null } | null
  feed: FeedItem[]
  counts: { runnersFree: number; runnersJailed: number; runnersLuarGarisan: number; chasers: number }
  /** Everyone in the game: shown in the lobby and to marshals; empty for players mid-game. */
  roster: RosterEntry[]
  /** Reports filed once the game had already ended; marshals and the organiser only, for the After game tab. */
  reports: PostGameReport[]
  /** "How fun was it?" ratings; marshals and the organiser only, for the After game tab. */
  ratings: PostGameRating[]
  /** Power-up stations, numbered from 1; `lockedUntil` is the ISO time a claim's lock ends, or null when free. */
  stations: { n: number; lat: number; lng: number; lockedUntil: string | null }[]
  /** My unused power-ups. */
  hand: PowerUp[]
  shieldActive: boolean
  /** Cards left in my side's shared deck (power-ups §5b); null for marshals and the organiser. */
  deckLeft: number | null
  /** My power-up whose effect is still running, which keeps my one slot busy (§5a). */
  activePowerUp: PowerUpKind | null
  /**
   * What Settle could do, for a jailed runner holding an unused Dato Seri (jail design §4b, §4d); null for
   * everyone else. `options` are the other runners in Penjara; those who already used their one escape are
   * listed as not eligible (greyed out).
   */
  settle: { canFreeSelf: boolean; options: { id: string; name: string; eligible: boolean }[] } | null
  /**
   * The live key-hold rescue at Penjara (rules §9a): held time so far, counted up to this view; while the thumb is
   * down, the time it was counted to (the view's `now`: add only what comes after it), null when it is off; and when
   * the rescue resets (null while the thumb is down). Everyone but a chaser also gets who is holding;
   * a chaser is never told who is rescuing. Null when none is going.
   */
  rescue: { by?: string; byName?: string; heldMs: number; holdSince: number | null; resetAt: number | null } | null
  /** The one '5 minutes left!' warning has gone out (rules §2.7): the clock stays lime for the rest of the game. */
  fiveLeft: boolean
  /**
   * The Penjara reel (§2.2), for a jailed runner only (null for everyone else): whether this stay's one pull is
   * spent. A spent pull that left them jailed was black, so `result` is 'black' then; null before the pull. A free
   * pull frees them, so it never shows here.
   */
  reel: { pulled: boolean; result: 'free' | 'black' | null } | null
  /** Cheese Ais: the chasers a runner holding an unused one can freeze (live, not Luar Garisan, not frozen), by name; null otherwise. */
  freezeTargets: { id: string; name: string }[] | null
  /** When my own power-up freeze ends (chasers), or null when I'm not frozen. */
  frozenUntil: number | null
  /** Nasi Lemak KFC: I used one, so my next deck card arrives doubled (`COMBO READY` on the slot). */
  comboReady: boolean
  /** Tee And Gee: the chasers' hidden toll gates still waiting for their reveal; empty for runners and marshals. */
  tollGates: LatLng[]
  /**
   * The organiser only: exactly where the stash is (null if none), and who claimed it. Left out of players' and
   * marshals' views entirely, so not even the key's name reaches their phones (rules doc §9b).
   */
  datoStash?: PlacedStash | null
  /**
   * The organiser only: Bomoh's, Super Ring's and Mak Kau Hijau's stashes, the same shape and secrecy as
   * `datoStash`. Left out of players' and marshals' views entirely.
   */
  bomohStash?: PlacedStash | null
  ringStash?: PlacedStash | null
  hijauStash?: PlacedStash | null
  /**
   * The organiser's and marshals' packing list. The Tupperware and its places are in the organiser's own view
   * only (rules doc §9b); players never get this field.
   */
  kit?: KitView
  /**
   * How to play (the briefing). A runner or chaser: `open` while the organiser has started the briefing and I haven't
   * tapped I'm ready (so the story opens, also for someone who joined after it started). The organiser's own view
   * instead gets the count and each player's status. Null for marshals and for anyone without a side.
   */
  briefing: BriefingPlayerView | BriefingHostView | null
  results: Results | null
}

export interface BriefingPlayerView {
  open: boolean
  ready: boolean
}

export interface BriefingHostView {
  started: boolean
  ready: number
  total: number
  /** By player id, for every runner and chaser. */
  status: Record<string, 'reading' | 'ready' | 'not opened'>
}

export interface KitView {
  items: (KitItem & { ticked: boolean })[]
  placed: Record<string, boolean>
  /** The cards to walk to and tape up, with their spots. */
  places: PlaceItem[]
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

/** Chasers frozen at a scheduled ping's alert, fuzzed to `CHASER_SNAPSHOT_FUZZ_M`. */
export interface ChaserSnapshot {
  positions: { name: string; lat: number; lng: number; stale: boolean }[]
}

/**
 * Seed for fuzz that must not be undone by players: the deck's secret seed (set at start, never sent to
 * players), not the game id, which reaches them (e.g. `PowerUp.game_id` in their hand) along with `hash`,
 * `fuzz` and `offset` in the client bundle. Games from before the seed existed fall back to the id.
 */
const secretSeed = (g: Game) => g.deck_seed ?? g.id

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

/**
 * Whether a scheduled ping gave fair warning (a late alert is skipped by auto-jail, so no screen may show it as
 * missed). A ping with no row yet is taken as fair.
 */
function warnedFor(i: Pick<ViewInput, 'game' | 'pings'>, seq: number, revealAt: number): boolean {
  if (seq >= BONUS_SEQ_BASE) return true
  const row = i.pings.find((p) => p.seq === seq)
  return !row || fairlyWarned(row.alert_sent_at ? Date.parse(row.alert_sent_at) : null, revealAt, i.game.settings.checkinMode)
}

/** Power-ups of `kind` whose effect lands on this reveal: the first reveal at or after they were used. */
function landingAt(i: ViewInput, kind: PowerUp['kind'], revealAt: number, prevRevealAt: number): PowerUp[] {
  return i.powerUps.filter((u) => {
    if (u.kind !== kind || !u.used_at) return false
    const usedAt = Date.parse(u.used_at)
    return usedAt <= revealAt && usedAt > prevRevealAt
  })
}

/**
 * Tee And Gee: the chasers' gates that are set but haven't had their reveal yet (no revealed ping at or after
 * the use). Chasers only; a landed gate has done its work and is gone. A doubled card can mean two.
 */
function tollGatesFor(i: ViewInput): LatLng[] {
  if (i.me.role !== 'chaser') return []
  const reveals = revealedPings(i.pings).map((p) => Date.parse(p.reveal_at))
  return i.powerUps
    .filter((u) => {
      if (u.kind !== 'toll' || !u.used_at || !u.spot) return false
      const usedAt = Date.parse(u.used_at)
      return !reveals.some((r) => r >= usedAt)
    })
    .map((u) => u.spot as LatLng)
}

/**
 * Mak Kau Hijau's tap reveal (owner, 2026-11-13): where each runner tapped green, while the run counts (not void),
 * keyed by player id. A spot lasts until the next ping reveal after the tap (`since`: the last reveal so far).
 */
function hijauSpots(i: ViewInput, since: number | null): Map<string, { lat: number; lng: number; at: string }> {
  const run = i.game.hijau
  const spots = new Map<string, { lat: number; lng: number; at: string }>()
  // Void runs reveal nobody: a late (or no) push, or one settled with no lock (late, or after the whistle).
  if (!run || !hijauCounts(run) || (run.settledAt && !run.lockedUntil)) return spots
  for (const [id, fix] of Object.entries(run.fixes ?? {})) {
    if (since === null || Date.parse(fix.at) > since) spots.set(id, fix)
  }
  return spots
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
  const tapped = hijauSpots(i, last ? Date.parse(last.reveal_at) : null)
  // A tapper the Kejar can see: free, still in the round and not under house arrest (hidden like any runner then).
  const tapDot = (p: Player): MapDot | null => {
    const spot = tapped.get(p.id)
    return spot && !p.jailed && !isOut(p) && !p.arrest ? { ...dotFor(p, { ...spot, accuracy_m: 0 }, 'runner'), exact: true, revealedBy: 'hijau' } : null
  }
  if (!last) {
    for (const p of i.players) {
      const dot = p.role === 'runner' ? tapDot(p) : null
      if (dot) dots.push(dot)
    }
    return { dots, notes }
  }
  const revealAt = Date.parse(last.reveal_at)
  const alertAt =
    last.seq >= BONUS_SEQ_BASE
      ? Date.parse(last.alert_at)
      : (pingTimes(i.game, i.now).find((t) => t.seq === last.seq)?.alertAt ?? revealAt - alertLeadFor(last.seq))
  // Bomba's last call: every free runner shows exactly, Ponteng or not.
  const lastCall = pingTimes(i.game, i.now).find((t) => t.seq === last.seq)?.lastCall === true
  const prev = revealed[revealed.length - 2]
  const prevAt = prev ? Date.parse(prev.reveal_at) : (chaseStartOf(i.game, i.now) ?? revealAt)

  const cloaked = new Set(landingAt(i, 'cloak', revealAt, prevAt).map((u) => u.player_id))
  const decoyed = new Set(landingAt(i, 'decoy', revealAt, prevAt).map((u) => u.player_id))
  const focusers = landingAt(i, 'focus', revealAt, prevAt)
    .map((u) => latestAtOrBefore(i.positions[u.player_id], revealAt))
    .filter((p): p is Position => !!p)

  // Tee And Gee: a fixed point instead of a chaser, the same effect as Pak Guard around it.
  const tollGates = landingAt(i, 'toll', revealAt, prevAt)
    .map((u) => u.spot)
    .filter((s): s is LatLng => !!s)

  // Bomoh (jail design §2e): a team-wide, radius-free reveal sourced from the game's own `bomoh_stash`, not
  // a hand card — there's nothing to look up per-player. Active for the first 2 ping-reveals strictly after
  // the claim, however long that takes (never a timer), then reverts for good.
  const bomoh = placedStash(i.game.bomoh_stash)
  const bomohClaimedAt = bomoh?.claimedBy ? Date.parse(bomoh.claimedAt!) : null
  const bomohRevealNo = bomohClaimedAt === null ? Infinity : revealed.filter((r) => Date.parse(r.reveal_at) > bomohClaimedAt).length
  const bomohActive = bomohClaimedAt !== null && revealAt > bomohClaimedAt && bomohRevealNo <= 2

  for (const p of i.players) {
    if (p.role !== 'runner') continue
    if (p.jailed) {
      const sliding = slidingDot(p, i, 'runner')
      if (sliding) dots.push(sliding)
      continue
    }
    // Luar Garisan: out of the round, so neither a target on the map nor a "never checked in" note. Super Ring's
    // house arrest hides the runner the same way, so nobody can wait outside the circle.
    if (isOut(p) || p.arrest) continue
    // Tapped green since the last ping: shown exactly where they tapped, whatever the ping showed.
    const tapDotNow = tapDot(p)
    if (tapDotNow) {
      dots.push(tapDotNow)
      continue
    }
    const at = latestAtOrBefore(i.positions[p.id], revealAt)
    // A cloaked runner must look exactly like one who never checked in.
    if (!at || (cloaked.has(p.id) && !lastCall)) {
      notes.push({ at: last.reveal_at, text: `${tagLabel(p)} never checked in` })
      continue
    }
    // Seeded with the game's secret deck seed (never sent to players), same as the chaser snapshot and
    // Dato Seri's zone — otherwise the player id and ping number alone are public, so a chaser who reads
    // this file's own client-shipped code could recompute the fuzz/decoy offset and recover exact spots.
    const seed = `${secretSeed(i.game)}:${p.id}:${last.seq}`
    const focused = focusers.some((f) => distanceM(f, at) <= FOCUS_M)
    const tolled = tollGates.some((s) => distanceM(s, at) <= TOLL_RADIUS_M)
    // Bomoh takes priority over Focus when both apply: the rarer, team-wide effect wins the purple ring.
    const revealedByBomoh = bomohActive ? 'bomoh' : null
    const isExact = lastCall || revealedByBomoh !== null || focused || tolled
    const revealedBy: MapDot['revealedBy'] = lastCall ? 'lastcall' : (revealedByBomoh ?? (focused ? 'focus' : tolled ? 'toll' : null))
    let dot: MapDot
    if (decoyed.has(p.id)) {
      // Drawn the same way as everyone else in range, so neither Focus nor Bomoh can expose a Decoy.
      const spot = decoySpot(at, i.game.arena, seed)
      dot = isExact
        ? { ...dotFor(p, at, 'runner'), ...spot, exact: true, revealedBy }
        : { ...dotFor(p, at, 'runner'), ...spot, fuzzy: true }
    } else if (isExact) {
      dot = { ...dotFor(p, at, 'runner'), exact: true, revealedBy }
    } else {
      dot = { ...dotFor(p, at, 'runner'), ...fuzz(at, FUZZ_RADIUS_M, seed), fuzzy: true }
    }
    // Missed = no location inside this ping's check-in window (60 s scheduled, 45 s for Bomba's minute pings, 30 s bonus).
    if (warnedFor(i, last.seq, revealAt) && !checkedIn(alertAt, revealAt, Date.parse(at.at))) dot.missed = true
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
  if (i.me.role !== 'runner' || isOut(i.me) || phase !== 'chasing') return null
  const times = pingTimes(i.game, i.now)
  const next = times.find((t) => t.revealAt > i.now)
  if (!next) return null
  const lastAt = myLastAt(i)
  // Skipped pings (under 25 s of warning) are left out, as auto-jail leaves them out.
  const prev = times.filter((t) => t.revealAt <= i.now && warnedFor(i, t.seq, t.revealAt)).at(-1)
  const since = sinceRelease(i)
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

/** My latest location time at or before `t`, from the positions the view was given. */
function myLastAt(i: Pick<ViewInput, 'me' | 'positions'>): (t: number) => number | null {
  const mine = i.positions[i.me.id]
  return (t) => {
    const at = latestAtOrBefore(mine, t)
    return at ? Date.parse(at.at) : null
  }
}

/** Check-ins only count from the chase start or my last release, whichever is later (checkins design §4.4). */
function sinceRelease(i: Pick<ViewInput, 'game' | 'me' | 'now' | 'events'>): number {
  return checkinsSince(chaseStartOf(i.game, i.now)!, countRestartAt(i.me, i.events))
}

export type SnapshotInput = Pick<ViewInput, 'game' | 'me' | 'positions' | 'events' | 'now'>

/** The check-in switch only exists in Full: always off in Core, whatever was stored (rules §3). */
const snapshotOn = (g: Game) => g.settings.mode === 'full' && g.settings.chaserSnapshot === true

/**
 * The scheduled ping whose alert-time snapshot a free runner sees: the most recent one they checked into
 * (checkins design §5.4), the same check-in window test as auto-jail (`checkedIn`). Mat Rempit's bonus pings
 * never count. A window still open counts as soon as a location lands in it. Windows already revealed
 * also count when the reveal recorded the runner as checked in (`checkedIn` on the ping event), because a
 * view only loads positions at a few moments. Null with the switch off, or before a first check-in.
 */
export function snapshotWindow(i: SnapshotInput): { seq: number; alertAt: number; revealAt: number } | null {
  if (!snapshotOn(i.game)) return null
  if (i.me.role !== 'runner' || isOut(i.me) || phaseAt(i.game, i.now).phase !== 'chasing') return null
  const recorded = new Set(
    i.events
      .filter((e) => e.type === 'ping' && Array.isArray(e.data.checkedIn) && (e.data.checkedIn as unknown[]).includes(i.me.id))
      .map((e) => Number(e.data.seq)),
  )
  const lastAt = myLastAt(i)
  const since = sinceRelease(i)
  const opened = pingTimes(i.game, i.now).filter((t) => t.seq < BONUS_SEQ_BASE && t.alertAt <= i.now)
  return (
    opened
      .reverse()
      .find((t) => recorded.has(t.seq) || countedCheckIn(t.alertAt, t.revealAt, lastAt(Math.min(t.revealAt, i.now)), since)) ??
    null
  )
}

/** Every chaser as of the snapshot window's alert, fuzzed the same way on every poll so the circles stay put. */
function chaserSnapshotFor(i: ViewInput): ChaserSnapshot | null {
  const w = snapshotWindow(i)
  if (!w) return null
  const positions = i.players.flatMap((p) => {
    if (p.role !== 'chaser' || p.removed_at) return []
    const at = latestAtOrBefore(i.positions[p.id], w.alertAt)
    if (!at) return []
    const spot = fuzz(at, CHASER_SNAPSHOT_FUZZ_M, `${secretSeed(i.game)}:${p.id}:snapshot:${w.seq}`)
    return [{ name: p.name, lat: spot.lat, lng: spot.lng, stale: w.alertAt - Date.parse(at.at) > FRESH_MS }]
  })
  return { positions }
}

function snapshottedFor(i: ViewInput, phase: Phase): boolean {
  if (!snapshotOn(i.game) || i.me.role !== 'chaser' || phase !== 'chasing') return false
  return pingTimes(i.game, i.now).some((t) => t.alertAt <= i.now && i.now < t.revealAt)
}

export const SNAPSHOT_TAKEN = 'Snapshot taken. Dikejar can see where you were.'

/**
 * The snapshot line for the latest scheduled alert so far while the switch is on, derived from the schedule (§5.4).
 * Only the latest: with 2-minute pings one line per alert filled the whole 20-line feed and pushed catches off it,
 * and each repeat says nothing new, so they collapse into the most recent one.
 */
function snapshotLines(i: ViewInput, phase: Phase, endsAt: number | null): { at: string; text: string }[] {
  // Chasers and marshals only (ruling R16): a runner already sees the snapshot itself.
  if (!snapshotOn(i.game) || (i.me.role !== 'chaser' && i.me.role !== 'marshal')) return []
  const until = phase === 'ended' && endsAt !== null ? Math.min(endsAt, i.now) : i.now
  return pingTimes(i.game, i.now)
    .filter((t) => t.alertAt <= until)
    .slice(-1)
    .map((t) => ({ at: new Date(t.alertAt).toISOString(), text: SNAPSHOT_TAKEN }))
}

/** The Settle picker's choices, the same eligibility `judgeSettle` applies. */
function settleFor(i: ViewInput, phase: Phase): View['settle'] {
  if (phase !== 'chasing' || i.game.paused_at || i.me.role !== 'runner' || !i.me.jailed) return null
  const holds = i.powerUps.some((u) => u.player_id === i.me.id && u.kind === 'dato' && u.used_at === null && !u.taken_at)
  if (!holds) return null
  const options = i.players
    .filter((p) => p.role === 'runner' && p.jailed && p.id !== i.me.id && !p.removed_at)
    .map((p) => ({ id: p.id, name: p.name, eligible: !p.freed_once }))
  return { canFreeSelf: !i.me.freed_once, options }
}

/** Who a runner's unused Cheese Ais can freeze: chasers still in the round and not already frozen, ordered by name. */
function freezeTargetsFor(i: ViewInput): View['freezeTargets'] {
  if (i.me.role !== 'runner') return null
  const holds = i.powerUps.some((u) => u.player_id === i.me.id && u.kind === 'cheese' && u.used_at === null && !u.taken_at)
  if (!holds) return null
  return i.players
    .filter((p) => p.role === 'chaser' && !p.removed_at && !p.disqualified_at && frozenForMs(p, i.now) === 0)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The reel for the jailed runner: spent this stay or not. */
function reelFor(i: ViewInput): View['reel'] {
  if (i.me.role !== 'runner' || !i.me.jailed) return null
  const pulled = reelPulledThisStay(i.me)
  return { pulled, result: pulled ? 'black' : null }
}

/**
 * The live rescue as players see it: how long the key has been held and, once the thumb is off, when it resets.
 * While the game is paused the progress is read at the pause, so nothing counts (or lapses) until it resumes.
 * `heldMs` already holds the live stretch, so `holdSince` is the view's own time, not when the thumb went down: the
 * phone adds `now − holdSince` on top, and it must only add what came after this view (a paused phone's clock stands
 * at the view's time, so that adds nothing).
 */
function rescueFor(i: ViewInput, phase: Phase): View['rescue'] {
  if (!i.game.rescue || phase !== 'chasing' || i.game.ended_at) return null
  const r = legacyRescue(i.game.rescue)
  const at = i.game.paused_at ? Math.min(i.now, Date.parse(i.game.paused_at)) : i.now
  const p = rescueProgress(r, at)
  const progress = {
    heldMs: p.heldMs,
    holdSince: p.holding ? i.now : null,
    resetAt: p.offSince === null ? null : p.offSince + RESCUE_RESET_MS,
  }
  if (i.me.role === 'chaser') return progress
  const byName = i.players.find((p) => p.id === r.by)?.name ?? 'A Dikejar'
  return { by: r.by, byName, ...progress }
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
  if (latest?.type !== 'auto-jailed') return 'caught'
  if (latest.data.cause === 'revoked') return 'bail-revoked'
  return latest.data.cause === 'hijau' ? 'hijau' : latest.data.cause === 'banjir' ? 'banjir' : 'missed-checkins'
}

/** My house arrest for my own screen (see `View.arrest`). While paused, both deadlines move with the clock. */
function arrestFor(i: ViewInput): View['arrest'] {
  const a = i.me.arrest
  // Once the game is over a leftover arrest means nothing (they counted as free): no stale circle on the results.
  if (!a || i.me.role !== 'runner' || phaseAt(i.game, i.now).phase === 'ended') return null
  const since = a.startedAt ?? a.firedAt
  const frozen = i.game.paused_at ? Math.max(0, i.now - Math.max(Date.parse(i.game.paused_at), Date.parse(since))) : 0
  const endsAt = arrestEndsAt(a)
  return {
    endsAt: endsAt === null ? null : endsAt + frozen,
    center: a.center,
    openBy: a.startedAt ? null : Date.parse(a.firedAt) + ARREST_OPEN_MS + frozen,
  }
}

/** I must tap green: the push went to me, and I'm still free, not Luar Garisan and not under house arrest. */
function hijauTargetMe(i: Pick<ViewInput, 'game' | 'me'>): boolean {
  return !!i.game.hijau?.targets?.includes(i.me.id) && hijauTargets([i.me]).length > 0
}

/** When Penjara opens again after Mak Kau Hijau (see `View.penjaraLockedUntil`). */
function penjaraLockedUntilFor(i: ViewInput, phase: Phase): number | null {
  if (phase !== 'chasing') return null
  const left = penjaraLockLeft(i.game, i.now)
  return left > 0 ? i.now + left : null
}

/** My Mak Kau Hijau takeover (see `View.hijau`). */
function hijauFor(i: ViewInput, phase: Phase): View['hijau'] {
  const run = i.game.hijau
  if (!run || run.settledAt || phase !== 'chasing' || !hijauTargetMe(i)) return null
  const startsAt = Date.parse(run.startsAt)
  if (i.now < startsAt) return null
  const frozen = i.game.paused_at ? Math.max(0, i.now - Math.max(Date.parse(i.game.paused_at), startsAt)) : 0
  // `claimedAt` never moves (a resume shifts `startsAt` and `deadline`): it names the run for the phone.
  return { claimedAt: Date.parse(run.claimedAt), startsAt, deadline: Date.parse(run.deadline) + frozen, tapped: run.tapped.includes(i.me.id) }
}

interface FeedContext {
  meId: string
  side: 'runner' | 'chaser' | null
  freeNow: number
  jailedNow: number
  /** I tapped green in this game's Mak Kau Hijau. */
  tappedGreen: boolean
  /** I must tap green right now (see `hijauTargetMe`). */
  hijauTarget: boolean
  /** PKP is revealed: its `endgame` line says "5 minutes left" already. */
  pkp: boolean
}

type Line = Omit<FeedItem, 'at'>
const plain = (text: string): Line => ({ text, means: null, act: false, label: null })

/**
 * The feed line for a rescue that ended without freeing anyone, by the server's reason; an old event without a reason
 * gets the plain line. Exported so the rescue screens can tell from the feed how the rescue they watched ended.
 */
export function rescueFailedText(reason: string, who: string): string {
  const why: Record<string, string> = {
    caught: `The rescue failed: ${who} was caught.`,
    left: `The rescue failed: ${who} walked away.`,
    reset: 'The rescue reset.',
    locked: 'The rescue failed: Penjara is locked.',
    removed: 'The rescue failed.',
  }
  return why[reason] ?? 'Rescue failed. Nobody gets out.'
}

/** The feed line for a rescue that freed `n` runners (the rescue screens read it back too). */
export const jailbreakText = (n: number) => `Jailbreak! ${n} Dikejar free.`

/** The two-part lines (motion §8.2). Runner power-up uses never appear, so nothing secret leaks. */
function feedLine(e: GameEvent, byId: Map<string, Player>, ctx: FeedContext): Line | Line[] | null {
  const actor = e.actor_id ? byId.get(e.actor_id) : undefined
  const target = e.target_id ? byId.get(e.target_id) : undefined
  const tag = target ? tagLabel(target) : 'A Dikejar'
  const two = (text: string, label: string, dikejar: string, kejar: string, actFor: 'runner' | 'chaser' | null = null): Line => ({
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
      if (e.data.lastCall === true) return two('Last call!', 'LAST CALL', 'Kejar see exactly where you were.', 'Every free Dikejar shows exactly on your map.')
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
      // Tee And Gee: only the chasers learn a gate was set; runners get nothing, so they can't tell where to avoid.
      if (e.data.kind === 'toll') {
        if (ctx.side === 'runner') return null
        if (ctx.side === null) return plain('A Kejar used Tee And Gee')
        return two('A Kejar set a toll gate.', 'Tee And Gee', '', 'Dikejar checking in near it show exactly at the next ping.')
      }
      return null
    case 'stolen': {
      // The feed never says who stole or who lost; only the player who lost the card is told what it was.
      const thief = e.data.kind === 'along' ? 'Ah Long' : 'Toyol'
      if (e.target_id && e.target_id === ctx.meId) {
        const taken = POWER_NAME[e.data.takenKind as PowerUpKind] as string | undefined
        // Their own loss needs them: it buzzes and gets the needs-you outline in the ticker.
        return { ...plain(`${thief} took your ${taken ?? 'power-up'}!`), act: true }
      }
      return plain(thief === 'Ah Long' ? 'Ah Long came to collect!' : 'Toyol stole a power-up!')
    }
    case 'frozen':
      // The frozen chaser is told it is theirs (it buzzes); nobody learns who froze whom.
      if (e.target_id && e.target_id === ctx.meId) return { ...plain('Brain freeze! A runner froze your power-up for 3 minutes.'), act: true }
      // Marshals and the organiser may see names (no side).
      if (ctx.side === null && target) return plain(`A Dikejar froze ${target.name}'s power-up`)
      return plain('Brain freeze on a Kejar.')
    case 'legendary':
      // Never the card's name or the finder's (jail design §4c, rules doc §9b).
      return plain('Something legendary was found.')
    case 'settled': {
      // Visible to everyone, a lime-box line for Kejar, with the real count (rules doc §9c); still no card name.
      const n = Number(e.data.freed ?? 0)
      return two(
        `Something legendary freed ${n} Dikejar!`,
        'FREE',
        ctx.jailedNow === 0 ? 'Penjara is empty again.' : `${ctx.jailedNow} still inside.`,
        `${n} more Dikejar ${n === 1 ? 'is' : 'are'} loose near Penjara.`,
      )
    }
    case 'caught':
      if (!actor || !target) return plain('A Dikejar was caught.')
      return two(`${actor.name} caught ${tag}.`, 'CATCH', `${tag} is walking to Penjara. ${ctx.freeNow} Dikejar still free.`, `Nice. ${ctx.freeNow} Dikejar left to find.`)
    case 'shielded':
      return two(`${tag} blocked a catch with Durian.`, 'Durian', `${tag} is still free. Their Durian is used up.`, `That catch didn't count. ${tag} has no Durian now.`)
    case 'rescue-started':
      // Chasers need to move now (rules §9a): their line is outlined and buzzes.
      return two(
        'Rescue starting at Penjara!',
        'RESCUE',
        ctx.jailedNow === 0 ? 'Hold Penjara for 20 s.' : `Hold for 20 s and ${ctx.jailedNow} could get out.`,
        'Catch them before 20 s of holding and nobody gets out.',
        'chaser',
      )
    case 'reel-free':
      return plain(`${actor?.name ?? String(e.data.who ?? 'A Dikejar')} pulled the free slot. Keluar penjara!`)
    case 'rescue-failed': {
      // The server says why (caught, walked away, ...); an event without a reason is an old one. A chaser is never
      // told who walked away: nothing else names the rescuer to them (a catch line already names who was caught).
      const reason = String(e.data.reason ?? '')
      const text =
        reason === 'left' && ctx.side === 'chaser'
          ? 'The rescue failed: the rescuer walked away.'
          : rescueFailedText(reason, actor?.name ?? 'The rescuer')
      return two(text, 'RESCUE', 'The rescuer can try again if they are still free.', 'Penjara holds. Nice.')
    }
    case 'jailbreak': {
      const n = Number(e.data.freed ?? 0)
      return two(
        jailbreakText(n),
        'FREE',
        ctx.jailedNow === 0 ? 'Penjara is empty again.' : `${ctx.jailedNow} still inside.`,
        `${n} more Dikejar ${n === 1 ? 'is' : 'are'} loose near Penjara.`,
      )
    }
    case 'arrested':
      // Never the card's name or the runner's (rules doc §9b).
      return plain('Something legendary saved a Dikejar.')
    case 'auto-jailed': {
      // Out of Super Ring's house arrest: never says why, so the card stays a secret.
      const revoked = two(`${tag} went to Penjara.`, 'PENJARA', `${ctx.freeNow} Dikejar still free.`, `One less to find. ${tag} is in Penjara.`)
      if (e.data.cause === 'revoked') return revoked
      // Mak Kau Hijau: players get its one count line (`hijau-done`); marshals see who, for the undo. A Super Ring
      // holder it sent to house arrest who never opened Kejar comes later, outside that count: players get the plain
      // Penjara line, so the card stays a secret.
      if (e.data.cause === 'hijau') return ctx.side === null ? plain(`${tag} missed Mak kau hijau, sent to Penjara.`) : e.data.arrest === true ? revoked : null
      // Banjir Kilat: everyone sees who the water got; a Super Ring house arrest that ended there stays a secret.
      if (e.data.cause === 'banjir') return e.data.arrest === true && ctx.side !== null ? revoked : plain(`${tag} got caught in the flood, sent to Penjara.`)
      return two(
        `${tag} missed 2 check-ins in a row.`,
        '2×',
        `${tag} went to Penjara. Check in when your phone buzzes, or you're next.`,
        `One less to find. ${tag} is in Penjara.`,
      )
    }
    case 'hijau':
      // Only a runner who must tap gets the buzz; jailed, arrested or Luar Garisan runners just read it.
      if (ctx.side === 'runner') return { ...plain('Mak kau hijau! Tap the green.'), act: ctx.hijauTarget }
      return plain('Mak kau hijau! Dikejar have 20 s.')
    case 'hijau-done': {
      // Too close to the end to run: nothing happened, so nothing to explain beyond the found card.
      if (e.data.ended === true) return null
      // Void: it never counted, so nobody is told "Safe!" either.
      if (e.data.void === true) return ctx.side === 'runner' ? null : plain('Mak kau hijau fizzled. The alert went out too late.')
      const safe = ctx.side === 'runner' && ctx.tappedGreen ? [plain('Safe! You touched green.')] : []
      return [plain(`Mak kau hijau: ${Number(e.data.jailed ?? 0)} Dikejar to Penjara.`), ...safe]
    }
    case 'luar-garisan':
      // For everyone. The warning (`out-warned`) stays private to the player, so it has no line.
      return actor ? plain(`${tagLabel(actor)} is Luar Garisan, out of this round.`) : null
    case 'endgame': {
      if (e.data.kind === 'bomba') return plain('Endgame: Bomba.')
      if (e.data.kind === 'pkp') return plain('Endgame: PKP.')
      if (e.data.kind === 'hebat') return plain(`Endgame: Hang Hebat. ${String(e.data.who ?? target?.name ?? 'A Dikejar')} is wanted.`)
      return null
    }
    case 'wanted':
      return plain(`${String(e.data.who ?? (target ? tagLabel(target) : 'A Dikejar'))} is now wanted.`)
    case 'five-left':
      return ctx.pkp ? null : plain('5 minutes left!')
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
      return 'Game started. Dikejar, go hide!'
    case 'chase':
      return 'Chasers released'
    case 'ping':
      return `Ping: ${count(Number(e.data.seen ?? 0), 'runner')} seen`
    case 'caught':
      return target && actor ? `${tagLabel(target)} caught by ${actor.name}` : 'A runner was caught'
    case 'jailbreak':
      return `Jailbreak! ${Number(e.data.freed ?? 0)} Dikejar free.`
    case 'reel-free':
      return `${actor?.name ?? String(e.data.who ?? 'A Dikejar')} pulled the free slot. Keluar penjara!`
    case 'five-left':
      return '5 minutes left!'
    case 'ended':
      return 'Game over'
    case 'powerup':
      return actor ? `${actor.name} picked up a power-up` : null
    case 'used':
      // Runner power-ups stay secret; chasers' ones are announced.
      if (e.data.kind === 'flare') return 'A Kejar used Mat Rempit. Extra ping in 30 s!'
      if (e.data.kind === 'focus') return 'A Kejar used Pak Guard'
      if (e.data.kind === 'toll') return 'A Kejar used Tee And Gee'
      return null
    case 'frozen':
      return target ? `A Dikejar froze ${target.name}'s power-up` : 'A Dikejar froze a chaser power-up'
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
    case 'kejar-undone':
      // An undone house arrest names nobody: the feed never said who Super Ring saved.
      if (e.data.arrest === true) return 'A marshal undid a kejar.'
      // The runner's name only, never the tag number (fair-play §1.4).
      return `A marshal undid a kejar. ${target?.name ?? 'A Dikejar'} is back in.`
    case 'final-whistle':
      if (e.data.cause === 'bounty') return 'Hang Hebat caught! Final whistle in 60 s.'
      // A removal or Luar Garisan put the last runner out without a catch; older events carry no cause (a catch).
      return e.data.cause === 'removed' || e.data.cause === 'luar-garisan' || e.data.cause === 'hijau' || e.data.cause === 'banjir'
        ? 'No Dikejar left free! Final whistle in 60 s.'
        : 'Last Dikejar caught! Final whistle in 60 s.'
    case 'arrested':
      return 'Something legendary saved a Dikejar.'
    case 'auto-jailed':
      if (e.data.cause === 'revoked') return target ? `${tagLabel(target)} sent to Penjara` : 'A runner was sent to Penjara'
      if (e.data.cause === 'hijau') return target ? `${tagLabel(target)} missed Mak kau hijau, sent to Penjara` : 'A runner missed Mak kau hijau, sent to Penjara'
      if (e.data.cause === 'banjir') return target ? `${tagLabel(target)} got caught in the flood, sent to Penjara` : 'A runner got caught in the flood, sent to Penjara'
      return target ? `${tagLabel(target)} missed 2 check-ins, sent to Penjara` : 'A runner missed 2 check-ins, sent to Penjara'
    default:
      return null
  }
}

export function viewFor(i: ViewInput): View {
  const v = fullView(i)
  // A removed player's page keeps polling: give it nothing of the game (spec §5.1). A cancelled game gives nobody
  // anything either, and no results.
  const cancelled = !!i.game.cancelled_at
  if (i.me.removed_at || cancelled) {
    return { ...v, ...(cancelled ? { cancelled: true as const, results: null } : {}), dots: [], feed: [], alerts: [], sosPositions: {}, roster: [], reportable: [], stations: [], hand: [], chaserNearby: false, sideQuest: false, caughtBy: null, jailReason: null, arrest: null, endgame: null, hijau: null, penjaraLockedUntil: null, activeEndsAt: null, flareReadyAt: null, jailCheckins: null, checkin: null, chaserSnapshot: null, snapshotted: false, deckLeft: null, activePowerUp: null, settle: null, rescue: null, reel: null, freezeTargets: null, frozenUntil: null, comboReady: false, tollGates: [], datoStash: undefined, bomohStash: undefined, ringStash: undefined, hijauStash: undefined, kit: undefined, briefing: null, reports: [], ratings: [] }
  }
  return v
}

/** My own row without when the side quest woke: the client reads `sideQuest`, never the time. */
function withoutSideQuest(me: Player): Player {
  const { side_quest_at: _woke, ...rest } = me
  return rest
}

/**
 * The organiser's view of both Tupperwares, in every phase: which legendary each holds, where it was dropped (null
 * until then), whether it's been claimed, and the mirrored spot the kit suggests. A side that is off is left out,
 * and outside Full there is none. The spot and the slips never go to anyone else.
 */
function tupperwareFor(i: ViewInput): View['tupperware'] {
  const suggested = mirroredSpots(i.game.arena, i.game.id)
  const out: NonNullable<View['tupperware']> = {}
  for (const side of TUPPER_SIDES) {
    const legendary = legendaryOn(i.game, side)
    if (!legendary) continue
    const box = boxFor(i.game, side)
    out[side] = {
      legendary,
      suggested: suggested[side],
      dropped: box ? { lat: box.spot.lat, lng: box.spot.lng } : null,
      claimed: !!box && box.spot.claimedBy !== null,
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/** True only once a ping has woken the side quest for me, and while my side's Tupperware is still there to find. */
function sideQuestOn(i: ViewInput, phase: Phase): boolean {
  const side = sideOf(i.me.role)
  if (!side || !i.me.side_quest_at || phase !== 'chasing') return false
  const box = boxFor(i.game, side)
  return !!box && box.spot.claimedBy === null
}

function fullView(input: ViewInput): View {
  // The endgame stays hidden from every view, the organiser's too, until it is revealed: every helper below reads
  // this masked game, so no ping time, banner or feed line can give it away early.
  const i: ViewInput = { ...input, game: maskEndgame(input.game) }
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
  } else if (role === 'runner' && isOut(i.me)) {
    dots = everyoneAt(i, i.now - delayMs)
  } else if (role === 'chaser') {
    ;({ dots, notes } = chaserDots(i))
  } else if (role === 'runner') {
    const r = runnerDots(i)
    dots = r.dots
    chaserNearby = r.nearby
  }

  // Hang Hebat: the wanted runner's dot is marked for everyone who watches the map from outside the free runners.
  const e = i.game.endgame
  if (hebatLive(i.game) && (role === 'marshal' || role === 'chaser' || (role === 'runner' && isOut(i.me)))) {
    dots = dots.map((d) => (d.id === e!.wanted ? { ...d, wanted: true as const } : d))
  }

  const lastReveal = revealedPings(i.pings).at(-1)
  const upcoming = phase === 'hiding' || phase === 'chasing' ? nextReveal(i.game, i.pings, i.now) : null

  const runnersNow = i.players.filter((p) => p.role === 'runner')
  const feedContext: FeedContext = {
    meId: i.me.id,
    side: i.me.role === 'runner' || i.me.role === 'chaser' ? i.me.role : null,
    freeNow: runnersNow.filter((p) => !isOut(p)).length,
    jailedNow: runnersNow.filter((p) => p.jailed).length,
    tappedGreen: !!i.game.hijau?.tapped.includes(i.me.id),
    hijauTarget: hijauTargetMe(i),
    pkp: revealed(i.game, 'pkp'),
  }
  // Newest first; events recorded in the same millisecond keep their recorded order (later first).
  const feed = [
    ...i.events.flatMap((e) => {
      const line = feedLine(e, byId, feedContext)
      return (Array.isArray(line) ? line : line ? [line] : []).map((l) => ({ at: e.at, ...l }))
    }),
    ...[...notes, ...snapshotLines(i, phase, endsAt), ...floodNotes(i)].map((n) => ({ ...n, means: null, act: false, label: null })),
  ]
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at) || b.order - a.order)
    .map(({ entry }) => entry)
    .slice(0, FEED_MAX)

  const runners = i.players.filter((p) => p.role === 'runner')
  const organiser = i.me.id === 'host'
  const showRoster = phase === 'lobby' || phase === 'ended' || role === 'marshal'

  return {
    phase,
    endsAt,
    now: i.now,
    paused: !!i.game.paused_at,
    alerts: role === 'marshal' ? alertsFrom(i.events) : [],
    sosPositions: role === 'marshal' ? sosPositionsFor(i) : {},
    reportable: i.players.filter((p) => p.id !== i.me.id).map((p) => ({ id: p.id, name: p.name })),
    me: withoutSideQuest(i.me),
    arena: i.game.arena,
    settings: organiser ? i.game.settings : withoutSecrets(i.game.settings),
    // The roll's own rule (Core only knows Bomba), asked with a fixed draw; only whether it finds a kind leaves here.
    endgameOn: rollEndgame(i.game.settings, () => 0) !== null,
    dots,
    nextRevealAt: upcoming?.revealAt ?? null,
    nextAlertAt: upcoming?.alertAt ?? null,
    lastRevealAt: lastReveal ? Date.parse(lastReveal.reveal_at) : null,
    chaserNearby,
    sideQuest: sideQuestOn(i, phase),
    caughtBy: i.me.jailed && i.me.caught_by ? (byId.get(i.me.caught_by)?.name ?? null) : null,
    jailReason: jailReasonFor(i),
    wetUntil: wetUntilFor(i),
    arrest: arrestFor(i),
    hijau: hijauFor(i, phase),
    penjaraLockedUntil: penjaraLockedUntilFor(i, phase),
    outWarned: !!i.me.out_warned_at && !i.me.disqualified_at,
    activeEndsAt: (() => {
      const shield = activeShield(i.powerUps, i.me.id, i.now)
      // When it armed, not when it was used: a doubled Durian's second half gets its own fresh 10 minutes.
      const armed = shield ? shieldArmedAt(shield, i.powerUps) : null
      return armed === null ? null : armed + SHIELD_MS
    })(),
    flareReadyAt: (() => {
      const holding = i.powerUps.some((u) => u.player_id === i.me.id && u.kind === 'flare' && u.used_at === null && !u.taken_at)
      const blocked = holding ? flareBlocked(i.pings, i.now) : null
      return blocked ? i.now + blocked.readyInMs : null
    })(),
    jailCheckins: jailCheckinsFor(i, jailReasonFor(i)),
    checkin: checkinFor(i, phase),
    chaserSnapshot: chaserSnapshotFor(i),
    snapshotted: snapshottedFor(i, phase),
    endgame: endgameFor(i, byId),
    feed,
    counts: {
      runnersFree: runners.filter((p) => !isOut(p)).length,
      runnersJailed: runners.filter((p) => p.jailed).length,
      runnersLuarGarisan: runners.filter((p) => !p.removed_at && !!p.disqualified_at).length,
      chasers: i.players.filter((p) => p.role === 'chaser').length,
    },
    roster: showRoster
      ? i.players.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          tag_id: p.tag_id,
          jailed: p.jailed,
          disqualified_at: p.disqualified_at ?? null,
          caught_by: p.caught_by ? (i.players.find((c) => c.id === p.caught_by)?.name ?? null) : null,
          caught_at: p.caught_at,
          freed_once: p.freed_once,
          ...(organiser || role === 'marshal'
            ? { pushOn: !!p.push, undoKejarId: phase === 'chasing' && p.role === 'runner' ? (undoableCatchId(p, i.events) ?? undoableArrestId(p)) : null }
            : {}),
        }))
      : [],
    reports: postGameReportsFor(i),
    ratings: ratingsFor(i),
    stations: (i.game.arena.stations ?? []).map((s, k) => {
      const until = stationLockedUntil(i.powerUps, k + 1, i.now)
      return { n: k + 1, lat: s.lat, lng: s.lng, lockedUntil: until === null ? null : new Date(until).toISOString() }
    }),
    // `!taken_at`, not `=== null`: a row read before migration 0011 has no taken_at at all (undefined).
    hand: i.powerUps.filter((u) => u.player_id === i.me.id && u.used_at === null && !u.taken_at),
    shieldActive: activeShield(i.powerUps, i.me.id, i.now) !== null,
    deckLeft: deckLeftFor(i),
    activePowerUp: (() => {
      const busy = slotBusy(i.powerUps, i.me.id, i.pings, i.now, i.me)
      return busy?.running ? busy.kind : null
    })(),
    settle: settleFor(i, phase),
    rescue: rescueFor(i, phase),
    fiveLeft: Boolean(i.game.five_warned_at),
    reel: reelFor(i),
    freezeTargets: freezeTargetsFor(i),
    frozenUntil: frozenForMs(i.me, i.now) > 0 ? Date.parse(i.me.frozen_until as string) : null,
    comboReady: comboReady(i.powerUps, i.me.id),
    tollGates: tollGatesFor(i),
    // The stashes go only to the organiser, who hides the boxes. Marshals are the helper, and never see them
    // (rules doc §9b).
    ...(organiser
      ? {
          datoStash: placedStash(i.game.dato_stash),
          bomohStash: placedStash(i.game.bomoh_stash),
          ringStash: placedStash(i.game.ring_stash),
          hijauStash: placedStash(i.game.hijau_stash),
          tupperware: tupperwareFor(i),
        }
      : {}),
    // The packing list: marshals get the shared items, and only the organiser's own view adds the secret ones.
    ...(role === 'marshal' ? { kit: kitFor(i) } : {}),
    briefing: briefingFor(i, organiser),
    results: i.results,
  }
}

/** The endgame as a player sees it (see `View.endgame`): nothing until the reveal, and nothing for a Hang Hebat with nobody wanted. */
/** Banjir Kilat: when my 30 s in the water runs out, pauses not counted; null when I'm dry or it isn't on. */
function wetUntilFor(i: ViewInput): number | null {
  const me = i.me
  const since = wetSince(me)
  if (since === null || me.role !== 'runner' || me.jailed || me.disqualified_at || me.arrest) return null
  if (phaseAt(i.game, i.now).phase !== 'chasing' || !floodNow(i.game, i.now)) return null
  return i.now + Math.max(0, FLOOD_GRACE_MS - wetElapsed(i.game, since, i.now))
}

/** Banjir Kilat's feed lines: each rise is warned 60 s ahead, then happens. Worked out from the clock, not stored. */
function floodNotes(i: ViewInput): { at: string; text: string }[] {
  if (!floodNow(i.game, i.now)) return []
  return floodSteps(i.game, i.now).flatMap((s) => [
    ...(s.warnAt <= i.now ? [{ at: new Date(s.warnAt).toISOString(), text: "The water's rising. Dry land shrinks in 60 s." }] : []),
    ...(s.at <= i.now ? [{ at: new Date(s.at).toISOString(), text: 'The water rose.' }] : []),
  ])
}

function endgameFor(i: ViewInput, byId: Map<string, Player>): View['endgame'] {
  const e = i.game.endgame
  if (!e || !revealed(i.game)) return null
  let wanted: { id: string; label: string; name: string } | null = null
  if (e.kind === 'hebat') {
    const w = e.wanted ? byId.get(e.wanted) : undefined
    if (!w) return null
    wanted = { id: w.id, label: tagLabel(w), name: w.name }
  }
  return { kind: e.kind, revealedAt: Date.parse(e.revealedAt!), wanted, bountyCaught: !!e.bountyAt, ...(e.kind === 'banjir' ? { flood: floodNow(i.game, i.now) } : {}) }
}

/** The briefing view (see `View.briefing`): the organiser's tally, a player's open/ready, nothing for marshals. */
function briefingFor(i: ViewInput, organiser: boolean): BriefingPlayerView | BriefingHostView | null {
  const started = Boolean(i.game.briefed_at)
  if (organiser) {
    const sided = i.players.filter((p) => p.role === 'runner' || p.role === 'chaser')
    const status = Object.fromEntries(
      sided.map((p) => [p.id, p.brief_ready_at ? 'ready' : p.brief_opened_at ? 'reading' : 'not opened'] as const),
    )
    return { started, ready: sided.filter((p) => p.brief_ready_at).length, total: sided.length, status }
  }
  if (i.me.role !== 'runner' && i.me.role !== 'chaser') return null
  const ready = Boolean(i.me.brief_ready_at)
  return { open: started && !ready, ready }
}

/** Players' and marshals' settings: the legendaries and the endgame switches stay with the organiser. */
function withoutSecrets(s: Settings): Omit<Settings, 'legendaries' | 'endgames'> {
  const { legendaries: _hidden, endgames: _secret, ...rest } = s
  return rest
}

function kitFor(i: ViewInput): KitView {
  const organiser = i.me.id === 'host'
  const kit = kitOf(i.game)
  const places = placeItems(i.game, organiser)
  // The secret step is placed only when the stash is really dropped, never from the saved flag alone (ruling R8).
  const secret = (id: string) => SECRET_PLACE_IDS.includes(id)
  const placed = Object.fromEntries(Object.entries(kit.placed).filter(([id]) => !secret(id) && places.some((p) => p.id === id)))
  for (const side of TUPPER_SIDES) {
    if (boxFor(i.game, side)) placed[`tupper-${side}`] = true
  }
  // The Tupperware lines are the organiser's own: a marshal's list never mentions the box.
  const items = packItems(i.game).filter((item) => organiser || !SECRET_PACK_IDS.includes(item.id))
  return {
    items: items.map((item) => ({ ...item, ticked: isTicked(i.game, item) })),
    placed,
    places,
  }
}
