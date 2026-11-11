import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import Sticker from '../Sticker'
import type { StickerKind } from '../stickerArt'
import { canCatch, caught, pickSticker, relaunch, stageGeometry, startState, step, TOY, type Geometry, type ToyState } from './physics'

/** Restart a one-shot CSS animation class. */
function replay(el: Element | null, cls: string) {
  if (!el) return
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

/**
 * Catch the j (design 2026-11-12): the logo, with its j loose. The j spins and bounces like the old DVD logo;
 * tap while it lines up with its gap and it snaps home, turns into a random power-up for a beat, then flies off
 * again. No score and no misses. Fills its parent, which must be `position: relative` with a height. One
 * animation-frame loop moves the j by style transform, so React only renders on a catch.
 */
export default function CatchTheJ({ paused = false, rand = Math.random, testStart }: { paused?: boolean; rand?: () => number; testStart?: Partial<ToyState> }) {
  const reduce = !!useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const logo = useRef<HTMLDivElement>(null)
  const jEl = useRef<HTMLImageElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geometry | null>(null)
  const [sticker, setSticker] = useState<StickerKind | null>(null)
  const state = useRef<ToyState | null>(null)
  const prevKind = useRef<StickerKind | null>(null)
  const live = useRef({ paused, reduce, rand, geo })
  live.current = { paused, reduce, rand, geo }

  // Measure the play area, and again whenever it changes size (rotation, the reconnect button appearing).
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setGeo(stageGeometry(r.width, r.height))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (geo && !state.current) state.current = startState(geo)
  }, [geo])

  // Tests place the j; a new `testStart` object places it again.
  useEffect(() => {
    if (geo && testStart) state.current = { ...(state.current ?? startState(geo)), ...testStart, beatLeft: 0 }
  }, [geo, testStart])

  function draw() {
    const { geo: g, reduce: still, paused: held } = live.current
    const s = state.current
    if (!g || !s || !jEl.current) return
    const [x, y, rot] = still ? [g.home.x, g.home.y, 0] : [s.x, s.y, s.rot]
    jEl.current.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`
    slot.current?.classList.toggle('on', !still && !held && canCatch(s, g))
  }

  function catchIt(self: boolean) {
    const g = live.current.geo
    const s = state.current
    if (!g || !s) return
    state.current = caught(s, g)
    replay(logo.current, 'wob')
    replay(flash.current, 'on')
    try {
      navigator.vibrate?.(self ? [30, 40, 60] : 25)
    } catch {
      // Vibration is a nicety.
    }
    const kind = pickSticker(prevKind.current, live.current.rand)
    prevKind.current = kind
    setSticker(kind)
    draw()
  }

  useEffect(() => {
    let raf = 0
    let last: number | null = null
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const { geo: g, paused: held, reduce: still } = live.current
      const s = state.current
      if (!g || !s) return
      if (held || still || document.visibilityState !== 'visible') {
        last = null
        draw()
        return
      }
      const dt = last === null ? 16 : now - last
      last = now
      const inBeat = s.beatLeft > 0
      const r = step(s, dt, g)
      state.current = r.s
      if (inBeat && r.s.beatLeft <= 0) {
        state.current = relaunch(r.s, g, live.current.rand)
        setSticker(null)
        replay(jEl.current, 'jback')
      } else if (r.selfCatch) catchIt(true)
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The loop reads everything through refs, so it starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(draw)

  const onTap = () => {
    const { geo: g, paused: held, reduce: still } = live.current
    const s = state.current
    if (held || still || !g || !s || !canCatch(s, g)) return
    catchIt(false)
  }

  const logoW = geo ? TOY.LOGO_W * geo.scale : 0
  const logoH = logoW * (TOY.FRAME.h / TOY.FRAME.w)
  const size = geo ? TOY.STICKER * geo.scale : 0
  return (
    <div ref={root} className="toy" data-testid="toy" onPointerDown={onTap}>
      {geo && (
        <>
          <div
            ref={logo}
            className="toy-logo"
            role="img"
            aria-label="kejar."
            style={{ width: logoW, height: logoH, left: (geo.bounds.w - logoW) / 2, top: geo.home.y - (TOY.J_BOX.y0 * logoW) / TOY.FRAME.w }}
          >
            {['k', 'e', 'a', 'r'].map((l) => (
              <img key={l} src={`/home/letter-${l}.png`} alt="" draggable={false} />
            ))}
          </div>
          <div ref={slot} className="toy-slot" style={{ left: geo.home.x - 4, top: geo.home.y - 4, width: geo.jw + 8, height: geo.jh + 8 }} />
          <img ref={jEl} className={`toy-j${sticker ? ' hide' : ''}`} data-testid="toy-j" src="/home/j.png" alt="" draggable={false} style={{ width: geo.jw, height: geo.jh }} />
          {sticker && (
            <span
              className="toy-sticker"
              data-testid="toy-sticker"
              data-kind={sticker}
              style={{ width: size, height: size, left: geo.home.x + geo.jw / 2 - size / 2, top: geo.home.y + geo.jh / 2 - size / 2 }}
            >
              <Sticker kind={sticker} size={size} />
            </span>
          )}
          <div ref={flash} className="toy-flash" />
        </>
      )}
    </div>
  )
}
