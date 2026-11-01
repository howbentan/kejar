import * as m from 'motion/react-m'
import { useId } from 'react'
import type { PowerUpKind } from '../../shared/types.js'
import { INFO } from './powerInfo'
import { ART } from './stickerArt'

/**
 * A power-up's doodle sticker (motion design §7, power-ups design §5c): hand-drawn wobble, a thick white
 * sticker edge with a drop shadow, a slight tilt. Each sticker defines its own filters, so several on one
 * screen never share ids.
 */
export default function Sticker({ kind, size = 92, tilt = 0, wiggle = false }: { kind: PowerUpKind; size?: number; tilt?: number; wiggle?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const wob = `wob-${id}`
  const stk = `stk-${id}`
  return (
    <m.svg
      role="img"
      aria-label={INFO[kind].name}
      viewBox="-8 -6 116 116"
      width={size}
      height={size}
      animate={wiggle ? { rotate: [0, -6, 5, 0], scale: [1, 1.05, 1.05, 1] } : undefined}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <defs>
        <filter id={wob} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={3.2} />
        </filter>
        <filter id={stk} x="-25%" y="-25%" width="150%" height="150%">
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
      <g filter={`url(#${stk})`}>
        {/* Static drawing markup we made ourselves (stickerArt.ts), never user input. */}
        <g filter={`url(#${wob})`} transform={`rotate(${tilt} 50 55)`} dangerouslySetInnerHTML={{ __html: ART[kind] }} />
      </g>
    </m.svg>
  )
}
