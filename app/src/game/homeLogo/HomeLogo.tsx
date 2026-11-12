import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { stageGeometry, type Geometry } from './geometry'
import { LETTERS, letterSrc, lettersReady } from './letters'
import { pose, STRIDE, wholeStride } from './stride'

/**
 * The home logo with its j as a little runner (design 2026-11-12, the running-j revision):
 * - `home`: runs on the spot in its gap; a tap makes it jump, with a lime flash and a buzz.
 * - `loading`: runs on the spot while a game loads.
 * - `opening`: runs in from off the left edge and stops in its gap, then calls `onArrived`.
 * - `leaving`: sprints off the right edge, then calls `onLeft`.
 * The logo sits at exactly the same spot in every mode. One animation-frame loop moves the j by transforms
 * only; the legs follow the distance run, and every stop lands on a whole stride, in the logo's own pose.
 * Fills its parent, which must be `position: relative` with a height.
 */
export type HomeLogoMode = 'home' | 'loading' | 'opening' | 'leaving'

type Task = (dt: number, now: number) => boolean

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3)
const easeInQuad = (k: number) => k * k
const n = (v: number) => String(Math.round(v * 100) / 100)

/** Restart a one-shot CSS animation class. */
function replay(el: Element | null, cls: string) {
  if (!el) return
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

export default function HomeLogo({
  mode,
  inverted = false,
  caption,
  onArrived,
  onLeft,
}: {
  mode: HomeLogoMode
  /** Black on lime, for the opening screen; flips back with a colour transition. */
  inverted?: boolean
  caption?: ReactNode
  onArrived?: () => void
  onLeft?: () => void
}) {
  const still = !!useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const jEl = useRef<SVGSVGElement>(null)
  const runEl = useRef<SVGGElement>(null)
  const legL = useRef<SVGPathElement>(null)
  const legR = useRef<SVGPathElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  // undefined: not measured yet; null: no size to work with (the j just stands in place).
  const [geo, setGeo] = useState<Geometry | null | undefined>(undefined)
  const body = useRef({ x: 0, phase: 0, lean: 0, rate: 0, jumpAt: -Infinity, flipAt: -Infinity, taps: [] as number[], now: 0, last: 0 })
  const task = useRef<Task | null>(null)
  const live = useRef({ geo, still, mode, onArrived, onLeft })
  live.current = { geo, still, mode, onArrived, onLeft }

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setGeo(r.width > 0 && r.height > 0 ? stageGeometry(r.width, r.height) : null)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function draw() {
    const s = body.current
    const p = live.current.still ? pose(0, 0, Infinity) : pose(s.phase, s.lean, s.now - s.jumpAt, s.now - s.flipAt)
    if (jEl.current) jEl.current.style.transform = `translateX(${n(s.x)}px)`
    if (runEl.current) runEl.current.style.transform = `translateY(${n(p.lift)}px) rotate(${n(p.tilt)}deg) translateY(-220px) rotate(${n(p.spin)}deg) translateY(220px) scale(${n(p.sx)}, ${n(p.sy)})`
    if (legL.current) legL.current.style.transform = `rotate(${n(p.legL)}deg)`
    if (legR.current) legR.current.style.transform = `rotate(${n(p.legR)}deg)`
  }

  /** Run on the spot, easing up to full cadence and lean. */
  function spot(): Task {
    const s = body.current
    return (dt) => {
      s.rate = Math.min(STRIDE.CADENCE, s.rate + dt * STRIDE.CADENCE * 4)
      s.lean = Math.min(1, s.lean + dt * 4)
      s.phase += s.rate * dt
      return false
    }
  }

  /** Run to `x1` over `ms`: legs keep their cadence and follow the distance, and stop on a whole stride. */
  function runTo(x1: number, ms: number, ease: (k: number) => number, extraPerSec: number, done: () => void): Task {
    const s = body.current
    const jw = live.current.geo?.jw ?? 69
    const x0 = s.x
    const p0 = s.phase
    const lean0 = s.lean
    const carry = s.rate * (ms / 1000) // strides it would take anyway at its current cadence
    const target = wholeStride(p0, Math.abs(x1 - x0), jw * 1.15, carry + (extraPerSec * ms) / 1000)
    let t0 = -1
    return (_dt, now) => {
      if (t0 < 0) t0 = now
      const k = Math.min(1, (now - t0) / ms)
      const e = ease(k)
      s.x = x0 + (x1 - x0) * e
      s.phase = p0 + carry * k + (target - p0 - carry) * e
      const slope = (ease(Math.min(1, k + 0.02)) - e) / 0.02
      s.lean = Math.min(1, Math.max(slope * 0.9, k < 0.15 ? lean0 : 0))
      if (k < 1) return false
      Object.assign(s, { x: x1, phase: target, lean: 0, rate: 0 })
      done()
      return true
    }
  }

  // One frame loop for the life of the component; it pauses while the tab is hidden.
  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const s = body.current
      if (document.visibilityState !== 'visible') {
        s.last = 0
        return
      }
      const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60
      s.last = now
      s.now = now
      if (task.current && task.current(dt, now)) task.current = null
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The loop reads everything through refs, so it starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // What the j is doing, set whenever the mode changes (once the stage is measured).
  const measured = geo !== undefined
  useEffect(() => {
    if (!measured) return
    const s = body.current
    const g = live.current.geo
    const quick = still || !g
    /**
     * Finish a run once, whichever comes first: the run itself, or a safety timeout. Some browsers stop
     * delivering animation frames while still showing the page; the buttons must appear regardless.
     */
    const finishOnce = (x: number, done: () => void, safetyMs: number) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        window.clearTimeout(safety)
        task.current = null
        Object.assign(s, { x, phase: Math.round(s.phase), lean: 0, rate: 0 })
        draw()
        done()
      }
      const safety = window.setTimeout(finish, safetyMs)
      return { finish, cancel: () => window.clearTimeout(safety) }
    }

    let cancel = () => {}
    if (mode === 'opening') {
      if (quick) {
        Object.assign(s, { x: 0, phase: 0, lean: 0, rate: 0 })
        task.current = null
        draw()
        live.current.onArrived?.()
        return
      }
      Object.assign(s, { x: -(g.home.x + g.jw + 10), phase: 0, lean: 0, rate: 0 })
      task.current = null
      // Wait for the letters, so a first visit never shows a half-drawn logo (capped at 1.2 s).
      const end = finishOnce(0, () => live.current.onArrived?.(), 3200)
      let stale = false
      void lettersReady().then(() => {
        if (!stale) task.current = runTo(0, 950, easeOutCubic, 0, end.finish)
      })
      cancel = () => {
        stale = true
        end.cancel()
      }
    } else if (mode === 'leaving') {
      if (quick) {
        task.current = null
        live.current.onLeft?.()
        return
      }
      const off = g.stage.w - g.home.x + 20
      const end = finishOnce(off, () => live.current.onLeft?.(), 1500)
      cancel = end.cancel
      task.current = runTo(off, 700, easeInQuad, 1.5, end.finish)
    } else {
      task.current = still ? null : spot()
    }
    draw()
    return () => cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, measured, still])

  useLayoutEffect(draw)

  const onTap = () => {
    if (live.current.mode !== 'home' || live.current.still) return
    const s = body.current
    // Every tap counts toward the triple, even one ignored mid-jump; taps during a flip are ignored outright.
    if (s.now - s.flipAt < STRIDE.FLIP_MS + 100) return
    s.taps = s.taps.filter((t) => s.now - t < 600).concat(s.now)
    if (s.taps.length >= 3) {
      s.taps = []
      s.flipAt = s.now
      s.jumpAt = -Infinity
    } else {
      if (s.now - s.jumpAt < STRIDE.JUMP_MS + 100) return
      s.jumpAt = s.now
    }
    replay(flash.current, 'on')
    try {
      navigator.vibrate?.(25)
    } catch {
      // Vibration is a nicety.
    }
  }

  const g = geo ?? null
  return (
    <div ref={root} className={`hl${inverted ? ' inverted' : ''}${mode === 'home' ? ' tappable' : ''}`} data-testid="hl" onPointerDown={onTap}>
      <div ref={flash} className="hl-flash" />
      {/* Always in the page, so the logo is there for screen readers even before the first measure. */}
      <div className="hl-logo" role="img" aria-label="kejar." style={g ? { left: g.logo.x, top: g.logo.y, width: g.logo.w, height: g.logo.h } : { opacity: 0 }}>
        {LETTERS.map((l) => (
          <span key={l} className="hl-ltr" style={{ ['--m' as string]: `url(${letterSrc(l)})` }} />
        ))}
        <svg
          ref={jEl}
          className="hl-j"
          data-testid="hl-j"
          viewBox="0 0 326 519"
          aria-hidden="true"
          style={g ? { left: g.home.x - g.logo.x, top: g.home.y - g.logo.y, width: g.jw, height: g.jh } : undefined}
        >
          <g ref={runEl} className="run">
            <ellipse className="s" cx="190" cy="61" rx="59" ry="40" />
            <path className="s" d="M157 156 Q169 200 167 260 L168 338" />
            <path ref={legL} className="s leg l" d="M168 338 Q164 400 144 428 Q122 458 88 460 L22 460" />
            <path ref={legR} className="s leg r" d="M168 338 Q236 326 272 380 Q300 424 302 498" />
          </g>
        </svg>
      </div>
      {caption && (
        <p className="hl-caption" style={g ? { top: g.logo.y + g.logo.h + 22 * g.scale } : undefined}>
          {caption}
        </p>
      )}
    </div>
  )
}
