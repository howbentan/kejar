import { useId } from 'react'

/**
 * The Tupperware as a power-up sticker (the same treatment as Sticker.tsx): a hand-drawn wobble, a thick white sticker
 * edge, a drop shadow, a slight tilt. A frosted tub, a red lid with clip tabs, a folded slip peeking out. `open` marks
 * the lid `.tw-lid.open`, which the unlock takeover's styles send flying. Ported from the Tupperware mockup.
 */
export default function Tupper({ size = 120, open = false, className, tilt = -4 }: { size?: number; open?: boolean; className?: string; tilt?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const S = '#141414'
  return (
    <svg viewBox="-8 -6 116 116" width={size} height={size} className={className} aria-hidden="true" overflow="visible">
      <defs>
        <filter id={`wob-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={3.2} />
        </filter>
        <filter id={`stk-${id}`} x="-25%" y="-25%" width="150%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={4.5} result="d" />
          <feFlood floodColor="#F5F5F3" />
          <feComposite in2="d" operator="in" result="w" />
          <feOffset in="w" dy={3.5} result="o" />
          <feFlood floodColor="#000" floodOpacity={0.55} />
          <feComposite in2="o" operator="in" result="sh" />
          <feMerge>
            <feMergeNode in="sh" />
            <feMergeNode in="w" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#stk-${id})`}>
        <g filter={`url(#wob-${id})`} transform={`rotate(${tilt} 50 55)`}>
          {/* the tub: frosted plastic, a soft blue tint, a shine streak, a little embossed rim */}
          <path d="M14 46 L86 46 L80 90 Q79 96 72 96 L28 96 Q21 96 20 90 Z" fill="#EAF6FB" stroke={S} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M18 66 L82 66 L80 90 Q79 96 72 96 L28 96 Q21 96 20 90 Z" fill="#CFE9F5" />
          <path d="M14 46 L86 46 L80 90 Q79 96 72 96 L28 96 Q21 96 20 90 Z" fill="none" stroke={S} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M23 52 L27 86" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M18 54 h64" stroke="#9CC7DB" strokeWidth="2.2" strokeLinecap="round" />
          {/* a folded slip peeking over the rim */}
          <path d="M54 50 L70 42 L74 50 Z" fill="#FFFFFF" stroke={S} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M60 47 l7 -3" stroke={S} strokeWidth="1.6" strokeLinecap="round" />
          <g className={open ? 'tw-lid open' : 'tw-lid'}>
            {/* the lid: red, a darker band, a shine, clip tabs that stick out */}
            <path d="M10 34 Q10 26 18 26 L82 26 Q90 26 90 34 L90 44 L10 44 Z" fill="#E63946" stroke={S} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M10 39 L90 39 L90 44 L10 44 Z" fill="#B8232F" />
            <path d="M10 34 Q10 26 18 26 L82 26 Q90 26 90 34 L90 44 L10 44 Z" fill="none" stroke={S} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M20 31 Q36 29 52 31" stroke="#FF8A8F" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M3 37 Q3 33 7 33 L11 33 L11 47 L7 47 Q3 47 3 43 Z" fill="#E63946" stroke={S} strokeWidth="2.6" strokeLinejoin="round" />
            <path d="M97 37 Q97 33 93 33 L89 33 L89 47 L93 47 Q97 47 97 43 Z" fill="#E63946" stroke={S} strokeWidth="2.6" strokeLinejoin="round" />
          </g>
          {/* a sparkle, like the other stickers */}
          <path d="M88 10 L90 15 L95 17 L90 19 L88 24 L86 19 L81 17 L86 15 Z" fill="#FFF3B0" stroke={S} strokeWidth="2" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  )
}
