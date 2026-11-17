import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { RESCUE_PING_MS, RESCUE_RESET_MS } from '../../../shared/penjara'
import { call } from '../api'
import { currentCoords, lastCoords } from '../here'
import { loadSession } from '../session'
import { primeAudio } from '../sounds'
import RescueLock, { type RescueLockMode } from './RescueLock'
import { heldAt, resetsIn, secondsToHold, useRescueNow, type RescueNow } from './rescueTime'
import { useRescueSounds } from './useRescueSounds'

/** What the server answers a press or a let-go: the held time as it now counts it, or why it ignored it. */
type HoldAnswer = { ok: true; heldMs: number; holding: boolean } | { ok: false; reason: string }

/** The hold as the last answer left it, read at `at` on the server's clock. */
type Answered = Pick<RescueNow, 'heldMs' | 'holdSince' | 'resetAt'> & { at: number }

/** A beat waits at most this long for a fresh fix, then goes with the latest known one: it must land within 2 s. */
export const BEAT_FIX_WAIT_MS = 300

const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

/**
 * The rescuer's screen (rules §9a), over the whole chase: the Penjara lock with the key in it, the seconds still to
 * hold, what to do, and the big HOLD button.
 *
 * The thumb going down and coming up are each one `rescueHold` call, sent in order through one queue (a quick tap must
 * not reach the server as up-then-down). The press is itself the first heartbeat, and the beat timer restarts from
 * it. Every RESCUE_PING_MS after that a beat goes out, and it never waits on GPS:
 * - a fix, fresh if one comes within BEAT_FIX_WAIT_MS or else the latest known one, saying `holding: true` while the
 *   thumb is down (thumb up, the fix still goes: the server judges every one against Penjara's 30 m);
 * - with no coordinates at all and the thumb down, `rescueHold { down: true }`, through the same queue, so it can never
 *   land after a let-go and start the hold again.
 * That is at most 40 requests a minute, plus a few for presses, under the 120 per minute a token gets (with the 3 s
 * poll, about 60 in all).
 *
 * Anything that can take the thumb away without its pointerup counts as letting go: a cancelled pointer, the window
 * losing focus, the screen going to the background, this screen going away. Only the pointer that pressed counts: a
 * second finger lifting elsewhere does nothing. Only the server's clock counts held time; between polls the count
 * runs on from the last answer, and the next view takes over from it.
 */
export default function RescueHold({
  code,
  rescue,
  viewNow,
  paused = false,
}: {
  code: string
  rescue: RescueNow
  viewNow: number
  paused?: boolean
}) {
  const [down, setDown] = useState(false)
  const downRef = useRef(false)
  // The pointer that pressed, so only it can let go (null for a key press).
  const pointer = useRef<number | null>(null)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const now = useRescueNow(viewNow, paused, down || rescue.holdSince !== null || answered?.holdSince != null)
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })
  // Calls about the thumb go out one after another, so the server sees it in the order it moved.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  // Bumped by each press: the beat timer starts again from it.
  const [phase, setPhase] = useState(0)

  const thumb = useCallback(
    (d: boolean) => {
      if (downRef.current === d) return
      downRef.current = d
      setDown(d)
      if (!d) pointer.current = null
      if (d) {
        primeAudio()
        setPhase((p) => p + 1)
      }
      const token = loadSession(localStorage, code).token
      if (!token) return
      queue.current = queue.current.then(() =>
        call<HoldAnswer>('rescueHold', { code, token, down: d }).then(
          (r) => {
            // A refusal (paused, or the rescue already ended) changes nothing here: the next view says what happened.
            if (!r.ok) return
            const at = clock.current
            setAnswered({ heldMs: r.heldMs, holdSince: r.holding ? at : null, resetAt: r.holding ? null : at + RESCUE_RESET_MS, at })
          },
          () => undefined,
        ),
      )
    },
    [code],
  )

  // The heartbeat and the 30 m fixes, from the last press on.
  useEffect(() => {
    if (paused) return
    const token = loadSession(localStorage, code).token
    if (!token) return
    const beat = async () => {
      const fresh = await Promise.race([
        currentCoords(RESCUE_PING_MS),
        new Promise<Record<string, never>>((resolve) => window.setTimeout(() => resolve({}), BEAT_FIX_WAIT_MS)),
      ])
      const c = typeof fresh.lat === 'number' && typeof fresh.lng === 'number' ? fresh : lastCoords()
      if (c) {
        await call('location', { code, token, ...c, ...(downRef.current ? { holding: true } : {}) }).catch(() => undefined)
        return
      }
      if (!downRef.current) return
      // No coordinates at all: beat on the key itself, in line with the presses, and only if it is still down by then.
      queue.current = queue.current.then(() =>
        downRef.current ? call('rescueHold', { code, token, down: true }).catch(() => undefined) : undefined,
      )
    }
    const id = window.setInterval(() => void beat(), RESCUE_PING_MS)
    return () => window.clearInterval(id)
  }, [code, paused, phase])

  // Ways the thumb comes off that never reach the button. Read through a ref so a new `thumb` never re-subscribes
  // (an unsubscribe in between would let go).
  const thumbRef = useRef(thumb)
  useEffect(() => {
    thumbRef.current = thumb
  }, [thumb])
  useEffect(() => {
    const up = () => thumbRef.current(false)
    const lifted = (e: globalThis.PointerEvent) => {
      if (pointer.current !== null && e.pointerId === pointer.current) up()
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') up()
    }
    window.addEventListener('pointerup', lifted)
    window.addEventListener('pointercancel', lifted)
    window.addEventListener('blur', up)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pointerup', lifted)
      window.removeEventListener('pointercancel', lifted)
      window.removeEventListener('blur', up)
      document.removeEventListener('visibilitychange', hidden)
      // This screen going away (the rescue ended, the game paused, caught) lets go too.
      if (downRef.current) up()
    }
  }, [])

  // The newest of the view and the last answer: an answer read after this view was made is fresher.
  const live = answered && answered.at >= viewNow ? answered : rescue
  const held = heldAt(live, now)
  const mode: RescueLockMode = down ? 'holding' : held > 0 ? 'paused' : 'idle'
  useRescueSounds(held, mode)

  const line =
    mode === 'holding'
      ? 'Keep holding. Stay within 30 m of Penjara.'
      : mode === 'paused'
        ? `Resets in ${resetsIn(live.resetAt, now)}. Hold again to keep it.`
        : 'Press and hold for 20 s. Let go and it waits 5 s, then resets.'

  const press = (e: PointerEvent<HTMLButtonElement>) => {
    // A second finger on the button changes nothing: the first one still holds it.
    if (downRef.current) return
    pointer.current = e.pointerId
    try {
      // Keeps the pointer on the button if the thumb slides off it.
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // No capture (an old browser): the window's pointerup still lets go.
    }
    thumb(true)
  }
  const lift = (e: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current === null || e.pointerId === pointer.current) thumb(false)
  }

  return (
    <div className="rescue-screen">
      <div className="rescue-body">
        <p className={`eyebrow ${mode === 'paused' ? 'rescue-red' : 'rescue-lime'}`}>{mode === 'paused' ? 'LET GO' : 'RESCUE ON'}</p>
        <RescueLock heldMs={held} mode={mode} size={210} />
        <div className={`rescue-count${mode === 'paused' ? ' dim' : ''}`} role="timer" aria-label="Seconds left to hold">
          {secondsToHold(held)}
          <small>s</small>
        </div>
        <p className="rescue-line">{line}</p>
        <button
          type="button"
          className={`holdbtn${down ? ' down' : ''}`}
          aria-pressed={down}
          disabled={paused}
          onPointerDown={press}
          onPointerUp={lift}
          onPointerCancel={lift}
          onLostPointerCapture={lift}
          onKeyDown={(e) => {
            if (!isHoldKey(e)) return
            e.preventDefault()
            if (!e.repeat) thumb(true)
          }}
          onKeyUp={(e) => {
            if (isHoldKey(e)) thumb(false)
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {down ? 'HOLDING' : 'HOLD'}
        </button>
      </div>
    </div>
  )
}
