import { useId } from 'react'
import type { PowerUpKind } from '../../shared/types.js'
import { INFO } from './powerInfo'
import Sticker from './Sticker'

/** Mak Kau Hijau's card face words: the chasers' legendary that works on claim. */
const HIJAU_INFO = { name: 'Mak Kau Hijau', effect: 'Tap green in 45 s or Penjara' }

/** Marker scribbles round a legendary card: a crown on top, stars and rays at the sides. Drawn in the card's colour. */
function Scribbles({ big }: { big: boolean }) {
  const id = `sc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // Box in the svg's own units: the card sits at (26, 30), and is 96×150 (or 150×234 when big).
  const W = big ? 150 : 96
  const H = big ? 234 : 150
  const x0 = 26
  const y0 = 30
  const s = big ? 1.4 : 1
  const star = (cx: number, cy: number, r: number) =>
    'M' +
    Array.from({ length: 11 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? r * 0.42 : r
      return `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`
    }).join(' L')
  const cx = x0 + W / 2
  const crownW = 34 * s
  const base = y0 - 4
  const top = base - crownW * 0.55
  const crown = `M${cx - crownW / 2} ${base} L${cx - crownW / 2 - 2} ${top} L${cx - crownW * 0.23} ${base - crownW * 0.24} L${cx} ${top - 4} L${cx + crownW * 0.23} ${base - crownW * 0.24} L${cx + crownW / 2 + 2} ${top} L${cx + crownW / 2} ${base} Z`
  const ray = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} L${x2} ${y2}`
  const L = x0 - 6
  const R = x0 + W + 6
  const paths = [
    crown,
    star(R + 4, y0 + 10 * s, 9 * s),
    star(L - 4, y0 + H - 18 * s, 7 * s),
    star(R + 2, y0 + H - 6 * s, 5 * s),
    ray(L, y0 + H * 0.3, L - 14 * s, y0 + H * 0.26),
    ray(L, y0 + H * 0.38, L - 18 * s, y0 + H * 0.38),
    ray(L, y0 + H * 0.46, L - 14 * s, y0 + H * 0.5),
    ray(R, y0 + H * 0.42, R + 14 * s, y0 + H * 0.38),
    ray(R, y0 + H * 0.5, R + 18 * s, y0 + H * 0.5),
    ray(R, y0 + H * 0.58, R + 14 * s, y0 + H * 0.62),
  ]
  return (
    <svg className="pc-scribbles" viewBox={`0 0 ${W + 52} ${H + 56}`} aria-hidden="true" data-testid="scribbles">
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={2.5} />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="none" stroke="var(--leg)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d, i) => (
          <g key={i}>
            <path d={d} />
            <path d={d} opacity={0.5} transform="translate(1 1)" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * A deck card, 96×150 (motion design §7). Face up: the same lime-framed layout for every power-up, no rarity
 * colours. Face down: the ornate brand back, identical for every card, so it gives nothing away.
 * The legendaries are the same dark card in their own colour (Dato Seri yellow, Super Ring cheese orange, Mak Kau Hijau
 * deep green), with marker scribbles round the outside in that colour (owner's direction, 2026-11-13). Mak Kau Hijau never
 * sits in a hand, so INFO doesn't name it.
 * `big` (150×234) is the revealed card in the lucky dip: laid out bigger, never scaled, so the marker finds its edges.
 */
export default function PowerCard({ kind, faceDown = false, wiggle = false, big = false }: { kind?: PowerUpKind | 'hijau'; faceDown?: boolean; wiggle?: boolean; big?: boolean }) {
  if (faceDown || !kind) {
    return (
      <div className="power-card back" aria-label="Face-down card" role="img">
        <span className="pc-corner tl" />
        <span className="pc-corner tr" />
        <span className="pc-corner bl" />
        <span className="pc-corner br" />
        <span className="pc-seal">kejar.</span>
      </div>
    )
  }
  const legendary = kind === 'dato' || kind === 'ring' || kind === 'hijau'
  const info = kind === 'hijau' ? HIJAU_INFO : INFO[kind]
  const tone = kind === 'ring' || kind === 'hijau' ? ` ${kind}` : ''
  return (
    <div className={`power-card front${big ? ' big' : ''}${legendary ? ' legendary' : ''}${tone}`}>
      {legendary && <Scribbles big={big} />}
      <span className="pc-eyebrow">{legendary ? '★ LEGENDARY · ONE PER GAME' : 'POWER-UP'}</span>
      <span className="pc-art">
        <Sticker kind={kind} size={big ? 104 : 64} tilt={-4} wiggle={wiggle} />
      </span>
      <b className="pc-name">{info.name}</b>
      <span className="pc-effect">{info.effect}</span>
    </div>
  )
}
