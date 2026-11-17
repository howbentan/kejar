import { useId } from 'react'
import { useReducedMotion } from 'motion/react'
import { RESCUE_HOLD_MS, keyTurn } from '../../../shared/penjara'

const S = '#141414'

export type RescueLockMode = 'idle' | 'holding' | 'paused' | 'open' | 'snapped'

/** The wobbly outline and the white sticker edge every Penjara doodle shares. */
export function useStickerFilters(): { id: string; defs: React.ReactElement } {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const defs = (
    <defs>
      <filter id={`wob-${id}`} filterUnits="userSpaceOnUse" x={-40} y={-40} width={320} height={340}>
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={8} />
        <feDisplacementMap in="SourceGraphic" scale={3} />
      </filter>
      <filter id={`stk-${id}`} filterUnits="userSpaceOnUse" x={-40} y={-40} width={320} height={340}>
        <feMorphology in="SourceAlpha" operator="dilate" radius={5} result="d" />
        <feFlood floodColor="#F5F5F3" />
        <feComposite in2="d" operator="in" result="w" />
        <feOffset in="w" dy={4.5} result="o" />
        <feFlood floodColor="#000" floodOpacity={0.55} />
        <feComposite in2="o" operator="in" result="sh" />
        <feMerge>
          <feMergeNode in="sh" />
          <feMergeNode in="w" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
  return { id, defs }
}

/**
 * The Penjara padlock face-on with the key in it, the way you'd see your own key. Its head points up at the start and
 * a quarter turn opens it; four marks round the keyhole fill lime as each 5 s click lands, with a little burst. The
 * lock rattles harder the longer it is held. Paused, the marks blink and the key eases back a touch; open, the
 * shackle springs up; snapped, the key breaks. Reduced motion keeps the picture but drops the rattle and the burst.
 */
export default function RescueLock({ heldMs, mode, size = 230 }: { heldMs: number; mode: RescueLockMode; size?: number }) {
  const { id, defs } = useStickerFilters()
  const reduce = useReducedMotion()
  const { notch, angle } = keyTurn(heldMs)
  const shown = mode === 'paused' ? Math.max(0, angle - 3) : mode === 'open' ? 90 : angle
  const cx = 110
  const cy = 174
  const marks = [22.5, 45, 67.5, 90].map((a, i) => {
    const r = (a - 90) * (Math.PI / 180)
    return { x: cx + Math.cos(r) * 72, y: cy + Math.sin(r) * 72, on: i < notch || mode === 'open', i }
  })
  // The lock strains harder as it nears the end: barely a tremble at the start, a real rattle in the last seconds.
  const p = Math.min(1, heldMs / RESCUE_HOLD_MS)
  const shake =
    mode === 'holding' && !reduce
      ? {
          ['--amp' as string]: `${(0.6 + 7 * p * p).toFixed(2)}deg`,
          ['--dx' as string]: `${(2.4 * p * p).toFixed(2)}px`,
          ['--spd' as string]: `${(0.42 - 0.26 * p).toFixed(3)}s`,
        }
      : {}
  return (
    <svg className={`flock ${mode}`} viewBox="-34 -46 288 316" width={size} height={(size * 316) / 288} aria-hidden="true" overflow="visible">
      {defs}
      {/* Penjara behind the lock: the stone arch, the bars and its sign, quieter than the lock in front */}
      <g filter={`url(#stk-${id})`} opacity={0.92}>
        <g filter={`url(#wob-${id})`}>
          <path d="M-26 262 L-26 66 Q-26 -26 110 -26 Q246 -26 246 66 L246 262 Z" fill="#45454B" stroke={S} strokeWidth={4} strokeLinejoin="round" />
          <path d="M-8 258 L-8 72 Q-8 -6 110 -6 Q228 -6 228 72 L228 258 Z" fill="#101013" stroke={S} strokeWidth={3} strokeLinejoin="round" />
          {[8, 40, 72, 148, 180, 212].map((x) => (
            <g key={x}>
              <line x1={x} y1={x < 30 || x > 190 ? 40 : 10} x2={x} y2={252} stroke={S} strokeWidth={11} strokeLinecap="round" />
              <line x1={x} y1={x < 30 || x > 190 ? 40 : 10} x2={x} y2={252} stroke="#7E848C" strokeWidth={5} strokeLinecap="round" />
            </g>
          ))}
          <rect x={-4} y={232} width={228} height={11} rx={4} fill="#5E636A" stroke={S} strokeWidth={3} />
          <rect x={58} y={-42} width={104} height={28} rx={6} fill="#F4E3B5" stroke={S} strokeWidth={3.5} />
          <text x={110} y={-22.5} textAnchor="middle" fontFamily="Geist, sans-serif" fontWeight={900} fontSize={16} fill={S} letterSpacing="1.5">
            PENJARA
          </text>
        </g>
      </g>
      <g className="fl-shake" style={shake}>
        <g filter={`url(#stk-${id})`} transform="translate(110 168) scale(0.8) translate(-110 -150)">
          <g filter={`url(#wob-${id})`}>
            {/* shackle */}
            <g className="fl-shackle">
              <path d="M58 104 V66 Q58 12 110 12 Q162 12 162 66 V104" fill="none" stroke={S} strokeWidth={30} strokeLinecap="round" />
              <path d="M58 104 V66 Q58 12 110 12 Q162 12 162 66 V104" fill="none" stroke="#A7ADB5" strokeWidth={19} strokeLinecap="round" />
              <path d="M70 70 Q74 32 104 26" fill="none" stroke="#D8DCE1" strokeWidth={5} strokeLinecap="round" />
            </g>
            {/* body */}
            <rect x={22} y={92} width={176} height={150} rx={26} fill="#C6FF3D" stroke={S} strokeWidth={5} />
            <path d="M40 112 Q40 104 50 104 H96" stroke="#E6FFA0" strokeWidth={6} strokeLinecap="round" fill="none" />
            <path d="M36 226 Q110 236 184 226" stroke="#9CCC2B" strokeWidth={5} strokeLinecap="round" fill="none" />
            {/* the dashed arc the key head travels, and the four click marks on it */}
            <path d={`M${cx} ${cy - 72} A72 72 0 0 1 ${cx + 72} ${cy}`} fill="none" stroke="#8FBF22" strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />
            {marks.map((m) => (
              <g key={m.i} className={m.on ? 'fl-mark on' : 'fl-mark'}>
                <circle cx={m.x} cy={m.y} r={9} fill={m.on ? S : '#B5E64A'} stroke={S} strokeWidth={3} />
                {m.on && m.i === notch - 1 && mode === 'holding' && !reduce && (
                  <g key={`b${notch}`} className="fl-burst" stroke={S} strokeWidth={3} strokeLinecap="round">
                    <path d={`M${m.x + 10} ${m.y - 10} l6 -6 M${m.x + 13} ${m.y + 2} l8 0 M${m.x + 2} ${m.y - 13} l0 -8`} />
                  </g>
                )}
              </g>
            ))}
            {/* keyhole plate */}
            <circle cx={cx} cy={cy} r={26} fill="#E6FFA0" stroke={S} strokeWidth={4} />
            <circle cx={cx} cy={cy} r={7} fill={S} />
            {/* the key, head-on: its head rotates about the keyhole */}
            {mode !== 'open' && (
              <g className="fl-key" transform={`rotate(${shown} ${cx} ${cy})`}>
                <rect x={cx - 7} y={cy - 32} width={14} height={32} rx={4} fill="#F4E3B5" stroke={S} strokeWidth={3.5} />
                <path d={`M${cx - 20} ${cy - 46} Q${cx - 20} ${cy - 64} ${cx} ${cy - 64} Q${cx + 20} ${cy - 64} ${cx + 20} ${cy - 46} Q${cx + 20} ${cy - 30} ${cx} ${cy - 30} Q${cx - 20} ${cy - 30} ${cx - 20} ${cy - 46} Z`} fill="#F4E3B5" stroke={S} strokeWidth={4} />
                <circle cx={cx} cy={cy - 49} r={5} fill="#101013" stroke={S} strokeWidth={2.5} />
                <path d={`M${cx - 13} ${cy - 46} Q${cx - 12} ${cy - 57} ${cx - 4} ${cy - 59}`} stroke="#FFF8E2" strokeWidth={3} fill="none" strokeLinecap="round" />
                {mode === 'snapped' && <path className="fl-snap" d={`M${cx - 10} ${cy - 30} l20 -6`} stroke={S} strokeWidth={4} strokeLinecap="round" />}
              </g>
            )}
          </g>
        </g>
      </g>
    </svg>
  )
}
