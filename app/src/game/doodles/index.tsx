import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import type { SceneId } from '../../../shared/howToPlay.js'
import type { PowerUpKind } from '../../../shared/types.js'
import Sticker from '../Sticker'

/**
 * The how-to-play doodle scenes, ported from the motion mockup `18-how-to-play.html` (doodle kit v2): little
 * scenes with a stick-figure cast (Dikejar in a white armband, Kejar in a lime vest), every stroke drawn twice
 * (the second faint and offset), a line-boil filter on the root `<svg>`, and a draw-on that settles to still.
 * The scene markup below is the mockup's, kept as strings and parsed once into shapes.
 */

type ShapeTag = 'path' | 'circle' | 'rect'
interface Shape {
  tag: ShapeTag
  classes: string[]
  attrs: Record<string, string>
}

const W = 'class="w"'
const L = ''
const F = 'class="fill"'
const T = 'class="thin"'

type Pose = 'stand' | 'run' | 'up' | 'sad' | 'phone'
interface FigOpts {
  s?: number
  band?: boolean
  vest?: boolean
  eyes?: boolean
  phone?: boolean
}
type Pt = [number, number]
const POSES: Record<Pose, { h: Pt; b: Pt[]; a: Pt[][]; l: Pt[][] }> = {
  stand: { h: [0, -40], b: [[0, -31], [0, -2]], a: [[[0, -24], [-13, -8]], [[0, -24], [13, -8]]], l: [[[0, -2], [-9, 20]], [[0, -2], [9, 20]]] },
  run: { h: [3, -40], b: [[1, -31], [-3, -2]], a: [[[0, -24], [-15, -14]], [[0, -24], [14, -30]]], l: [[[-3, -2], [-18, 16]], [[-3, -2], [9, 10], [15, 22]]] },
  up: { h: [0, -40], b: [[0, -31], [0, -2]], a: [[[0, -26], [-14, -46]], [[0, -26], [14, -46]]], l: [[[0, -2], [-9, 20]], [[0, -2], [9, 20]]] },
  sad: { h: [2, -37], b: [[1, -28], [0, -2]], a: [[[0, -22], [-8, -2]], [[0, -22], [8, -2]]], l: [[[0, -2], [-7, 20]], [[0, -2], [7, 20]]] },
  phone: { h: [0, -40], b: [[0, -31], [0, -2]], a: [[[0, -24], [-12, -8]], [[0, -24], [10, -20], [14, -28]]], l: [[[0, -2], [-9, 20]], [[0, -2], [9, 20]]] },
}

/** A stick figure. `band` is the white armband (Dikejar); `vest` is the lime vest (Kejar). */
function fig(x: number, y: number, pose: Pose = 'stand', o: FigOpts = {}): string {
  const s = o.s ?? 1
  const P = POSES[pose]
  const f = (dx: number, dy: number) => `${(x + dx * s).toFixed(1)} ${(y + dy * s).toFixed(1)}`
  const seg = (pts: Pt[]) => 'M' + pts.map(([a, b]) => f(a, b)).join(' L')
  let out = `<circle cx="${x + P.h[0] * s}" cy="${y + P.h[1] * s}" r="${9 * s}" ${W}/>`
  out += `<path d="${seg(P.b)}" ${W}/>` + P.a.map((a) => `<path d="${seg(a)}" ${W}/>`).join('') + P.l.map((l) => `<path d="${seg(l)}" ${W}/>`).join('')
  if (o.band) {
    const [p, q] = P.a[1]
    out += `<path d="M${f(p[0] + (q[0] - p[0]) * 0.3, p[1] + (q[1] - p[1]) * 0.3)} L${f(p[0] + (q[0] - p[0]) * 0.55, p[1] + (q[1] - p[1]) * 0.55)}" class="band"/>`
  }
  if (o.vest) out += `<path d="M${f(-7, -29)} L${f(7, -29)} L${f(6, -10)} L${f(-6, -10)} Z" ${F}/>`
  if (o.eyes !== false) out += `<circle cx="${x + (P.h[0] + 3) * s}" cy="${y + (P.h[1] - 1) * s}" r="1.6" ${F}/>`
  if (o.phone) {
    const q = P.a[1][P.a[1].length - 1]
    out += `<rect x="${x + q[0] * s - 4}" y="${y + q[1] * s - 9}" width="9" height="14" rx="2" ${L}/>`
  }
  return out
}
const bars = (x: number, y: number, w: number, h: number, n = 5) =>
  Array.from({ length: n }, (_, k) => `<path d="M${x + (k * w) / (n - 1)} ${y} V${y + h}" ${W}/>`).join('') +
  `<path d="M${x - 6} ${y} H${x + w + 6} M${x - 6} ${y + h} H${x + w + 6}" ${W}/>`
const watch = (x: number, y: number, r: number, frac = 0.7) => {
  const a = -Math.PI / 2 + frac * Math.PI * 2
  const lx = x + Math.cos(a) * r
  const ly = y + Math.sin(a) * r
  return `<circle cx="${x}" cy="${y}" r="${r}" ${W}/><path d="M${x} ${y - r - 6} V${y - r} M${x - 5} ${y - r - 6} H${x + 5}" ${W}/><path d="M${x} ${y - r} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${lx.toFixed(1)} ${ly.toFixed(1)}" class="thick"/><path d="M${x} ${y} L${x + r * 0.5} ${y - r * 0.4}" ${W}/>`
}
const buzz = (x: number, y: number, dir = 1) => `<path d="M${x} ${y} l${6 * dir} 5 l${-6 * dir} 5 l${6 * dir} 5 l${-6 * dir} 5"/>`
const burst = (x: number, y: number, r1: number, r2: number, n = 8, off = 0) =>
  Array.from({ length: n }, (_, k) => {
    const a = off + (k / n) * Math.PI * 2
    return `<path d="M${(x + Math.cos(a) * r1).toFixed(1)} ${(y + Math.sin(a) * r1).toFixed(1)} L${(x + Math.cos(a) * r2).toFixed(1)} ${(y + Math.sin(a) * r2).toFixed(1)}"/>`
  }).join('')
const ground = (y: number) => `<path d="M14 ${y} q30 -4 60 0 t60 0 t62 0" ${T}/>`

const MARKUP = {
  hide: `${ground(186)}
      <path d="M128 186 C132 150 128 120 132 96 M150 186 C146 150 150 120 146 96" ${W}/>
      <path d="M98 100 C80 98 78 70 98 66 C96 40 128 34 138 52 C150 30 186 40 180 66 C200 72 196 104 172 104 C164 116 110 118 98 100 Z" ${W}/>
      <path d="M112 78 q6 -6 12 0 M150 64 q6 -6 12 0 M160 88 q6 -6 12 0" ${T}/>
      ${fig(118, 172, 'stand', { band: true })}
      <path d="M40 176 l8 0 M56 170 l8 0 M72 176 l8 0 M88 170 l8 0" ${T}/>
      ${watch(42, 52, 18, 0.65)}
      <path d="M104 118 q-6 -8 -2 -16 M96 122 q-10 -8 -6 -20"/>`,
  phone: `${ground(186)}
      <path d="M58 92 C58 150 70 176 105 176 C140 176 152 150 152 92" ${W}/>
      <path d="M58 92 H152" ${W}/>
      <rect x="86" y="44" width="38" height="70" rx="7" ${L}/><path d="M98 104 h14" ${L}/>
      <path d="M95 74 l7 8 l14 -16" class="thick"/>
      ${buzz(70, 46, -1)}${buzz(140, 46, 1)}${buzz(60, 60, -1)}${buzz(150, 60, 1)}
      ${watch(172, 150, 16, 0.8)}`,
  two: `<rect x="22" y="40" width="40" height="66" rx="7" ${W}/><rect x="74" y="40" width="40" height="66" rx="7" ${W}/>
      <path d="M30 56 L54 90 M54 56 L30 90" class="thick"/><path d="M82 56 L106 90 M106 56 L82 90" class="thick"/>
      <path d="M124 76 C140 70 146 84 160 80 M152 72 l10 8 l-12 5"/>
      ${bars(146, 104, 50, 70, 5)}${fig(171, 172, 'sad', { band: true, s: 0.8 })}
      <path d="M30 150 q18 10 36 0 q18 -10 36 0" ${T}/>`,
  tag: `<path d="M20 120 C60 104 120 100 190 108 M20 160 C60 148 120 146 190 152" ${W}/>
      <path d="M70 106 C68 124 68 140 70 152 M104 102 C102 124 102 140 104 150" ${W}/>
      <rect x="112" y="48" width="52" height="40" rx="5" transform="rotate(-24 138 70)" ${L}/>
      <path d="M120 56 h10 v10 h-10z M146 56 h10 v10 h-10z M120 72 h10 v10 h-10z M136 72 h6 M146 78 h10" transform="rotate(-24 138 70)" ${T}/>
      <path d="M104 112 l6 -6 l6 6 l6 -6 l6 6 l6 -6" />
      <path d="M160 40 C176 30 190 34 194 44 C198 56 186 62 174 60" ${W}/><path d="M168 50 l-10 8" ${W}/>
      ${burst(150, 92, 34, 46, 7, 0.3)}`,
  free: `${ground(188)}${bars(124, 70, 66, 100, 5)}
      ${fig(146, 160, 'up', { band: true, s: 0.75 })}${fig(170, 160, 'up', { band: true, s: 0.75 })}
      ${fig(70, 178, 'phone', { band: true, phone: true })}
      <circle cx="70" cy="150" r="44" ${T} stroke-dasharray="3 7"/>
      <path d="M70 106 A44 44 0 1 1 26 150" class="thick ring"/>
      ${burst(158, 52, 12, 22, 6)}`,
  sos: `${ground(186)}${fig(56, 176, 'phone', { band: true, phone: true })}
      <rect x="20" y="40" width="96" height="30" rx="15" ${W}/><rect x="20" y="40" width="64" height="30" rx="15" ${F} opacity=".85"/>
      <circle cx="68" cy="55" r="40" ${T} stroke-dasharray="3 8"/>
      <path d="M150 176 C140 150 116 140 92 136" stroke-dasharray="6 8"/><path d="M98 128 l-8 8 l11 3"/>
      ${fig(164, 178, 'run', { s: 0.9 })}<path d="M184 140 h12 M182 150 h14 M186 160 h10" ${T}/>
      <path d="M156 146 l10 0 l0 14 l-10 0 z" ${W}/>`,
  wait: `${ground(186)}<path d="M30 160 H180" ${W}/><path d="M30 168 H180" stroke-dasharray="8 8"/>
      ${fig(80, 156, 'stand', { vest: true })}${fig(130, 156, 'stand', { vest: true })}
      ${watch(105, 52, 26, 0.4)}${burst(105, 52, 34, 42, 10)}`,
  circles: `<rect x="20" y="24" width="170" height="162" rx="18" ${W}/>
      <path d="M40 60 q40 -20 70 4 t70 0 M30 140 q50 20 90 -6 t62 8" ${T}/>
      <circle cx="105" cy="110" r="6" ${F}/><circle cx="105" cy="110" r="30"/><circle cx="105" cy="110" r="58" stroke-dasharray="4 8"/>
      <circle cx="58" cy="66" r="16" ${W}/><circle cx="156" cy="80" r="16" ${W}/><circle cx="138" cy="156" r="16" ${W} stroke-dasharray="6 6"/>`,
  rip: `${fig(60, 180, 'run', { vest: true })}
      <rect x="112" y="46" width="64" height="104" rx="10" ${W}/>
      <path d="M124 66 v-8 h10 M164 58 h10 v8 M174 128 v8 h-10 M134 138 h-10 v-8" class="thick"/>
      <rect x="132" y="78" width="26" height="26" rx="3" ${L}/><path d="M138 84 h6 v6 h-6z M150 92 h3 M138 98 h10" ${T}/>
      <path d="M80 110 C96 100 104 96 118 94" ${W}/><path d="M88 60 l10 10 M74 50 l6 14" ${T}/>
      ${burst(145, 92, 64, 72, 10)}`,
  stop: `${ground(188)}${bars(140, 76, 54, 96, 4)}
      ${fig(118, 178, 'phone', { band: true, phone: true, s: 0.85 })}
      <circle cx="118" cy="150" r="36" ${T} stroke-dasharray="3 7"/><path d="M118 114 A36 36 0 0 1 154 150" class="thick ring"/>
      ${fig(46, 178, 'run', { vest: true })}<path d="M10 136 h16 M6 148 h18 M12 160 h14" ${T}/>
      <path d="M62 120 C76 108 86 108 96 116 M90 108 l7 9 l-11 2"/>`,
  snap: `<rect x="40" y="64" width="130" height="92" rx="12" ${W}/><circle cx="105" cy="110" r="28"/><path d="M78 64 l8 -14 h38 l8 14" ${W}/>${burst(105, 110, 36, 44, 8)}${fig(105, 124, 'stand', { vest: true, s: 0.55, eyes: false })}`,
  station: `${ground(190)}<path d="M150 190 V112" ${W}/><rect x="122" y="80" width="56" height="44" rx="5" ${W}/>
      <path d="M130 88 h10 v10 h-10z M160 88 h10 v10 h-10z M130 106 h10 v10 h-10z M148 110 h6 M160 106 h10" ${T}/>
      ${fig(84, 182, 'phone', { band: true, phone: true })}<path d="M96 150 C108 140 116 124 122 112" stroke-dasharray="4 6"/>
      ${burst(150, 102, 34, 44, 9, 0.2)}`,
}

const SCENE_MARKUP: Record<SceneId, keyof typeof MARKUP> = {
  'runner-free': 'hide',
  checkin: 'phone',
  'miss-two': 'two',
  'tag-ripped': 'tag',
  'break-out': 'free',
  'runner-powerups': 'station',
  sos: 'sos',
  'chaser-start': 'wait',
  'ping-circles': 'circles',
  'rip-scan': 'rip',
  snapshot: 'snap',
  'stop-rescue': 'stop',
  'chaser-powerups': 'station',
}

/** Turn a scene's markup into shapes, once per scene. */
const parsed = new Map<string, Shape[]>()
function shapesOf(key: keyof typeof MARKUP): Shape[] {
  const hit = parsed.get(key)
  if (hit) return hit
  const out: Shape[] = []
  for (const m of MARKUP[key].matchAll(/<(path|circle|rect)\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {}
    let classes: string[] = []
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (a[1] === 'class') classes = a[2].split(/\s+/).filter(Boolean)
      else attrs[a[1].replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = a[2]
    }
    out.push({ tag: m[1] as ShapeTag, classes, attrs })
  }
  parsed.set(key, out)
  return out
}

/** The twin's offset, about 1.5 px, varied per stroke but stable between renders. */
const OFFSETS: Array<[number, number]> = [[1.5, -1], [-1, 1.5], [1.2, 1.3], [-1.5, -0.8]]

function Drawn({ shape, k, animate, twin }: { shape: Shape; k: number; animate: boolean; twin: boolean }) {
  const { tag: Tag, classes, attrs } = shape
  const fill = classes.includes('fill')
  const dashed = attrs.strokeDasharray !== undefined
  const cls = ['kd-s', ...classes.map((c) => `kd-${c}`), twin ? 'kd-ghost' : ''].filter(Boolean)
  const style: Record<string, string | number> = { '--o': twin ? 0.32 : fill ? 0.9 : classes.includes('thin') ? 0.55 : 1 }
  if (animate) {
    // Solid strokes draw on; dashed strokes and fills fade in (a dash pattern can't be drawn on).
    cls.push(fill || dashed ? 'kd-fade' : 'kd-draw')
    style['--d'] = `${Math.min(k * 45, 1400)}ms`
  }
  const props: Record<string, unknown> = { ...attrs, className: cls.join(' '), style }
  if (twin) {
    const [dx, dy] = OFFSETS[k % OFFSETS.length]
    props.transform = `${attrs.transform ? attrs.transform + ' ' : ''}translate(${dx} ${dy})`
  }
  if (!fill && !dashed) props.pathLength = 1
  return <Tag {...(props as object)} />
}

export function Scene({ id, stickers }: { id: SceneId; stickers?: PowerUpKind[] }) {
  const reduce = !!useReducedMotion()
  const fid = `boil-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const turbulence = useRef<SVGFETurbulenceElement>(null)

  // Line boil: one interval re-seeds the wobble about 7 times a second. None at all with reduced motion.
  useEffect(() => {
    if (reduce) return
    let seed = 1
    const t = setInterval(() => {
      seed = (seed % 3) + 1
      turbulence.current?.setAttribute('seed', String(seed))
    }, 140)
    return () => clearInterval(t)
  }, [reduce])

  const shapes = shapesOf(SCENE_MARKUP[id])
  const nodes = useMemo(() => {
    const out: ReactNode[] = []
    let k = 0
    shapes.forEach((s, i) => {
      out.push(<Drawn key={`${i}m`} shape={s} k={k++} animate={!reduce} twin={false} />)
      if (!s.classes.includes('fill')) out.push(<Drawn key={`${i}t`} shape={s} k={k++} animate={!reduce} twin />)
    })
    return out
  }, [shapes, reduce])

  return (
    <div data-scene={id} data-stickers={stickers?.join(',')} style={{ position: 'relative', width: 220, height: 220 }}>
      <svg className="kd-doodle" viewBox="0 0 210 210" width={220} height={220} aria-hidden="true" filter={`url(#${fid})`} style={{ overflow: 'visible' }}>
        <defs>
          <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence ref={turbulence} type="fractalNoise" baseFrequency={0.03} numOctaves={2} seed={1} />
            <feDisplacementMap in="SourceGraphic" scale={3.6} />
          </filter>
        </defs>
        {nodes}
      </svg>
      {stickers && stickers.length > 0 && (
        <div className="kd-stks">
          {stickers.map((kind, i) => (
            <span key={kind} data-sticker={kind} className={reduce ? undefined : 'kd-pop'} style={{ animationDelay: `${i * 110}ms` }}>
              <Sticker kind={kind} size={46} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default Scene
