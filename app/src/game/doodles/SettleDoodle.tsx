import { useId } from 'react'

/**
 * Dato Seri's Settle, as a sticker: a doodled identity card with a wrinkly RM100 note tucked under it, the
 * "duit kopi" joke. Generic on purpose: no real emblem, wording or layout, just a blue card, a photo and a chip.
 */
export default function SettleDoodle({ size = 150, className }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const S = '#141414'
  return (
    <svg viewBox="-8 -6 116 116" width={size} height={size} className={className} aria-hidden="true" overflow="visible">
      <defs>
        <filter id={`wob-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={9} />
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
        <g filter={`url(#wob-${id})`}>
          {/* a wrinkly RM100 note, poking out from under the card: crumpled edges, creases, folded corner */}
          <g className="sd-note" transform="rotate(14 66 72)">
            <path d="M34 56 L46 53 L58 57 L70 52 L84 56 L98 53 L96 64 L99 76 L95 88 L82 85 L68 90 L54 86 L40 90 L36 78 L38 66 Z" fill="#9B6BD6" stroke="#141414" strokeWidth="3" strokeLinejoin="round" />
            <path d="M58 57 L54 86 M70 52 L68 90 M38 66 L96 64 M36 78 L99 76" stroke="#7A4BB8" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            <path d="M44 60 L52 66 M80 60 L90 70 M48 82 L56 76" stroke="#C9A8F0" strokeWidth="2" strokeLinecap="round" />
            <circle cx="90" cy="64" r="4.5" fill="#C9A8F0" stroke="#141414" strokeWidth="2" />
            <path d="M90 60.5 q2 3.5 0 7" fill="none" stroke="#7A4BB8" strokeWidth="1.4" strokeLinecap="round" />
            {/* "100", hand-doodled in black marker */}
            <g transform="rotate(-4 68 74)" fill="none" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M58.5 71.5 L61.5 69 L61.2 80.5" />
              <path d="M58.8 80.6 L63.6 80.2" />
              <path d="M68.2 69.4 C64.6 69.6 64.2 80.4 68 80.6 C71.6 80.8 72 69.2 68.2 69.4 Z" />
              <path d="M76.4 69.2 C72.8 69.6 72.6 80.2 76.2 80.4 C79.8 80.6 80.2 69 76.4 69.2 Z" />
            </g>
            <path d="M95 88 L99 76 L90 82 Z" fill="#C9A8F0" stroke="#141414" strokeWidth="2.2" strokeLinejoin="round" />
          </g>
          {/* the identity card */}
          <g transform="rotate(-8 46 44)">
            <rect x="6" y="18" width="78" height="50" rx="7" fill="#7FB3E8" stroke={S} strokeWidth="3" strokeLinejoin="round" />
            <path d="M8 52 Q46 40 82 50 L82 61 Q82 66 77 66 L13 66 Q8 66 8 61 Z" fill="#5C97D6" />
            <path d="M8 26 Q40 20 82 28" stroke="#B5D6F5" strokeWidth="3" fill="none" strokeLinecap="round" />
            <rect x="12" y="30" width="20" height="25" rx="3" fill="#F4F1DE" stroke={S} strokeWidth="2.6" />
            <circle cx="22" cy="39" r="5" fill="#C68B59" stroke={S} strokeWidth="2.2" />
            <path d="M14 54 Q22 44 30 54" fill="#2E2E2E" stroke={S} strokeWidth="2" />
            <rect x="38" y="30" width="13" height="10" rx="2" fill="#F5C518" stroke={S} strokeWidth="2.4" />
            <path d="M38 35 h13 M44.5 30 v10" stroke={S} strokeWidth="1.4" />
            <path d="M38 47 h36 M38 54 h28 M38 60 h32" stroke="#F5F5F3" strokeWidth="3" strokeLinecap="round" />
            <rect x="6" y="18" width="78" height="50" rx="7" fill="none" stroke={S} strokeWidth="3" strokeLinejoin="round" />
          </g>
          <path d="M90 12 L92 17 L97 19 L92 21 L90 26 L88 21 L83 19 L88 17 Z" fill="#FFF3B0" stroke={S} strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 88 h8 M4 96 h10" stroke={S} strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}
