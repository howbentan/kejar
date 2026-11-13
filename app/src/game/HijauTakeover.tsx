import Marker from './Marker'
import Sticker from './Sticker'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { HIJAU_MS } from '../../shared/hijau.js'
import type { View } from '../../shared/views.js'
import { clock, useServerNow } from './time'

/** How long the safe screen stays up before the chase screen comes back. */
export const SAFE_MS = 2_000
/** A tap lost to a bad connection is sent again after this long, while the 20 s lasts. */
const RETRY_MS = 2_000
/** The draining bar's segments. */
const SEGMENTS = 10

/** What `touchGreen` answers. */
export type TapResult = { ok: true } | { ok: false; reason: string }

/** Ten segments, lit from the left, going out one by one as the 20 s runs down. */
function Segments({ left }: { left: number }) {
  const lit = Math.round((Math.max(0, Math.min(left, HIJAU_MS)) / HIJAU_MS) * SEGMENTS)
  return (
    <div className="hijau-segs" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i key={i} className={i < lit ? 'hijau-seg on' : 'hijau-seg'} />
      ))}
    </div>
  )
}

/**
 * Mak Kau Hijau's takeover on a runner's chase screen (new power-ups §6.3, tap screen A): flat green fills the screen
 * with the sticker, the title, a black panel with the shared countdown and a draining bar, and one black pill. A tap
 * sends `touchGreen` once (the pill waits while it's in flight); a dropped connection is retried quietly until the
 * deadline. Success shows the safe screen with the owner's tick for a moment, then hides. Too late shows nothing new:
 * the Penjara screen follows on the next poll.
 */
export default function HijauTakeover({ view, onTap }: { view: View; onTap: () => Promise<TapResult> }) {
  const ticking = useServerNow(view.now)
  // While paused the deadline is held still: count from the server's moment, not the ticking clock.
  const now = view.paused ? view.now : ticking
  const run = view.hijau
  const [sending, setSending] = useState(false)
  // The run this phone already has an answer for, and the run it tapped successfully. Keyed on `claimedAt`, the one
  // field that never moves: a pause and resume shifts both `startsAt` and `deadline`. A later Mak Kau Hijau has its
  // own `claimedAt`, so it still shows.
  const [answeredRun, setAnsweredRun] = useState<number | null>(null)
  const [safeRun, setSafeRun] = useState<number | null>(null)
  const [safe, setSafe] = useState(false)
  const retry = useRef<number | null>(null)
  const deadline = useRef(run?.deadline ?? 0)
  deadline.current = run?.deadline ?? deadline.current
  const nowRef = useRef(now)
  nowRef.current = now
  const button = useRef<HTMLButtonElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const safeTitle = useRef<HTMLHeadingElement>(null)

  // Hidden once tapped, by the server's word or by this phone's own `ok` (a slow poll may still say not tapped).
  const showing = !!run && !run.tapped && safeRun !== run.claimedAt && now >= run.startsAt
  useEffect(() => {
    if (!showing) return
    navigator.vibrate?.([200, 80, 200, 80, 200])
    button.current?.focus()
  }, [showing])
  useEffect(() => {
    if (!safe) return
    const t = window.setTimeout(() => setSafe(false), SAFE_MS)
    return () => window.clearTimeout(t)
  }, [safe])
  useEffect(() => () => void (retry.current !== null && window.clearTimeout(retry.current)), [])

  function send() {
    const runAt = run?.claimedAt ?? null
    setSending(true)
    onTap().then(
      (r) => {
        setSending(false)
        setAnsweredRun(runAt)
        if (r.ok) {
          setSafeRun(runAt)
          setSafe(true)
        }
      },
      () => {
        // No answer: try again quietly while there's still time; the server judges the deadline.
        if (nowRef.current + RETRY_MS >= deadline.current) {
          setSending(false)
          return
        }
        retry.current = window.setTimeout(send, RETRY_MS)
      },
    )
  }

  if (safe) {
    return (
      <div className="hijau-takeover" role="alertdialog" aria-modal="true" aria-label="Mak kau hijau!">
        <p className="eyebrow">MAK KAU HIJAU · LEGENDARY</p>
        <h1 ref={safeTitle} className="hijau-title">
          safe!
        </h1>
        <button type="button" className="hijau-tick" disabled aria-label="Tapped">
          <BoldTick />
        </button>
        <Marker marks={[{ shape: 'stars', target: safeTitle }]} colour="black" delayMs={300} />
        <p role="status" className="hijau-safe-line">
          Safe! You touched green. The Kejar can see where you tapped.
        </p>
      </div>
    )
  }
  if (!showing) return null
  const left = Math.max(0, run.deadline - now)
  return (
    <m.div
      className="hijau-takeover"
      role="alertdialog"
      aria-modal="true"
      aria-label="Mak kau hijau!"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <p className="eyebrow">MAK KAU HIJAU · LEGENDARY</p>
      <Sticker kind="hijau" size={150} tilt={-4} />
      <h1 ref={title} className="hijau-title">
        mak kau hijau!
      </h1>
      <div className="hijau-panel">
        <div className="hijau-panel-top">
          <span className="eyebrow">TAP IN</span>
          <span className="hijau-count" aria-live="off">
            {clock(left)}
          </span>
        </div>
        <Segments left={left} />
        <p>Miss it and you go to Penjara. Tap and the Kejar see where you are.</p>
      </div>
      <button ref={button} type="button" className="hijau-pill" disabled={sending || answeredRun === run.claimedAt || left === 0} onClick={send}>
        Tap the green
      </button>
      <Marker
        marks={[
          { shape: 'underline', target: title },
          { shape: 'stars', target: title },
        ]}
        colour="black"
        delayMs={150}
      />
    </m.div>
  )
}

/**
 * The owner's hand-drawn tick, traced from their sketch: a short, slightly wobbly down-stroke and a long sweep up,
 * thick black marker with round ends. Draws itself in once; still under reduced motion.
 */
function BoldTick() {
  const reduce = useReducedMotion()
  const d = 'M142 222 C156 262 166 290 186 326 C206 362 228 412 252 464 C300 408 356 338 410 264 C466 186 524 104 584 22'
  return (
    <svg className="bold-tick" viewBox="100 0 520 500" aria-hidden="true">
      <m.path
        d={d}
        fill="none"
        stroke="#0A0A0B"
        strokeWidth={50}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
      />
    </svg>
  )
}
