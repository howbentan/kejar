import { distanceM } from './geo.js'
import { isOut } from './players.js'
import type { LatLng, Phase, Player, Position } from './types.js'

/** Spec §4.6–4.7. */
export const CATCH_RADIUS_M = 50
/** Plausibility of a catch against the runner's last fix (fair play §1.2). */
export const PLAUSIBLE_BASE_M = 50
export const RUNNER_SPEED_MPS = 6
export const PLAUSIBLE_MAX_AGE_MS = 10 * 60_000
/** A catch beyond this share of the plausible limit is flagged for marshals. */
export const BORDERLINE_RATIO = 0.8
export const JAIL_RADIUS_M = 30
/** A chaser must have a location this recent to catch (blocks catching from photos of tags). */
export const CHASER_FRESH_MS = 60_000
/** Only a runner fix this recent is trusted enough to reject a catch as too far (runners pocket phones). */
export const RUNNER_TRUSTED_MS = 20_000
/** A jailbreak needs a location this recent. */
export const JAIL_FRESH_MS = 30_000
/** Cap on how much GPS error we forgive per phone. */
const MAX_ACCURACY_M = 20
const slack = (p: Position) => Math.min(Math.max(p.accuracy_m, 0), MAX_ACCURACY_M)

export type CatchJudgement =
  /** `label` names the runner for the chaser's stamp: `#07 Aina` (motion design §4). Added by the catch action. */
  | { ok: true; flagged: boolean; runnerId: string; label?: string }
  | { ok: false; reason: 'not-chasing' | 'not-a-chaser' | 'unknown-tag' | 'already-caught' | 'too-far' | 'implausible' | 'no-location' | 'shielded' | 'disqualified' | 'already-out' }

export function judgeCatch(i: {
  phase: Phase
  chaser: Player
  tagId: number | null
  players: Player[]
  chaserPos: Position | null
  runnerPos: Position | null
  now: number
}): CatchJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.chaser.role !== 'chaser') return { ok: false, reason: 'not-a-chaser' }
  // Luar Garisan: catches are refused outright, never a tag-rip that doesn't count (spec §8).
  if (i.chaser.disqualified_at) return { ok: false, reason: 'disqualified' }
  const runner = i.tagId === null ? undefined : i.players.find((p) => p.role === 'runner' && p.tag_id === i.tagId)
  if (!runner) return { ok: false, reason: 'unknown-tag' }
  if (runner.jailed) return { ok: false, reason: 'already-caught' }
  if (runner.disqualified_at) return { ok: false, reason: 'already-out' }

  const age = (p: Position) => i.now - Date.parse(p.at)
  if (!i.chaserPos || age(i.chaserPos) > CHASER_FRESH_MS) return { ok: false, reason: 'no-location' }
  const r = i.runnerPos
  // Nothing to compare against: the rip counts.
  if (!r) return { ok: true, flagged: false, runnerId: runner.id }
  const d = distanceM(i.chaserPos, r)
  // Runners pocket their phones, so an older check-in can't prove they're far away now.
  if (age(r) <= RUNNER_TRUSTED_MS && d > CATCH_RADIUS_M + slack(i.chaserPos) + slack(r)) {
    return { ok: false, reason: 'too-far' }
  }
  // Even a pocketed phone can't have moved this far since its last fix (a photo of a reused tag from across the park).
  const limit = plausibleLimitM(i.chaserPos, r, i.now)
  if (d > limit) return { ok: false, reason: 'implausible' }
  return { ok: true, flagged: d > BORDERLINE_RATIO * limit, runnerId: runner.id }
}

/** How far a runner could plausibly be from their last fix: catch radius, both GPS errors, and running since. */
export function plausibleLimitM(chaserPos: Position, runnerPos: Position, now: number): number {
  const age = Math.max(0, now - Date.parse(runnerPos.at))
  return PLAUSIBLE_BASE_M + slack(chaserPos) + slack(runnerPos) + (RUNNER_SPEED_MPS * Math.min(age, PLAUSIBLE_MAX_AGE_MS)) / 1000
}

export type BreakJudgement =
  | { ok: true; freedIds: string[] }
  | { ok: false; reason: 'not-chasing' | 'not-a-free-runner' | 'too-far-from-jail' | 'nobody-to-free' }

export function judgeJailbreak(i: {
  phase: Phase
  runner: Player
  players: Player[]
  runnerPos: Position | null
  jail: LatLng
  now: number
}): BreakJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.runner.role !== 'runner' || isOut(i.runner)) return { ok: false, reason: 'not-a-free-runner' }
  if (!atJail(i.runnerPos, i.jail, i.now)) return { ok: false, reason: 'too-far-from-jail' }
  const freedIds = i.players.filter((p) => p.role === 'runner' && p.jailed && !p.freed_once).map((p) => p.id)
  if (freedIds.length === 0) return { ok: false, reason: 'nobody-to-free' }
  return { ok: true, freedIds }
}

/** At Penjara: a fix within `JAIL_FRESH_MS`, within `JAIL_RADIUS_M` plus its GPS error (capped). */
function atJail(p: Position | null, jail: LatLng, now: number): boolean {
  return !!p && now - Date.parse(p.at) <= JAIL_FRESH_MS && distanceM(p, jail) <= JAIL_RADIUS_M + slack(p)
}

/** Settle frees the holder plus this many others at most (jail design §4d, rules doc §9c). */
export const SETTLE_MAX_TARGETS = 2

export type SettleJudgement =
  | { ok: true; freedIds: string[] }
  | {
      ok: false
      reason:
        | 'not-chasing'
        | 'not-jailed'
        | 'no-dato'
        | 'too-far-from-jail'
        | 'too-many-targets'
        | 'unknown-target'
        | 'target-already-freed'
        | 'nobody-to-free'
      /** For the target refusals: which pick was wrong. */
      targetId?: string
    }

/**
 * Settle, in hidden-stash mode (jail design §4, §4b, §4d): a jailed runner holding Dato Seri, at Penjara (the
 * same place check as a jailbreak), frees themselves if they haven't used their one escape, plus up to 2 other
 * jailed runners of their choice. Every pick must be a different jailed runner who hasn't used their escape:
 * a bad pick refuses the whole Settle rather than being dropped. Refuses if nobody would be freed.
 * `players` are those still in the game (removed players are left out, so they count as unknown).
 */
export function judgeSettle(i: {
  phase: Phase
  holder: Player
  holdsDato: boolean
  players: Player[]
  holderPos: Position | null
  jail: LatLng
  targetIds: string[]
  now: number
}): SettleJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.holder.role !== 'runner' || !i.holder.jailed) return { ok: false, reason: 'not-jailed' }
  if (!i.holdsDato) return { ok: false, reason: 'no-dato' }
  if (!atJail(i.holderPos, i.jail, i.now)) return { ok: false, reason: 'too-far-from-jail' }
  if (i.targetIds.length > SETTLE_MAX_TARGETS) return { ok: false, reason: 'too-many-targets' }
  const seen = new Set<string>([i.holder.id])
  for (const id of i.targetIds) {
    const t = i.players.find((p) => p.id === id)
    if (!t || seen.has(id) || t.role !== 'runner' || !t.jailed) return { ok: false, reason: 'unknown-target', targetId: id }
    if (t.freed_once) return { ok: false, reason: 'target-already-freed', targetId: id }
    seen.add(id)
  }
  const freedIds = [...(i.holder.freed_once ? [] : [i.holder.id]), ...i.targetIds]
  if (freedIds.length === 0) return { ok: false, reason: 'nobody-to-free' }
  return { ok: true, freedIds }
}
