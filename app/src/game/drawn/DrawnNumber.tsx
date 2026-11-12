import { useEffect, useId, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import PATHS from './digitPaths.json'

/**
 * A number in the owner's own hand-drawn digits (home upgrades design). A digit that changes draws itself in along
 * its traced stroke, like a marker writing it: an SVG mask holding the stroke path, its dash offset run from 1 to 0,
 * over the digit's image. The colon is two small hand-drawn dots.
 */
type DigitPath = { w: number; h: number; d: string; sw: number }
const DIGITS = PATHS as Record<string, DigitPath>

function Digit({ ch, draw, height }: { ch: string; draw: boolean; height: number }) {
  const id = `dg-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const g = DIGITS[ch]
  return (
    <svg data-testid="dg" data-digit={ch} className={`dg${draw ? ' draw' : ''}`} viewBox={`0 0 ${g.w} ${g.h}`} style={{ height, width: (height * g.w) / g.h }} aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={g.w} height={g.h}>
          <path className="pen" d={g.d} pathLength={1} strokeWidth={g.sw} />
        </mask>
      </defs>
      <image href={`/digits/digit-${ch}.png`} width={g.w} height={g.h} mask={`url(#${id})`} />
    </svg>
  )
}

function Colon({ height }: { height: number }) {
  return (
    <svg viewBox="0 0 12 40" style={{ height, width: (height * 12) / 40 }} aria-hidden="true">
      <path
        d="M6 12.5c1.6 0 2.4 1.2 2.2 2.4-.2 1.3-1.6 2-2.8 1.6C4 16 3.6 14.6 4.2 13.6c.4-.7 1-1.1 1.6-1.1zM5.8 27c1.7.1 2.5 1.4 2.2 2.6-.3 1.2-1.7 1.8-2.9 1.4-1.3-.5-1.6-1.9-.9-2.9.4-.7.9-1.1 1.6-1.1z"
        fill="#F5F5F3"
      />
    </svg>
  )
}

export default function DrawnNumber({ text, height = 40 }: { text: string; height?: number }) {
  const still = !!useReducedMotion()
  const prev = useRef<string | null>(null)
  const before = prev.current
  // Remembered after commit, so StrictMode's double render (development) sees the same "before" both times.
  useEffect(() => {
    prev.current = text
  }, [text])
  return (
    <div className="drawn-number" role="img" aria-label={text}>
      {[...text].map((ch, i) =>
        ch === ':' ? (
          <Colon key={`${i}:`} height={height} />
        ) : DIGITS[ch] ? (
          <Digit key={`${i}:${ch}`} ch={ch} height={height} draw={!still && (before === null || before.length !== text.length || before[i] !== ch)} />
        ) : null,
      )}
    </div>
  )
}
