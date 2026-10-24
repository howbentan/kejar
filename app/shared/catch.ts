import { distanceM } from './geo.js'
import type { LatLng, Phase, Player, Position } from './types.js'

/** Spec §4.6–4.7. */
export const CATCH_RADIUS_M = 50
export const STALE_MS = 2 * 60_000
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
  | { ok: true; flagged: boolean; runnerId: string }
  | { ok: false; reason: 'not-chasing' | 'not-a-chaser' | 'unknown-tag' | 'already-caught' | 'too-far' | 'no-location' | 'shielded' }

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
  const runner = i.tagId === null ? undefined : i.players.find((p) => p.role === 'runner' && p.tag_id === i.tagId)
  if (!runner) return { ok: false, reason: 'unknown-tag' }
  if (runner.jailed) return { ok: false, reason: 'already-caught' }

  const age = (p: Position) => i.now - Date.parse(p.at)
  if (!i.chaserPos || age(i.chaserPos) > CHASER_FRESH_MS) return { ok: false, reason: 'no-location' }
  const r = i.runnerPos
  if (!r || age(r) > STALE_MS) return { ok: true, flagged: true, runnerId: runner.id }
  // Runners pocket their phones, so an older check-in can't prove they're far away now.
  if (age(r) <= RUNNER_TRUSTED_MS && distanceM(i.chaserPos, r) > CATCH_RADIUS_M + slack(i.chaserPos) + slack(r)) {
    return { ok: false, reason: 'too-far' }
  }
  return { ok: true, flagged: false, runnerId: runner.id }
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
  if (i.runner.role !== 'runner' || i.runner.jailed) return { ok: false, reason: 'not-a-free-runner' }
  const p = i.runnerPos
  if (!p || i.now - Date.parse(p.at) > JAIL_FRESH_MS || distanceM(p, i.jail) > JAIL_RADIUS_M + slack(p)) {
    return { ok: false, reason: 'too-far-from-jail' }
  }
  const freedIds = i.players.filter((p) => p.role === 'runner' && p.jailed && !p.freed_once).map((p) => p.id)
  if (freedIds.length === 0) return { ok: false, reason: 'nobody-to-free' }
  return { ok: true, freedIds }
}
