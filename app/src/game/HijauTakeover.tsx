import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import { clock, useServerNow } from './time'

/** How long `Safe! You touched green.` stays up before the chase screen comes back. */
export const SAFE_MS = 2_000
/** A tap lost to a bad connection is sent again after this long, while the 45 s lasts. */
const RETRY_MS = 2_000

/** What `touchGreen` answers. */
export type TapResult = { ok: true } | { ok: false; reason: string }

/**
 * Mak Kau Hijau's takeover on a runner's chase screen (new power-ups §6.3): deep green fills the screen with one big
 * button and the shared countdown. A tap sends `touchGreen` once (the button waits while it's in flight); a dropped
 * connection is retried quietly until the deadline. Success says `Safe! You touched green.` for a moment, then hides.
 * Too late shows nothing new: the Penjara screen follows on the next poll.
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
        <p className="eyebrow">MAK KAU HIJAU</p>
        <h1>Safe!</h1>
        <button type="button" className="green-btn safe" disabled aria-label="Tapped">
          ✓
        </button>
        <p role="status" style={{ fontWeight: 700, fontSize: 16 }}>
          Safe! You touched green.
        </p>
      </div>
    )
  }
  if (!showing) return null
  const over = now >= run.deadline
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
      <p className="eyebrow">MAK KAU HIJAU</p>
      <h1>Mak kau hijau!</h1>
      <div className="hijau-count" aria-live="off">
        {clock(Math.max(0, run.deadline - now))}
      </div>
      <button ref={button} type="button" className="green-btn" disabled={sending || answeredRun === run.claimedAt || over} onClick={send}>
        Tap the green
      </button>
      <p>Tap the green in 45 s or go to Penjara.</p>
    </m.div>
  )
}
