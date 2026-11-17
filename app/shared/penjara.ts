import { JAIL_RADIUS_M } from './catch.js'
import { phaseAt } from './clock.js'
import { distanceM } from './geo.js'
import { isOut } from './players.js'
import type { Game, LatLng, Player, Position, RescueRecord } from './types.js'

/** How long a rescuer must keep a thumb on the key, in all, before everyone eligible is freed (rules §9a). */
export const RESCUE_HOLD_MS = 20_000
/** Let go, and the key waits this long for the thumb to come back before the whole hold resets. */
export const RESCUE_RESET_MS = 5_000
/**
 * A thumb that sends no heartbeat for this long counts as let go, at the last beat (the phone died or lost signal).
 * With a beat every RESCUE_BEAT_MS that is about two missed beats, so one slow request never lets go.
 */
export const RESCUE_BEAT_LAPSE_MS = 3_000
/** A freed runner cannot be tagged again for this long (rules §9a); see `judgeCatch`. */
export const HEAD_START_MS = 10_000
/** A rescue's reach: the same as a jailbreak scan's. */
export const RESCUE_RADIUS_M = JAIL_RADIUS_M
/** How often the rescuer's phone beats during the hold: its location, or the key itself with no fix. */
export const RESCUE_BEAT_MS = 1_000
/** A fix less accurate than this neither fails nor helps a rescue (GPS leniency, rules §9a). */
export const RESCUE_MAX_ACCURACY_M = 20

/**
 * Reads a rescue stored in the old shape (`{ by, startedAt }` only, from before the held key) as a key already let
 * go at its start with nothing held. Such a rescue just waits out the reset window; it never frees anyone.
 */
export function legacyRescue(r: { by: string; startedAt: string } & Partial<RescueRecord>): RescueRecord {
  const holdSince = r.holdSince ?? null
  return {
    by: r.by,
    startedAt: r.startedAt,
    heldMs: r.heldMs ?? 0,
    holdSince,
    lastBeat: r.lastBeat ?? null,
    releasedAt: r.releasedAt ?? (holdSince ? null : r.startedAt),
  }
}

/**
 * How much of the key is turned at `now`. Only the server's clock counts. While the thumb is down, held time counts
 * up to `min(now, lastBeat + RESCUE_BEAT_LAPSE_MS)`; a thumb that has gone quiet past the
 * lapse counts as lifted at its last beat, so held time stops there and the reset window runs from that beat.
 * `offSince` is when the thumb came off (ms), or null while it is on.
 */
export function rescueProgress(r: RescueRecord, now: number): { heldMs: number; holding: boolean; offSince: number | null } {
  if (!r.holdSince) return { heldMs: r.heldMs, holding: false, offSince: Date.parse(r.releasedAt ?? r.startedAt) }
  const since = Date.parse(r.holdSince)
  const beat = Math.max(since, Date.parse(r.lastBeat ?? r.holdSince))
  if (now > beat + RESCUE_BEAT_LAPSE_MS) return { heldMs: r.heldMs + (beat - since), holding: false, offSince: beat }
  return { heldMs: r.heldMs + Math.max(0, now - since), holding: true, offSince: null }
}

/**
 * Held time the phone has proved at `now`: what is banked, plus the live stretch only up to its last beat (or the
 * let-go). `rescueProgress` counts on past the last beat while the thumb may still be down, which is right for the
 * screens but not for winning: a phone that went quiet at 18.3 s must not free anyone at 20 s. Only this frees.
 */
export function confirmedHeldMs(r: RescueRecord, now: number): number {
  const p = rescueProgress(r, now)
  if (!p.holding || !r.holdSince) return p.heldMs
  const since = Date.parse(r.holdSince)
  const beat = Math.max(since, Date.parse(r.lastBeat ?? r.holdSince))
  return r.heldMs + (Math.min(beat, now) - since)
}

/**
 * When the key reached 20 s held (ms), or null while the phone hasn't proved it (`confirmedHeldMs`). Nothing settles
 * a rescue the instant it succeeds (there's no server tick), so this is what a late settle judges up to: a fix or a
 * lock that came after it can't take the success back. Held time banked by a let-go counts back from that let-go.
 */
export function rescueSuccessAt(r: RescueRecord, now: number): number | null {
  if (confirmedHeldMs(r, now) < RESCUE_HOLD_MS) return null
  if (r.holdSince) return Date.parse(r.holdSince) + Math.max(0, RESCUE_HOLD_MS - r.heldMs)
  return Date.parse(r.releasedAt ?? r.startedAt) - (r.heldMs - RESCUE_HOLD_MS)
}

export type RescueVerdict = { kind: 'holding' | 'paused' | 'success' } | { kind: 'failed'; reason: 'left' | 'removed' } | { kind: 'reset' }

/**
 * Where a live rescue stands (rules §9a). It fails if the rescuer is gone or out, or if any fix they sent since the
 * rescue began is clearly outside Penjara's 30 m plus its GPS error. A fix sent during a pause is ignored, and so
 * is a poor fix (over 20 m accuracy), so one bad reading never fails it. Otherwise it succeeds at 20 s of confirmed
 * holding (`confirmedHeldMs`), resets once the thumb has been off for 5 s, and is `holding` or `paused` in between.
 */
export function rescueVerdict(i: {
  rescue: RescueRecord
  rescuer: Player | undefined
  fixes: Position[]
  jail: LatLng
  now: number
  /** The game's finished pauses and the open one: a fix sent during a pause is ignored (rules §9a). */
  pauses?: { from: string; to: string }[]
  pausedAt?: string | null
}): RescueVerdict {
  if (!i.rescuer || isOut(i.rescuer)) return { kind: 'failed', reason: 'removed' }
  const startedAt = Date.parse(i.rescue.startedAt)
  const away = i.fixes.some((f) => {
    const at = Date.parse(f.at)
    if (at < startedAt || !(f.accuracy_m <= RESCUE_MAX_ACCURACY_M)) return false
    if (sentDuringPause(at, i.pauses, i.pausedAt)) return false
    return distanceM(f, i.jail) > RESCUE_RADIUS_M + Math.max(f.accuracy_m, 0)
  })
  if (away) return { kind: 'failed', reason: 'left' }
  const { holding, offSince } = rescueProgress(i.rescue, i.now)
  if (confirmedHeldMs(i.rescue, i.now) >= RESCUE_HOLD_MS) return { kind: 'success' }
  if (offSince !== null && i.now - offSince >= RESCUE_RESET_MS) return { kind: 'reset' }
  return { kind: holding ? 'holding' : 'paused' }
}

/** The clicks on the key: one per 5 s of held time. */
export const RESCUE_NOTCHES = 4
/** Where the lock's key sits after `heldMs` of holding: four clicks (`notch` 0 to 4), one per 5 s, a quarter turn in all. */
export const keyTurn = (heldMs: number): { notch: number; angle: number } => {
  const notch = Math.min(RESCUE_NOTCHES, Math.floor((heldMs / RESCUE_HOLD_MS) * RESCUE_NOTCHES + 1e-9))
  // Between clicks the key strains a little toward the next one, so a held thumb always shows movement.
  const into = ((heldMs / RESCUE_HOLD_MS) * RESCUE_NOTCHES) % 1
  const strain = notch < RESCUE_NOTCHES ? Math.min(4, into * 5) : 0
  return { notch, angle: notch * 22.5 + strain }
}

/**
 * True for a fix sent during one of the game's finished pauses, or since its open one began: such a fix counts for
 * nothing (rules §9a). Used by the rescue and by Super Ring's release check.
 */
export function sentDuringPause(at: number, pauses?: { from: string; to: string }[], pausedAt?: string | null): boolean {
  if (pausedAt && at >= Date.parse(pausedAt)) return true
  return !!pauses?.some((p) => at >= Date.parse(p.from) && at <= Date.parse(p.to))
}

/** The Penjara reel's slots (rules §9a): nine black and one lime free slot. */
export const REEL_SLOTS = 10

/** True once this runner has pulled the reel during their current jail stay (a pull older than their catch is spent). */
export function reelPulledThisStay(p: Pick<Player, 'reel_pulled_at' | 'caught_at'>): boolean {
  if (!p.reel_pulled_at) return false
  return !p.caught_at || Date.parse(p.reel_pulled_at) >= Date.parse(p.caught_at)
}

/**
 * Where one pull of the reel lands. The server picks; the phone only animates to it. One slot in `REEL_SLOTS` is
 * free, except for a runner who has used their one escape: their reel is all black.
 */
export function pickReel(rng: () => number, freedOnce: boolean): 'free' | 'black' {
  if (freedOnce) return 'black'
  return Math.floor(rng() * REEL_SLOTS) === 0 ? 'free' : 'black'
}

/** The clock turns lime, and everyone is told once, when this much of the chase is left (rules §2.7). */
export const FIVE_LEFT_MS = 5 * 60_000

/**
 * True when `5 minutes left!` should go out now: mid-chase, not paused, no final whistle pending, not warned yet,
 * and 5 minutes or less on the clock. A game whose chase starts with 5 minutes or less left is due straight away.
 */
export function fiveLeftDue(game: Game, now: number): boolean {
  if (game.five_warned_at || game.paused_at || game.final_whistle_at || game.ended_at) return false
  const { phase, endsAt } = phaseAt(game, now)
  return phase === 'chasing' && endsAt !== null && endsAt - now <= FIVE_LEFT_MS
}
