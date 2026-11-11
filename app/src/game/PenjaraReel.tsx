import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { REEL_SLOTS } from '../../shared/penjara.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import { loadSession } from './session'
import { isMuted, playBlackSlot, playClunk, playFree, playTick, setMuted } from './sounds'
import { ErrorText } from './ui'

/** The scroll's length, eased so it slows into the result (the mockup's 2.8 s). */
export const SPIN_MS = 2_800
/** How long the screen stays up after the reel stops, so a freed runner reads where to go. */
export const REEL_HOLD_MS = 4_000
/** Each card fills the window, so one card shows at the marker. */
const CARD_PX = 150
const TRAVEL_PX = 66
const LIME_AT = 4

/** Tells the game screen to keep Penjara up while the reel plays and the result is read (a pull may free this runner at once). */
export const REEL_HOLD_EVENT = 'kejar:reel-hold'

export function useReelHold(): boolean {
  const [hold, setHoldState] = useState(false)
  useEffect(() => {
    const on = (e: Event) => setHoldState(!!(e as CustomEvent<boolean>).detail)
    window.addEventListener(REEL_HOLD_EVENT, on)
    return () => window.removeEventListener(REEL_HOLD_EVENT, on)
  }, [])
  return hold
}

const setHold = (on: boolean) => window.dispatchEvent(new CustomEvent(REEL_HOLD_EVENT, { detail: on }))

type Result = 'free' | 'black'
type Phase = 'idle' | 'spinning' | 'landed'

const REFUSALS: Record<string, string> = {
  'too-far-from-jail': 'Get within 30 m of Penjara',
  'not-jailed': 'You are not in Penjara.',
  'not-chasing': 'The reel works during the chase.',
  paused: 'Game is paused',
  disqualified: "You're Luar Garisan, so the reel is closed to you.",
}

/** The ten slots: one lime (none once the escape is used), the rest black. */
const slotsFor = (freedOnce: boolean): ('lime' | 'black')[] =>
  Array.from({ length: REEL_SLOTS }, (_, i) => (!freedOnce && i === LIME_AT ? 'lime' : 'black'))

/**
 * The Penjara reel (§2.2, jail design §3a): a jailed runner at Penjara gets one pull per stay. The server picks the
 * slot; this only animates to it. A lime-bordered window with ten cards (one lime, nine black, no text), a lever
 * underneath that can be dragged down or tapped, and a scroll of about 2.8 s that stops with a small shake.
 */
export default function PenjaraReel({
  code,
  freedOnce,
  reel,
}: {
  code: string
  /** The escape is used: the reel is all black. */
  freedOnce: boolean
  reel: NonNullable<View['reel']>
}) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>(reel.pulled ? 'landed' : 'idle')
  const [result, setResult] = useState<Result | null>(reel.pulled ? (reel.result ?? 'black') : null)
  const [rolled, setRolled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [muted, setMutedState] = useState(isMuted)
  const [dragY, setDragY] = useState<number | null>(null)
  const [tapDown, setTapDown] = useState(false)
  const [shake, setShake] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const drag = useRef<{ startY: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)
  const stop = useRef<(() => void) | null>(null)
  const spent = phase !== 'idle'
  // Frozen at mount: a free pull sets freed_once on the next poll, which must not repaint the winning card black.
  const [wasFreedOnce] = useState(freedOnce)
  const slots = slotsFor(wasFreedOnce)
  // The scroll runs over three copies of the ten slots, so it passes the marker a few times before it stops.
  const cards = rolled ? [...slots, ...slots, ...slots] : slots

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout)
      stop.current?.()
      setHold(false)
    },
    [],
  )

  const later = (fn: () => void, ms: number) => void timers.current.push(window.setTimeout(fn, ms))

  const land = (r: Result, at: number) => {
    stop.current?.()
    if (strip.current) strip.current.style.transform = `translateY(${-at * CARD_PX}px)`
    setPhase('landed')
    setResult(r)
    playClunk()
    setShake(true)
    later(() => setShake(false), 350)
    if (r === 'free') {
      playFree()
      navigator.vibrate?.([200, 80, 300])
    } else {
      playBlackSlot()
      navigator.vibrate?.(80)
    }
    later(() => setHold(false), REEL_HOLD_MS)
  }

  const spin = (r: Result) => {
    // Free lands on the lime card; black lands on a black one (never the lime), always in the last copy.
    const blacks = slots.flatMap((k, i) => (k === 'black' ? [i] : []))
    const slot = r === 'free' ? LIME_AT : blacks[Math.floor(Math.random() * blacks.length)]
    if (reduce) {
      // No scroll: the ten cards stay as they are and the strip jumps to the result.
      land(r, slot)
      return
    }
    const at = REEL_SLOTS * 2 + slot
    setRolled(true)
    setPhase('spinning')
    let last = 0
    const a = animate(0, at * CARD_PX, {
      duration: SPIN_MS / 1000,
      ease: [0.12, 0.75, 0.15, 1],
      onUpdate: (v) => {
        if (strip.current) strip.current.style.transform = `translateY(${-v}px)`
        const i = Math.round(v / CARD_PX)
        if (i !== last) {
          last = i
          playTick()
        }
      },
    })
    stop.current = () => a.stop()
    later(() => land(r, at), SPIN_MS)
  }

  async function pull() {
    if (busy || spent) return
    setBusy(true)
    setError('')
    setTapDown(true)
    later(() => setTapDown(false), 260)
    playClunk()
    setHold(true)
    try {
      const here = await currentCoords()
      const r = await call<{ ok: true; result: Result } | { ok: false; reason: string }>('pullReel', {
        code,
        token: loadSession(localStorage, code).token,
        ...here,
      })
      if (r.ok) spin(r.result)
      else if (r.reason === 'already-pulled') {
        // Pulled on another screen this stay and still in Penjara: it was black.
        setPhase('landed')
        setResult('black')
        setHold(false)
      } else {
        setError(REFUSALS[r.reason] ?? 'The reel did not move. Try again.')
        setHold(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setHold(false)
    } finally {
      setBusy(false)
    }
  }

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy || spent) return
    drag.current = { startY: e.clientY, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const y = Math.max(0, Math.min(TRAVEL_PX, e.clientY - d.startY))
    if (y > 6) d.moved = true
    setDragY(y)
  }
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const y = Math.max(0, Math.min(TRAVEL_PX, e.clientY - d.startY))
    setDragY(null)
    if (d.moved) {
      // A drag, not a tap: the click that follows must not pull twice.
      swallowClick.current = true
      if (y >= TRAVEL_PX * 0.85) void pull()
    }
  }
  const click = () => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    void pull()
  }

  const handleY = dragY ?? (tapDown || phase === 'spinning' ? TRAVEL_PX : 0)
  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
  }

  return (
    <div className={`reel-machine${shake ? ' shake' : ''}`}>
      <div className="reel-top">
        <p className="eyebrow">PENJARA</p>
        <button type="button" className="reel-mute" onClick={toggleMute}>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>
      <h2 className="reel-title">Your pull.</h2>
      <p className="muted">One pull. One slot sets you free.</p>
      <div className="reel-win">
        <div ref={strip} className="reel-strip">
          {cards.map((kind, i) => (
            <div key={i} data-testid="reel-card" data-kind={kind} className={`reel-card ${kind}`} aria-hidden="true" />
          ))}
        </div>
        <div className="reel-mark" aria-hidden="true" />
        {phase === 'landed' && result === 'free' && <div className="reel-flash" aria-hidden="true" />}
      </div>
      <button
        type="button"
        className={`reel-lever${spent ? ' spent' : ''}`}
        aria-label="Pull the lever"
        disabled={busy || spent}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null
          setDragY(null)
        }}
        onClick={click}
      >
        <span className="reel-track" />
        <span className="reel-handle" style={{ top: handleY }}>
          <i>
            <b />
            <b />
            <b />
          </i>
        </span>
      </button>
      <p className="reel-hint">{spent ? 'ONE PULL PER STAY' : 'PULL THE LEVER DOWN ↓'}</p>
      {phase === 'landed' && result === 'black' && (
        <div role="status" className="reel-out">
          <p>Not this time. Wait for a rescue.</p>
        </div>
      )}
      {phase === 'landed' && result === 'free' && (
        <div role="status" className="reel-out free">
          <p className="reel-k">YOU'RE FREE</p>
          <p>Keluar penjara! Walk away from Penjara and hide. This uses your one escape.</p>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
