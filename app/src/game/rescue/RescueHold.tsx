import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { RESCUE_RESET_MS } from '../../../shared/penjara'
import { call } from '../api'
import { loadSession } from '../session'
import { primeAudio } from '../sounds'
import RescueLock, { type RescueLockMode } from './RescueLock'
import { heldAt, resetsIn, secondsToHold, useRescueNow, type RescueNow } from './rescueTime'
import { useRescueSounds } from './useRescueSounds'

/** What the server answers a press or a let-go: the held time as it now counts it, or why it ignored it. */
type HoldAnswer = { ok: true; heldMs: number; holding: boolean } | { ok: false; reason: string }

/** The hold as the last answer left it, read at `at` on the server's clock. */
type Answered = Pick<RescueNow, 'heldMs' | 'holdSince' | 'resetAt'> & { at: number }

const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

/**
 * The rescuer's screen (rules §9a), over the whole chase: the Penjara lock with the key in it, the seconds still to
 * hold, what to do, and the big HOLD button. The thumb going down and coming up are each one `rescueHold` call, sent
 * in order (a quick tap must not reach the server as up-then-down); the fixes RunnerChase sends every 1.5 s are the
 * heartbeat in between (`onThumb` tells it whether to say `holding`). Anything that can take the thumb away without a
 * pointerup counts as letting go: a cancelled pointer, the window losing focus, the screen going to the background,
 * this screen going away. Only the server's clock counts held time; between polls the count runs on from the last
 * answer, and the next view takes over from it.
 */
export default function RescueHold({
  code,
  rescue,
  viewNow,
  paused = false,
  onThumb,
}: {
  code: string
  rescue: RescueNow
  viewNow: number
  paused?: boolean
  onThumb?: (down: boolean) => void
}) {
  const [down, setDown] = useState(false)
  const downRef = useRef(false)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const now = useRescueNow(viewNow, paused, down || rescue.holdSince !== null || answered?.holdSince != null)
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })
  // Calls go out one after another, so the server sees the thumb in the order it moved.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const thumb = useCallback(
    (d: boolean) => {
      if (downRef.current === d) return
      downRef.current = d
      setDown(d)
      onThumb?.(d)
      if (d) primeAudio()
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
    [code, onThumb],
  )

  // Ways the thumb comes off that never reach the button. Read through a ref so a new `thumb` never re-subscribes
  // (an unsubscribe in between would let go).
  const thumbRef = useRef(thumb)
  useEffect(() => {
    thumbRef.current = thumb
  }, [thumb])
  useEffect(() => {
    const up = () => thumbRef.current(false)
    const hidden = () => {
      if (document.visibilityState === 'hidden') up()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
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
    try {
      // Keeps the pointer on the button if the thumb slides off it.
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // No capture (an old browser): the window's pointerup still lets go.
    }
    thumb(true)
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
          onPointerUp={() => thumb(false)}
          onPointerCancel={() => thumb(false)}
          onLostPointerCapture={() => thumb(false)}
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
