import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { View } from '../../shared/views.js'
import { shouldPlay } from './moments'

/**
 * The one-off moments (design 2026-11-24 §4): a pop in Kejar Hand inside a doodled burst sized to its words, which
 * holds and then flies off toward the top left. Someone caught (not my own catch, which has its stamp), a jailbreak,
 * 5 minutes left and the final whistle. Each plays once, and only while fresh.
 */
type Moment = { key: string; kind: 'caught' | 'jailbreak' | 'five' | 'whistle'; who?: string | null }
const LENGTH_MS: Record<Moment['kind'], number> = { caught: 2300, jailbreak: 2500, five: 2100, whistle: 2600 }

/** What should pop for this view, oldest first (keys are unique per event). */
export function momentsIn(view: View): { key: string; at: string; m: Moment }[] {
  const out: { key: string; at: string; m: Moment }[] = []
  for (const f of view.feed) {
    if (f.kind === 'caught' && !f.mine) out.push({ key: 'pop-caught', at: f.at, m: { key: `caught-${f.at}`, kind: 'caught', who: f.who } })
    if (f.kind === 'jailbreak') out.push({ key: 'pop-jailbreak', at: f.at, m: { key: `jailbreak-${f.at}`, kind: 'jailbreak' } })
    if (f.kind === 'five-left') out.push({ key: 'pop-five', at: f.at, m: { key: `five-${f.at}`, kind: 'five' } })
  }
  if (view.phase === 'ended' && view.endsAt) {
    const at = new Date(Math.min(view.endsAt, view.now)).toISOString()
    out.push({ key: 'pop-whistle', at, m: { key: `whistle-${at}`, kind: 'whistle' } })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

export default function Moments({ view }: { view: View }) {
  const [queue, setQueue] = useState<Moment[]>([])
  const queued = useRef(new Set<string>())
  useEffect(() => {
    const fresh = momentsIn(view).filter((c) => !queued.current.has(c.m.key) && shouldPlay(c.key, c.at, view.now, sessionStorage))
    if (!fresh.length) return
    fresh.forEach((c) => queued.current.add(c.m.key))
    setQueue((q) => [...q, ...fresh.map((c) => c.m)])
  }, [view])
  const now = queue[0]
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (!now) return
    if (now.kind === 'whistle' || now.kind === 'caught') navigator.vibrate?.([120, 60, 120])
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), reduce ? 1400 : LENGTH_MS[now.kind])
    return () => window.clearTimeout(t)
  }, [now, reduce])
  if (!now) return null
  return (
    <div className="moment-pop" key={now.key} role="status" aria-live="polite" onClick={() => setQueue((q) => q.slice(1))}>
      <MomentArt m={now} />
    </div>
  )
}

function MomentArt({ m }: { m: Moment }) {
  if (m.kind === 'caught')
    return (
      <Pop kind="caught" fill="#0A0A0B">
        <img className="mo-logo" src="/logo-volt.png" alt="kejar" />
        <span className="mo-sub mo-sub-big">{`${m.who ?? 'Someone'} dah kena kejar`}</span>
      </Pop>
    )
  if (m.kind === 'jailbreak')
    return (
      <Pop kind="jailbreak" fill="#1C1C1F">
        <CrackingGate />
        <span className="mo-word">krak!</span>
        <span className="mo-sub">penjara pecah, everyone out</span>
      </Pop>
    )
  if (m.kind === 'five')
    return (
      <Pop kind="five" fill="#FFD43B" dark>
        <Clock5 />
        <span className="mo-word">5 minit lagi!</span>
        <span className="mo-sub">last stretch</span>
      </Pop>
    )
  return (
    <Pop kind="whistle" fill="#E5484D" dark>
      <Whistle />
      <span className="mo-puffs" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="mo-word">pitpit!</span>
      <span className="mo-sub">final whistle, bossku</span>
    </Pop>
  )
}

function Pop({ kind, fill, dark, children }: { kind: string; fill: string; dark?: boolean; children: ReactNode }) {
  return (
    <div className={`mo mo-${kind}${dark ? ' mo-dark' : ''}`} style={{ ['--ms' as string]: `${LENGTH_MS[kind as Moment['kind']]}ms` }}>
      <Burst fill={fill} />
      {children}
    </div>
  )
}

/** The doodled burst: uneven points, a wobbly outline drawn twice and a hand-drawn shadow, roughed up like the stickers. */
function Burst({ fill }: { fill: string }) {
  const [id] = useState(() => `bw${Math.random().toString(36).slice(2, 8)}`)
  const paths = useMemo(() => {
    const n = 15 + Math.floor(Math.random() * 4)
    const pts: [number, number][] = []
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + (Math.random() - 0.5) * 0.12
      const rr = i % 2 ? 39 + Math.random() * 4 : 46 + Math.random() * 4
      pts.push([50 + Math.cos(a) * rr, 50 + Math.sin(a) * rr])
    }
    const path = (k: number) =>
      'M' + pts.map(([x, y]) => `${(x + (Math.random() - 0.5) * k).toFixed(1)} ${(y + (Math.random() - 0.5) * k).toFixed(1)}`).join(' L') + ' Z'
    return [path(0), path(0.6), path(1.6), path(2.4)]
  }, [])
  return (
    <svg className="mo-burst" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={id} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={2.2} />
        </filter>
      </defs>
      <g filter={`url(#${id})`} strokeLinejoin="round" strokeLinecap="round">
        <path d={paths[0]} transform="translate(2.6 3.2)" fill="#0A0A0B" />
        <path d={paths[1]} fill={fill} stroke="#0A0A0B" strokeWidth="2.6" vectorEffect="non-scaling-stroke" />
        <path d={paths[2]} fill="none" stroke="#F5F5F3" strokeWidth="1.6" vectorEffect="non-scaling-stroke" opacity=".85" />
        <path d={paths[3]} fill="none" stroke="#0A0A0B" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity=".5" />
      </g>
    </svg>
  )
}

const CRACK = 'L46 14 L54 26 L45 40 L55 52 L47 64 L54 78 L46 92 L52 110'

/** The Penjara gate, redrawn from the map doodle, so it can crack down the middle and split. */
function Gate() {
  return (
    <>
      <path d="M8 104 V44 C8 18 26 6 50 6 C74 6 92 18 92 44 V104 Z" fill="#F5F5F3" />
      <path d="M13 100 V45 C13 22 29 11 50 11 C71 11 87 22 87 45 V100 Z" fill="#141416" stroke="#0A0A0B" strokeWidth="3" />
      <path d="M20 96 V47 C20 29 33 19 50 19 C67 19 80 29 80 47 V96 Z" fill="#0B0B0D" />
      <g stroke="#8A8A90" strokeWidth="4" strokeLinecap="round">
        <path d="M28 30 V90 M37 26 V92 M46 24 V92 M55 24 V92 M64 26 V92 M73 30 V90" />
      </g>
      <g stroke="#8A8A90" strokeWidth="5" strokeLinecap="round">
        <path d="M24 38 H76 M24 84 H76" />
      </g>
      <path d="M40 58 V50 C40 43 44 39 50 39 C56 39 60 43 60 50 V58" fill="none" stroke="#B9B9BE" strokeWidth="4.5" />
      <rect x="35" y="56" width="30" height="24" rx="4" fill="#C6FF3D" stroke="#0A0A0B" strokeWidth="3" />
      <circle cx="50" cy="65" r="3.4" fill="#0A0A0B" />
      <path d="M50 66 V73" stroke="#0A0A0B" strokeWidth="3" strokeLinecap="round" />
      <rect x="29" y="2" width="42" height="13" rx="3" fill="#F1E3C3" stroke="#0A0A0B" strokeWidth="2.5" />
      <text x="50" y="12.2" textAnchor="middle" fontFamily="Kejar Hand, cursive" fontSize="10" fill="#0A0A0B">
        penjara
      </text>
      <path d="M25 33 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z M77 66 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2z" fill="#C6FF3D" />
    </>
  )
}

function CrackingGate() {
  const [id] = useState(() => `gc${Math.random().toString(36).slice(2, 8)}`)
  const half = (side: 'l' | 'r') => (
    <svg className={`mo-half mo-half-${side}`} viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-${side}`}>
          <path d={side === 'l' ? `M-5 -5 H50 L50 0 ${CRACK} L-5 115 Z` : `M105 -5 H50 L50 0 ${CRACK} L105 115 Z`} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-${side})`}>
        <Gate />
      </g>
    </svg>
  )
  return (
    <div className="mo-gate">
      {half('l')}
      {half('r')}
      <svg className="mo-crackline" viewBox="0 0 100 110" aria-hidden="true">
        <path d={`M50 0 ${CRACK}`} fill="none" stroke="#F5F5F3" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Clock5() {
  return (
    <svg className="mo-clock5" viewBox="0 0 100 100" aria-hidden="true">
      <g stroke="#0A0A0B" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="50" cy="54" r="38" fill="#F5F5F3" strokeWidth="7" />
        <path d="M30 12 L20 22 M70 12 L80 22" strokeWidth="7" />
        <path d="M50 54 L50 16 A38 38 0 0 1 86 42 Z" fill="#FFD43B" strokeWidth="0" opacity=".9" />
        <circle cx="50" cy="54" r="38" fill="none" strokeWidth="7" />
        <path d="M50 54 V26 M50 54 L66 64" strokeWidth="6" />
        <circle cx="50" cy="54" r="4" fill="#0A0A0B" />
      </g>
    </svg>
  )
}

function Whistle() {
  const body =
    'M14 40 C14 22 28 12 46 12 H98 C104 12 108 16 108 22 V34 C108 38 105 40 101 40 H78 C80 44 81 49 81 54 C81 74 65 88 46 88 C27 88 12 74 12 54 C12 49 13 44 14 40 Z'
  return (
    <svg className="mo-whistle" viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <filter id="mo-ww" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={2.6} />
        </filter>
      </defs>
      <g filter="url(#mo-ww)" strokeLinejoin="round" strokeLinecap="round">
        <path d={body} fill="#F5F5F3" stroke="#0A0A0B" strokeWidth="10" />
        <path d={body} fill="#F5F5F3" stroke="#0A0A0B" strokeWidth="4" />
        <path d="M86 12 V40" stroke="#E5484D" strokeWidth="7" />
        <circle cx="46" cy="54" r="17" fill="#E5484D" stroke="#0A0A0B" strokeWidth="4" />
        <path d="M40 48 C42 45 46 44 49 45" fill="none" stroke="#F5F5F3" strokeWidth="3" />
        <path d="M60 22 H70" stroke="#0A0A0B" strokeWidth="4" />
        <circle cx="20" cy="30" r="7" fill="none" stroke="#0A0A0B" strokeWidth="4" />
      </g>
    </svg>
  )
}
