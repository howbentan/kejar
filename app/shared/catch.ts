import { distanceM } from './geo.js'
import type { LatLng, Phase, Player, Position } from './types.js'

/** Spec §4.6–4.7. */
export const CATCH_RADIUS_M = 50
export const STALE_MS = 2 * 60_000
export const JAIL_RADIUS_M = 30

export type CatchJudgement =
  | { ok: true; flagged: boolean; runnerId: string }
  | { ok: false; reason: 'not-chasing' | 'not-a-chaser' | 'unknown-tag' | 'already-caught' | 'too-far' }

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

  const fresh = (p: Position | null): p is Position => !!p && i.now - Date.parse(p.at) <= STALE_MS
  if (fresh(i.chaserPos) && fresh(i.runnerPos)) {
    if (distanceM(i.chaserPos, i.runnerPos) > CATCH_RADIUS_M) return { ok: false, reason: 'too-far' }
    return { ok: true, flagged: false, runnerId: runner.id }
  }
  return { ok: true, flagged: true, runnerId: runner.id }
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
}): BreakJudgement {
  if (i.phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (i.runner.role !== 'runner' || i.runner.jailed) return { ok: false, reason: 'not-a-free-runner' }
  if (!i.runnerPos || distanceM(i.runnerPos, i.jail) > JAIL_RADIUS_M) return { ok: false, reason: 'too-far-from-jail' }
  const freedIds = i.players.filter((p) => p.role === 'runner' && p.jailed && !p.freed_once).map((p) => p.id)
  if (freedIds.length === 0) return { ok: false, reason: 'nobody-to-free' }
  return { ok: true, freedIds }
}
