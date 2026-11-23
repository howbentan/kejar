import { useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { LegendaryKind } from '../../shared/types.js'
import Tupper from './doodles/Tupper'
import PowerCard from './PowerCard'

/** The whole unlock, box to card (spec §5.6, "about 7 seconds"): the CSS keyframes run on this same 7 s timeline. */
export const TAKEOVER_MS = 7_000
/** The card is edge-on halfway through its turn (the flip keyframes run 47%–57% of the timeline): the buzz goes here. */
export const FLIP_AT_MS = 3_640
/** The button arrives with the words under the card, once the card has turned (55% of the timeline). */
export const BUTTON_AT_MS = 3_850

/** What each legendary does, said under its card. Dato Seri and Super Ring wait in the hand; the others work now. */
const SUB: Record<LegendaryKind, string> = {
  dato: 'Use it at Penjara.',
  ring: 'It waits in your slot. Next time you’d go to Penjara: house arrest instead.',
  hijau: 'Every free Dikejar has 20 s to tap green. Go.',
  bomoh: 'Every Dikejar shows up for Kejar at the next 2 pings.',
}

/** Hand-drawn marker doodles round the screen in the legendary's colour (`--leg`): stars, swirls, little bursts. */
function Doodles() {
  const id = `dood-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const star = (cx: number, cy: number, r: number) =>
    'M' +
    Array.from({ length: 11 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 5
      const rr = k % 2 ? r * 0.42 : r
      return `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`
    }).join(' L') +
    ' Z'
  const paths = [
    star(56, 120, 18),
    star(300, 96, 13),
    star(312, 560, 16),
    star(44, 600, 11),
    'M30 260 q14 -16 28 0 t28 0',
    'M276 300 q14 -16 28 0 t28 0',
    'M70 470 c-20 -10 -24 -36 0 -40 c20 -3 24 22 4 26',
    'M290 210 l18 -10 M294 228 l22 0 M290 246 l18 10',
    'M34 380 l-14 -8 M30 396 l-18 0 M34 412 l-14 8',
    'M150 690 q30 18 60 0',
  ]
  return (
    <svg className="to-doodles" viewBox="0 0 360 740" aria-hidden="true">
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={5} />
          <feDisplacementMap in="SourceGraphic" scale={3} />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="none" stroke="var(--leg)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d, i) => (
          <path key={i} d={d} pathLength={1} className="dd" style={{ animationDelay: `${2.3 + i * 0.08}s` }} />
        ))}
      </g>
    </svg>
  )
}

/**
 * The Tupperware unlock (spec §5.6), after a right slip: the red box shakes, the lid flies, and a card back in the
 * legendary's colour rises out of it, then flips to the legendary's own card, with doodles drawn round the screen.
 * Dato Seri and Super Ring go into the hand (`Keep it`); Mak Kau Hijau and Bomoh work the moment they're claimed
 * (`It's working!`). The button is the only way out, so the player sees what they got. A tap anywhere skips to the end
 * state. One long buzz at the flip (or at the skip, if that comes first). Reduced motion: no shake or flip, the end
 * state (the front, the words, the button) shows at once. Ported from the Tupperware mockup's `Takeover`.
 */
export default function TupperwareTakeover({ kind, onDone }: { kind: LegendaryKind; onDone: () => void }) {
  const reduce = !!useReducedMotion()
  const [ended, setEnded] = useState(reduce)
  const [buttonIn, setButtonIn] = useState(reduce)
  const buzzed = useRef(false)

  function buzz() {
    if (buzzed.current) return
    buzzed.current = true
    navigator.vibrate?.([400, 80, 400])
  }

  function skip() {
    if (ended) return
    buzz()
    setEnded(true)
  }

  useEffect(() => {
    if (reduce) {
      buzz()
      return
    }
    const flip = window.setTimeout(buzz, FLIP_AT_MS)
    const button = window.setTimeout(() => setButtonIn(true), BUTTON_AT_MS)
    const end = window.setTimeout(() => setEnded(true), TAKEOVER_MS)
    return () => (window.clearTimeout(flip), window.clearTimeout(button), window.clearTimeout(end))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const instant = kind === 'hijau' || kind === 'bomoh'
  return (
    <div className={`to leg-${kind}${ended ? ' to-end' : ''}`} role="status" onClick={skip}>
      <Doodles />
      <p className="to-eyebrow">TUPPERWARE OPENED</p>
      <div className="to-stage">
        <div className="to-card">
          {/* Face down first: the same back as every card, in this legendary's colour. Then it flips. */}
          <div className="flip">
            <div className="flip-inner">
              <div className="face face-back">
                <PowerCard faceDown big />
              </div>
              <div className="face face-front">
                <PowerCard kind={kind} big />
              </div>
            </div>
          </div>
        </div>
        <Tupper size={200} open className="to-tub" tilt={0} />
      </div>
      <p className="to-sub">{SUB[kind]}</p>
      {(buttonIn || ended) && (
        <button
          type="button"
          className="btn to-btn"
          onClick={(e) => {
            e.stopPropagation()
            onDone()
          }}
        >
          {instant ? "It's working!" : 'Keep it'}
        </button>
      )}
      {!ended && (
        <button type="button" className="to-skip" onClick={skip}>
          Tap to skip
        </button>
      )}
    </div>
  )
}
