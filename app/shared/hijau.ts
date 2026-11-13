import type { HijauRun, Player } from './types.js'

/** Mak Kau Hijau (new power-ups §6.3, owner's decision 2026-11-13): runners have 20 s to tap green, one shared deadline. */
export const HIJAU_MS = 20_000

/**
 * The late-push rule for a 20 s window: the one batch push must go out at least this long before the deadline (so
 * within 5 s of the start), or the run is void. Check-ins ask for 25 s, which a 20 s window could never give.
 */
export const HIJAU_MIN_WARNING_MS = 15_000

/** A tap with no usable fix of its own uses the runner's latest stored fix from this long before it, if usable. */
export const HIJAU_FIX_FRESH_MS = 20_000

/** After a run that counted, Penjara is locked this long from the deadline (owner's decision, 2026-11-13). */
export const PENJARA_LOCK_MS = 3 * 60_000

/**
 * When the 20 s starts: the earliest moment at or after the claim whose 20 s overlaps no check-in window
 * (scheduled or Mat Rempit, alert to reveal), so runners never face two buttons at once. Touching a window's
 * edge is fine. Each step moves to a later reveal, so it always ends.
 */
export function hijauStartsAt(claimedAt: number, windows: { alertAt: number; revealAt: number }[]): number {
  let t = claimedAt
  for (;;) {
    const hit = windows.find((w) => w.alertAt < t + HIJAU_MS && w.revealAt > t)
    if (!hit) return t
    t = hit.revealAt
  }
}

/**
 * Whether this run jails, reveals and locks anyone: the one batch push went out at least 15 s before the deadline.
 * No push at all is void. Unlike a check-in this ignores `checkinMode`: in schedule mode a check-in is known in
 * advance so it always counts, but Mak Kau Hijau is a surprise, so only the push can warn anyone.
 */
export function hijauCounts(run: HijauRun): boolean {
  return run.sentAt !== null && Date.parse(run.deadline) - Date.parse(run.sentAt) >= HIJAU_MIN_WARNING_MS
}

/** Who must tap green: runners who are free, not Luar Garisan, not removed and not under house arrest. */
export function hijauTargets(players: Player[]): Player[] {
  return players.filter((p) => p.role === 'runner' && !p.jailed && !p.disqualified_at && !p.removed_at && !p.arrest)
}

type LockGame = { hijau?: HijauRun | null; paused_at?: string | null; pauses?: { from: string; to: string }[] }

/**
 * When a run that counted unlocks Penjara, judged at `at` (the game not paused): 3 minutes from the deadline, plus any
 * pause since the deadline (the lock is held still while paused). The settle stores this as `lockedUntil`.
 */
export function hijauLockEnd(game: LockGame, at: number): number {
  const deadline = Date.parse(game.hijau!.deadline)
  const paused = (game.pauses ?? []).reduce((sum, p) => sum + Math.max(0, Math.min(Date.parse(p.to), at) - Math.max(Date.parse(p.from), deadline)), 0)
  return deadline + PENJARA_LOCK_MS + paused
}

/**
 * How long Penjara stays locked at `at` (0 when it isn't). A settled run locks until its `lockedUntil` (null when it
 * was void). A run past its deadline that hasn't been judged yet (judging is lazy) locks from the deadline if it will
 * count. While paused the lock is held still: time stops at the pause.
 */
export function penjaraLockLeft(game: LockGame, at: number): number {
  const run = game.hijau
  if (!run) return 0
  const t = game.paused_at ? Math.min(at, Date.parse(game.paused_at)) : at
  if (run.settledAt) return run.lockedUntil ? Math.max(0, Date.parse(run.lockedUntil) - t) : 0
  return t >= Date.parse(run.deadline) && hijauCounts(run) ? Math.max(0, hijauLockEnd(game, t) - t) : 0
}

/** `Penjara is locked for 2:14.`, rounding up so it never says 0:00 while locked. */
export function penjaraLockedLine(leftMs: number): string {
  const s = Math.max(0, Math.ceil(leftMs / 1000))
  return `Penjara is locked for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`
}
