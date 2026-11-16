import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import HomeLogo from './homeLogo/HomeLogo'
import { pose, STRIDE } from './homeLogo/stride'
import { pickExit, type Exit } from './homeLogo/exits'

const n = (v: number) => String(Math.round(v * 100) / 100)

/**
 * The logo's j on its own, running on the spot (loaders design, option A): the same drawing and stride as the
 * home logo, at any size. With reduced motion it stands still in the logo's pose.
 */
export function MiniRunner({ height = 22, colour = 'var(--volt)' }: { height?: number; colour?: string }) {
  const still = !!useReducedMotion()
  const run = useRef<SVGGElement>(null)
  const legL = useRef<SVGPathElement>(null)
  const legR = useRef<SVGPathElement>(null)
  useEffect(() => {
    if (still) {
      for (const el of [run.current, legL.current, legR.current]) if (el) el.style.transform = ''
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = pose(((now - start) / 1000) * STRIDE.CADENCE, 1, Infinity)
      if (run.current) run.current.style.transform = `translateY(${n(p.lift)}px) rotate(${n(p.tilt)}deg)`
      if (legL.current) legL.current.style.transform = `rotate(${n(p.legL)}deg)`
      if (legR.current) legR.current.style.transform = `rotate(${n(p.legR)}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [still])
  const s = { fill: 'none', stroke: colour, strokeWidth: 40, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg
      viewBox="-20 -20 366 559"
      width={(height * 366) / 559}
      height={height}
      aria-hidden="true"
      data-testid="mini-runner"
      data-still={still ? 'true' : undefined}
      style={{ overflow: 'visible', flex: 'none' }}
    >
      <g ref={run} style={{ transformBox: 'view-box', transformOrigin: '168px 500px' }}>
        <ellipse {...s} cx="190" cy="61" rx="59" ry="40" />
        <path {...s} d="M157 156 Q169 200 167 260 L168 338" />
        <path ref={legL} {...s} d="M168 338 Q164 400 144 428 Q122 458 88 460 L22 460" style={{ transformBox: 'view-box', transformOrigin: '168px 338px' }} />
        <path ref={legR} {...s} d="M168 338 Q236 326 272 380 Q300 424 302 498" style={{ transformBox: 'view-box', transformOrigin: '168px 338px' }} />
      </g>
    </svg>
  )
}

/** A busy button's content: the small j beside the label, centred. Black on lime, lime on ghost. */
export function BusyLabel({
  label,
  colour = 'var(--black)',
  height = 26,
  stack = false,
}: {
  label?: ReactNode
  colour?: string
  height?: number
  /** The j above the label, for narrow buttons (the runner's scan button). */
  stack?: boolean
}) {
  // The negative margin keeps the button its usual height, so nothing jumps while it waits.
  const row = { gap: 10, margin: '-6px 0' }
  const column = { flexDirection: 'column', gap: 2 } as const
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', ...(stack ? column : row) }}>
      <MiniRunner height={height} colour={colour} />
      {label}
    </span>
  )
}

/** A long wait: the small j beside the line, which keeps its words and loses its "…". */
export function WaitingLine({ children, className = 'muted', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <p className={className} style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <MiniRunner height={30} />
      <span>{children}</span>
    </p>
  )
}

/**
 * The full-size loader: the home logo at its home spot with the j running on the spot and a caption under it.
 * The hidden block below holds the same space as home's buttons (with reconnect showing), which keeps the logo
 * where it sits on home. `leaving` sends the j off the right edge, clearing the screen its `exit` way (see
 * `useLoaderGate`); `children` show under the logo. The caption is one span per letter, so the j can clear each.
 */
export function FullLoader({
  caption,
  leaving = false,
  exit,
  onLeft,
  children,
}: {
  caption: string
  leaving?: boolean
  exit?: Exit
  onLeft?: () => void
  children?: ReactNode
}) {
  return (
    <main className="home" role="status" aria-label={caption}>
      <div className="home-play">
        <HomeLogo
          mode={leaving ? 'leaving' : 'loading'}
          exit={exit}
          onLeft={onLeft}
          caption={
            <>
              {[...caption].map((c, i) => (
                <span key={i} className="hl-ch">
                  {c}
                </span>
              ))}
              {!leaving && (
                <span className="dots" aria-hidden="true">
                  <i>.</i>
                  <i>.</i>
                  <i>.</i>
                </span>
              )}
            </>
          }
        />
        {children}
      </div>
      <div className="home-actions" aria-hidden="true" style={{ visibility: 'hidden' }}>
        <span className="btn btn-paper">reconnect</span>
        <span className="btn">join game</span>
        <span className="btn btn-ghost">organise game</span>
        <span className="home-link">if dk how to play click here :)</span>
      </div>
    </main>
  )
}

/** How long a loader must have been up before its exit plays; quicker loads just show the screen. */
export const EXIT_AFTER_MS = 400

/**
 * Holds a screen back while its full loader plays its exit (loader exits design, 2026-11-16). `ready` is "the data is
 * here"; `instant` shows the screen at once (an error). Use it with the other hooks, then
 * `if (gate.show) return <FullLoader caption="…" {...gate.loader} />`.
 * A screen that is ready from the start never shows the loader; one that loses its data shows it again.
 */
export function useLoaderGate(ready: boolean, instant = false): { show: boolean; loader: { leaving: boolean; exit: Exit; onLeft: () => void } } {
  const [long, setLong] = useState(false)
  const [exit, setExit] = useState<Exit>('wipe')
  const [leaving, setLeaving] = useState(false)
  // Decided while rendering (not in an effect), so the screen never flashes up for a frame before the exit.
  const [wasReady, setWasReady] = useState(ready)
  if (ready !== wasReady) {
    setWasReady(ready)
    setLeaving(ready && long && !instant)
    if (!ready) setLong(false)
  }
  useEffect(() => {
    if (ready) return
    const t = window.setTimeout(() => {
      setExit(pickExit())
      setLong(true)
    }, EXIT_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [ready])
  const onLeft = useCallback(() => setLeaving(false), [])
  return { show: !ready || leaving, loader: { leaving, exit, onLeft } }
}
