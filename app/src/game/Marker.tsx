import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'

/** Each stroke draws in about 0.4 s (motion design §8.5); a whole moment stays under 2 s. */
export const MARK_STROKE_MS = 400
const MOMENT_MAX_MS = 2_000
/** Circles leave this much room around the words, so no letter sits outside the loop (owner's request). */
const ROOM = 10

type Point = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }

export type Mark = {
  shape: 'circle' | 'frame' | 'underline' | 'star' | 'stars' | 'burst' | 'arrow' | 'x' | 'tick' | 'emphasis' | 'strike'
  /** The element the mark is sized from. */
  target?: RefObject<HTMLElement | null>
  /** Or a point in the parent's coordinates. */
  at?: Point
  /** Where an arrow points (defaults to 44 px below its start). */
  to?: Point
}

const f = (n: number) => n.toFixed(1)
const line = (pts: Point[]) => 'M' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')

/** A shape's path in the parent's coordinates, from the box it marks. Shapes only, never handwriting. */
export function markPath(mark: Pick<Mark, 'shape' | 'to'>, b: Box): string {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  switch (mark.shape) {
    case 'circle': {
      // An ellipse through the padded box's corners, only a little wider than the words (so a long title still
      // fits the phone) and as tall as it needs to be, overshooting its start like a hand loop.
      const a = b.w / 2 + ROOM
      const rx = a + 2 * ROOM
      const ry = (b.h / 2 + ROOM) / Math.sqrt(1 - (a / rx) ** 2)
      const pts: Point[] = []
      for (let a = -100; a <= 290; a += 10) {
        const t = (a * Math.PI) / 180
        const grow = 1 + 0.02 * Math.sin(t * 3) ** 2
        pts.push({ x: cx + Math.cos(t) * rx * grow, y: cy + Math.sin(t) * ry * grow })
      }
      return line(pts)
    }
    case 'frame': {
      // A hand-drawn box round a picture: four slightly wobbly sides that overshoot their corners, drawn as one
      // stroke going round, always ROOM clear of the picture so it never covers it.
      const l = b.x - ROOM
      const t = b.y - ROOM
      const r = b.x + b.w + ROOM
      const bt = b.y + b.h + ROOM
      const side = (x0: number, y0: number, x1: number, y1: number, out: Point) => {
        const pts: Point[] = []
        for (let k = 0; k <= 8; k++) {
          const f = k / 8
          // Wobble outwards only (`out` points away from the picture), so it never drifts inside.
          const w = 2.5 * Math.abs(Math.sin(f * Math.PI * 3 + x0 * 0.01))
          pts.push({ x: x0 + (x1 - x0) * f + out.x * w, y: y0 + (y1 - y0) * f + out.y * w })
        }
        return pts
      }
      const over = 8
      return line([
        ...side(l - over, t, r, t - 1, { x: 0, y: -1 }),
        ...side(r, t - over, r + 1, bt, { x: 1, y: 0 }),
        ...side(r + over, bt, l, bt + 1, { x: 0, y: 1 }),
        ...side(l, bt + over, l - 1, t - over, { x: -1, y: 0 }),
      ])
    }
    case 'underline':
      return `M${f(b.x - 4)} ${f(b.y + b.h + 5)} Q${f(cx)} ${f(b.y + b.h + 9)} ${f(b.x + b.w + 4)} ${f(b.y + b.h + 3)}`
    case 'strike':
      return line([
        { x: b.x - 4, y: b.y + b.h * 0.62 },
        { x: b.x + b.w + 4, y: b.y + b.h * 0.38 },
      ])
    case 'x':
      return `${line([{ x: b.x - 4, y: b.y - 4 }, { x: b.x + b.w + 4, y: b.y + b.h + 4 }])} ${line([{ x: b.x + b.w + 4, y: b.y - 4 }, { x: b.x - 4, y: b.y + b.h + 4 }])}`
    case 'tick':
      return line([
        { x: b.x + b.w * 0.12, y: b.y + b.h * 0.55 },
        { x: b.x + b.w * 0.38, y: b.y + b.h * 0.9 },
        { x: b.x + b.w * 0.92, y: b.y + b.h * 0.05 },
      ])
    case 'star': {
      const sx = b.x + b.w + ROOM + 8
      const sy = b.y - 4
      const pts: Point[] = []
      for (let k = 0; k <= 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const r = k % 2 ? 4 : 10
        pts.push({ x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r })
      }
      return line(pts)
    }
    case 'stars': {
      // Three stars scattered round the words: top right (big), bottom left, and bottom right (small).
      const star = (sx: number, sy: number, r: number) => {
        const pts: Point[] = []
        for (let k = 0; k <= 10; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI) / 5
          const rr = k % 2 ? r * 0.4 : r
          pts.push({ x: sx + Math.cos(ang) * rr, y: sy + Math.sin(ang) * rr })
        }
        return line(pts)
      }
      return [
        star(b.x + b.w + ROOM + 10, b.y - 6, 11),
        star(b.x - ROOM - 12, b.y + b.h + 6, 8),
        star(b.x + b.w + ROOM + 2, b.y + b.h + 14, 6),
      ].join(' ')
    }
    case 'burst': {
      // Comic-book rays round the box, starting clear of its edge. None point up (the title and its loop are
      // there) or straight down (the arrow to the slot is there).
      const rays: string[] = []
      const rx = b.w / 2
      const ry = b.h / 2
      for (let k = 0; k < 18; k++) {
        const ang = (k / 18) * Math.PI * 2 + 0.2
        const dx = Math.cos(ang)
        const dy = Math.sin(ang)
        if (dy < -0.6 || (dy > 0.85 && Math.abs(dx) < 0.4)) continue
        // Distance from the centre to the box edge along this ray, then out past it.
        const edge = Math.min(Math.abs(rx / (dx || 1e-9)), Math.abs(ry / (dy || 1e-9)))
        const from = edge + ROOM
        const len = k % 2 ? 14 : 24
        rays.push(line([
          { x: cx + dx * from, y: cy + dy * from },
          { x: cx + dx * (from + len), y: cy + dy * (from + len) },
        ]))
      }
      return rays.join(' ')
    }
    case 'arrow': {
      const from = { x: cx, y: b.y + b.h + ROOM }
      const to = mark.to ?? { x: from.x, y: from.y + 44 }
      const ang = Math.atan2(to.y - from.y, to.x - from.x)
      const head = (d: number) => ({ x: to.x - Math.cos(ang + d) * 10, y: to.y - Math.sin(ang + d) * 10 })
      return `${line([from, { x: (from.x + to.x) / 2 + 6, y: (from.y + to.y) / 2 }, to])} ${line([head(0.5), to, head(-0.5)])}`
    }
    case 'emphasis': {
      const ticks = (side: -1 | 1) => {
        const x0 = side < 0 ? b.x - ROOM : b.x + b.w + ROOM
        return [-0.6, 0, 0.6]
          .map((k) => line([{ x: x0, y: cy + k * (b.h / 2) }, { x: x0 + side * 12, y: cy + k * (b.h / 2) + k * 8 }]))
          .join(' ')
      }
      return `${ticks(-1)} ${ticks(1)}`
    }
  }
}

/**
 * Where `el` sits inside `parent` once laid out, ignoring transforms: a card still scaling or flipping on a slow
 * phone is marked round its final edges, not round wherever the animation has it at that instant.
 */
export function layoutBox(el: HTMLElement, parent: HTMLElement): Box | null {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== parent) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return node === parent ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null
}

function boxOf(mark: Mark, parent: HTMLElement | null): Box {
  const el = mark.target?.current
  if (el && parent) {
    const laid = layoutBox(el, parent)
    if (laid) return laid
    // Not in the parent's offset chain (e.g. the parent isn't positioned): fall back to the on-screen box.
    const r = el.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }
  }
  return { x: mark.at?.x ?? 0, y: mark.at?.y ?? 0, w: 0, h: 0 }
}

/**
 * The marker scribble (motion design §8.5): a lime marker that draws itself over its positioned parent, for hype
 * and wayfinding only. Never put it on SOS, marshal, pause, removal or report screens.
 */
export default function Marker({ marks, colour = 'lime', delayMs = 0 }: { marks: Mark[]; colour?: 'lime' | 'black'; delayMs?: number }) {
  const reduce = useReducedMotion()
  const svg = useRef<SVGSVGElement>(null)
  const [paths, setPaths] = useState<string[]>([])
  const wob = `mk-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  // Measured once when the moment starts, after every ref on the screen is attached (a layout effect runs before
  // its parent's ref, so marking your own parent, like the Checked in tick, would measure nothing). The marks
  // then stay still.
  useEffect(() => {
    const parent = svg.current?.parentElement ?? null
    setPaths(marks.map((mk) => markPath(mk, boxOf(mk, parent))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stroke = Math.min(MARK_STROKE_MS, MOMENT_MAX_MS / Math.max(1, marks.length)) / 1000
  const colourHex = colour === 'lime' ? '#C6FF3D' : '#0A0A0B'

  return (
    <svg ref={svg} className="marker" aria-hidden="true" data-drawn={reduce ? 'now' : 'animated'} filter={`url(#${wob})`}>
      <defs>
        <filter id={wob} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={2.5} />
        </filter>
      </defs>
      {(paths.length ? paths : marks.map(() => 'M0 0')).map((d, i) =>
        [0, 1].map((pass) => (
          <m.path
            key={`${i}-${pass}`}
            d={d}
            fill="none"
            stroke={colourHex}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={pass ? 0.5 : 1}
            transform={pass ? 'translate(1 1)' : undefined}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduce ? { duration: 0 } : { duration: stroke, delay: delayMs / 1000 + i * stroke, ease: 'easeOut' }}
          />
        )),
      )}
    </svg>
  )
}
