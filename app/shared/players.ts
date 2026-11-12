import type { GameEvent, Player } from './types.js'

/**
 * No longer free: jailed in Penjara, or disqualified for Luar Garisan. The one test every
 * "is anyone still free?" check uses, so the game-ending checks, results and counts can't drift apart.
 * The flag is optional on old rows and fixtures, so it is read as truthy.
 */
export function isOut(p: Player): boolean {
  return p.jailed || !!p.disqualified_at
}

/**
 * The id of the catch Undo kejar would undo for this runner (fair-play §1.4), or null: only their latest `caught`
 * event, and only while they are still held by it (jailed by that chaser, with no release since). The caller
 * checks the phase is the chase.
 */
export function undoableCatchId(runner: Player, events: GameEvent[]): string | null {
  if (!runner.jailed || !runner.caught_by) return null
  const latest = events.filter((e) => e.type === 'caught' && e.target_id === runner.id).at(-1)
  if (!latest || latest.actor_id !== runner.caught_by) return null
  if (runner.freed_at && Date.parse(latest.at) < Date.parse(runner.freed_at)) return null
  return latest.id
}

/**
 * The `arrested` event Undo kejar would undo for this runner, or null: only a live house arrest that a chaser's
 * catch fired (Super Ring). The caller checks the phase is the chase.
 */
export function undoableArrestId(runner: Player): string | null {
  const a = runner.arrest
  return a && a.route === 'catch' ? a.catchEventId : null
}
