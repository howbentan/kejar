import { useCallback, useEffect, useRef, useState } from 'react'
import { RESCUE_HOLD_MS } from '../../../shared/penjara'
import { rescueFailedText, type View } from '../../../shared/views.js'
import { shouldPlay } from '../moments'
import Stamp from '../Stamp'
import PenjaraGate from './PenjaraGate'
import RescueLock, { type RescueLockMode } from './RescueLock'
import { heldAt } from './rescueTime'
import { useRescueSounds } from './useRescueSounds'

type FailReason = 'caught' | 'left' | 'removed' | 'locked'

/** How a rescue this phone was part of ended, read once from the feed. `heldMs` is how far the key had turned. */
export type RescueEnding = { at: string; rescuer: boolean; heldMs: number } & (
  | { kind: 'freed'; freed: number; meFree: boolean }
  | { kind: 'failed'; reason: FailReason; who: string }
  | { kind: 'reset' }
)

/** The rescue this phone was last part of: as the rescuer, or as a runner in Penjara it would free. */
export interface RescueWatched {
  by: string
  byName: string
  rescuer: boolean
  heldMs: number
  /** The server's time of the last view that still showed it. Its ending was recorded after that. */
  seenAt: number
}

/** Event times and view times are both the server's; a little slack keeps one same-moment write from being missed. */
const SLACK_MS = 2_000
const JAILBREAK = /^Jailbreak! (\d+) Dikejar free\.$/
const FAIL_REASONS: FailReason[] = ['caught', 'left', 'removed', 'locked']

/**
 * How the watched rescue ended, from the newest rescue line in the feed since it was last seen: the jailbreak line
 * (freed) or the failed line naming its rescuer, whose reason says caught, walked away, out, Penjara locked or reset.
 * Null when there is no such line, or for a rescuer who was caught: Penjara's own screen says that.
 */
export function rescueEndingFrom(w: RescueWatched, view: View): RescueEnding | null {
  const base = { rescuer: w.rescuer, heldMs: w.heldMs }
  for (const f of view.feed) {
    if (Date.parse(f.at) < w.seenAt - SLACK_MS) break
    const freed = JAILBREAK.exec(f.text)
    if (freed) return { ...base, at: f.at, kind: 'freed', freed: Number(freed[1]), meFree: !view.me.jailed }
    if (f.text === rescueFailedText('reset', w.byName)) return { ...base, at: f.at, kind: 'reset' }
    const reason = FAIL_REASONS.find((r) => f.text === rescueFailedText(r, w.byName))
    if (reason) return w.rescuer && view.me.jailed ? null : { ...base, at: f.at, kind: 'failed', reason, who: w.byName }
  }
  return null
}

/** The rescue as this viewer takes part in it, or null when it isn't theirs to see end. */
function watching(view: View): RescueWatched | null {
  const r = view.rescue
  if (!r?.by || view.phase !== 'chasing' || view.me.role !== 'runner') return null
  const rescuer = r.by === view.me.id && !view.me.jailed
  const inside = r.by !== view.me.id && view.me.jailed && !view.me.freed_once
  if (!rescuer && !inside) return null
  return { by: r.by, byName: r.byName ?? 'A Dikejar', rescuer, heldMs: heldAt(r, view.now), seenAt: view.now }
}

/**
 * Watches the views for the end of a rescue this phone was part of and hands back its ending, once per ending (also
 * across a reload, through `shouldPlay`). Lives above the screens: a freed runner goes from Penjara to the chase
 * underneath it, so the ending has to outlast both.
 */
export function useRescueEnding(view: View | null): { ending: RescueEnding | null; done: () => void } {
  const watched = useRef<RescueWatched | null>(null)
  const [ending, setEnding] = useState<RescueEnding | null>(null)
  useEffect(() => {
    if (!view) return
    const now = watching(view)
    const was = watched.current
    watched.current = now
    if (!was || now?.by === was.by) return
    const found = rescueEndingFrom(was, view)
    if (found && shouldPlay('rescue-end', found.at, view.now, sessionStorage)) setEnding(found)
  }, [view])
  const done = useCallback(() => setEnding(null), [])
  return { ending, done }
}

const FREED_MS = 4_500
const ENDED_MS = 3_500
/** The lock first shows as it was left, then moves to its ending, so the key spins back or snaps on screen. */
const SETTLE_MS = 150

function failLine(e: Extract<RescueEnding, { kind: 'failed' }>): string {
  if (e.rescuer) return { caught: 'You were caught.', left: 'You walked away.', removed: "You can't rescue any more.", locked: 'Penjara is locked.' }[e.reason]
  return { caught: `${e.who} was caught.`, left: `${e.who} walked away.`, removed: `${e.who} can't rescue any more.`, locked: 'Penjara is locked.' }[e.reason]
}

/**
 * How a rescue ended (rules §9a), over everything for a few seconds; a tap ends it early. Freed: the gate swings open
 * and LEPAS! stamps down, with the head start for the rescuer or for the runner it freed. Failed: the key snaps, with
 * why. Reset: the key spins back. The rescuer's phone plays the unlock or the spin-back.
 */
export default function RescueEnd({ ending, onDone }: { ending: RescueEnding; onDone: () => void }) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const s = window.setTimeout(() => setSettled(true), SETTLE_MS)
    const t = window.setTimeout(onDone, ending.kind === 'freed' ? FREED_MS : ENDED_MS)
    return () => (window.clearTimeout(s), window.clearTimeout(t))
    // Once per ending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lock: { heldMs: number; mode: RescueLockMode } = !settled
    ? { heldMs: ending.heldMs, mode: ending.kind === 'freed' ? 'holding' : 'paused' }
    : ending.kind === 'freed'
      ? { heldMs: RESCUE_HOLD_MS, mode: 'open' }
      : ending.kind === 'failed'
        ? { heldMs: ending.heldMs, mode: 'snapped' }
        : { heldMs: 0, mode: 'idle' }
  useRescueSounds(lock.heldMs, lock.mode, ending.rescuer)

  return (
    <div className="moment rescue-end" role="status" onClick={onDone}>
      {ending.kind === 'freed' ? (
        <>
          <PenjaraGate state="open" size={230} />
          <Stamp text="LEPAS!" />
          {ending.rescuer || !ending.meFree ? (
            <>
              <p className="rescue-big">{`${ending.freed} freed.`}</p>
              <p className="rescue-line">{ending.rescuer ? 'They have a 10 s head start. Now you run too.' : 'They have a 10 s head start.'}</p>
            </>
          ) : (
            <>
              <p className="rescue-big">You're free.</p>
              <p className="rescue-line">Run. 10 s head start: nobody can catch you yet.</p>
            </>
          )}
        </>
      ) : ending.kind === 'failed' ? (
        <>
          <p className="eyebrow rescue-red">RESCUE FAILED</p>
          <RescueLock heldMs={lock.heldMs} mode={lock.mode} size={190} />
          <p className="rescue-big">{failLine(ending)}</p>
          <p className="rescue-line">Nobody gets out this time. Another Dikejar can try.</p>
        </>
      ) : (
        <>
          <RescueLock heldMs={lock.heldMs} mode={lock.mode} size={190} />
          <p className="rescue-big">Rescue reset.</p>
          <p className="rescue-line">{ending.rescuer ? 'Scan Penjara to start again.' : 'Another Dikejar can try.'}</p>
        </>
      )}
    </div>
  )
}
