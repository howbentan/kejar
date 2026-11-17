import { useId } from 'react'

const S = '#141414'

export type PenjaraGateState = 'open' | 'locked' | 'closed'

/** A stick figure behind the bars, white like a Dikejar's armband; arms up once the gate opens. */
function Figure({ x, up, flip }: { x: number; up: boolean; flip?: boolean }) {
  const d = flip ? -1 : 1
  return (
    <g transform={`translate(${x} 150)`} stroke="#F5F5F3" strokeWidth={4} strokeLinecap="round" fill="none">
      <circle cx={0} cy={-34} r={8} fill="#0E0E10" />
      <path d="M0 -26 L0 4" />
      {up ? <path d={`M0 -20 L${-12 * d} -38 M0 -20 L${12 * d} -38`} /> : <path d={`M0 -18 L${-9 * d} -2 M0 -18 L${10 * d} -4`} />}
      <path d="M0 4 L-8 26 M0 4 L8 26" />
      <rect x={-5} y={-20} width={10} height={5} rx={2} fill="#F5F5F3" stroke="none" />
    </g>
  )
}

/**
 * Penjara as a sticker doodle: a stone arch, a two-door barred gate, a lime padlock and two Dikejar inside. `open`
 * pops the shackle, drops the lock, swings the doors and throws sparkles (the freed screen). `locked` is Mak Kau
 * Hijau's green chain across a shut gate. `closed` is the plain shut gate. Reduced motion is handled in the CSS.
 */
export default function PenjaraGate({ state, size = 260 }: { state: PenjaraGateState; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const lockFill = state === 'locked' ? '#3FA86B' : '#C6FF3D'
  const bars = (x0: number) => [0, 1, 2].map((i) => x0 + 12 + i * 24)
  const door = (x0: number) => (
    <>
      <rect x={x0} y={56} width={74} height={140} fill="none" />
      {bars(x0).map((x) => (
        <g key={x}>
          <line x1={x} y1={58} x2={x} y2={194} stroke={S} strokeWidth={11} strokeLinecap="round" />
          <line x1={x} y1={58} x2={x} y2={194} stroke="#A7ADB5" strokeWidth={5.5} strokeLinecap="round" />
        </g>
      ))}
      <rect x={x0 + 2} y={68} width={70} height={11} rx={4} fill="#7E848C" stroke={S} strokeWidth={3} />
      <rect x={x0 + 2} y={174} width={70} height={11} rx={4} fill="#7E848C" stroke={S} strokeWidth={3} />
    </>
  )
  return (
    <svg className={`pgate ${state}`} viewBox="-14 -14 228 236" width={size} height={(size * 236) / 228} aria-hidden="true" overflow="visible">
      <defs>
        <filter id={`wob-${id}`} filterUnits="userSpaceOnUse" x={-40} y={-40} width={280} height={300}>
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={5} />
          <feDisplacementMap in="SourceGraphic" scale={3} />
        </filter>
        <filter id={`stk-${id}`} filterUnits="userSpaceOnUse" x={-40} y={-40} width={280} height={300}>
          <feMorphology in="SourceAlpha" operator="dilate" radius={4.5} result="d" />
          <feFlood floodColor="#F5F5F3" />
          <feComposite in2="d" operator="in" result="w" />
          <feOffset in="w" dy={4} result="o" />
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
        <g filter={`url(#wob-${id})`} className="pg-wob">
          {/* the stone arch, and the dark cell behind the gate */}
          <path d="M2 206 L2 66 Q2 -4 100 -4 Q198 -4 198 66 L198 206 Z" fill="#45454B" stroke={S} strokeWidth={4} strokeLinejoin="round" />
          <path d="M20 202 L20 72 Q20 16 100 16 Q180 16 180 72 L180 202 Z" fill="#101013" stroke={S} strokeWidth={3} strokeLinejoin="round" />
          <path d="M4 100 h12 M184 120 h12 M4 154 h12 M184 170 h12" stroke="#2C2C31" strokeWidth={3} strokeLinecap="round" />
          <rect x={52} y={-12} width={96} height={26} rx={6} fill="#F4E3B5" stroke={S} strokeWidth={3.5} />
          <text x={100} y={6.5} textAnchor="middle" fontFamily="Geist, sans-serif" fontWeight={900} fontSize={15} fill={S} letterSpacing="1.5">
            PENJARA
          </text>
          {/* who's inside */}
          <Figure x={70} up={state === 'open'} />
          <Figure x={130} up={state === 'open'} flip />
          {/* the doors */}
          <g className="pg-door-l">{door(26)}</g>
          <g className="pg-door-r">{door(100)}</g>
          {state === 'locked' && (
            <g>
              <path d="M24 74 L176 178 M176 74 L24 178" stroke={S} strokeWidth={12} strokeLinecap="round" />
              <path d="M24 74 L176 178 M176 74 L24 178" stroke="#3FA86B" strokeWidth={6} strokeDasharray="10 6" strokeLinecap="round" />
            </g>
          )}
          {/* the padlock */}
          <g transform="translate(100 126) scale(1.35) translate(-100 -126)">
            <g className="pg-lock">
              <g className="pg-shackle">
                <path d="M88 116 V104 Q100 84 112 104 V116" fill="none" stroke={S} strokeWidth={12} strokeLinecap="round" />
                <path d="M88 116 V104 Q100 84 112 104 V116" fill="none" stroke="#A7ADB5" strokeWidth={6} strokeLinecap="round" />
              </g>
              <rect x={83} y={112} width={34} height={30} rx={7} fill={lockFill} stroke={S} strokeWidth={3.5} />
              <circle cx={100} cy={124} r={4.5} fill={S} />
              <path d="M100 126 L100 134" stroke={S} strokeWidth={4} strokeLinecap="round" />
            </g>
          </g>
          {/* sparkles once it's open */}
          <path className="pg-spark" d="M38 30 L41 38 L49 41 L41 44 L38 52 L35 44 L27 41 L35 38 Z" fill="#C6FF3D" stroke={S} strokeWidth={2.4} strokeLinejoin="round" />
          <path className="pg-spark" d="M166 24 L168 30 L174 32 L168 34 L166 40 L164 34 L158 32 L164 30 Z" fill="#F5F5F3" stroke={S} strokeWidth={2.4} strokeLinejoin="round" />
          <path className="pg-spark" d="M178 92 L181 100 L189 103 L181 106 L178 114 L175 106 L167 103 L175 100 Z" fill="#C6FF3D" stroke={S} strokeWidth={2.4} strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  )
}
