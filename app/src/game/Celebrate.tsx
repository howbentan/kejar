import * as m from 'motion/react-m'

export type Spot = { x: number; y: number; kind: 'star' | 'dot'; white?: boolean; size: number }

/**
 * Sparkles for a reward moment (the lucky dip, a catch): doodle four-point stars and dots, lime and white, that pop
 * out one after another and then stay still, so nothing loops. `spots` are relative to the positioned parent.
 */
export function Sparkles({ spots, delayMs = 0 }: { spots: Spot[]; delayMs?: number }) {
  return (
    <>
      {spots.map((s, k) => (
        <m.span
          key={k}
          className="spark"
          aria-hidden="true"
          style={{ left: s.x, top: s.y, width: s.size, height: s.size, color: s.white ? 'var(--white)' : 'var(--volt)' }}
          initial={{ scale: 0, opacity: 0, rotate: -30 }}
          animate={{ scale: [0, 1.35, 1], opacity: 1, rotate: 0 }}
          transition={{ delay: delayMs / 1000 + 0.08 * k, duration: 0.35 }}
        >
          {s.kind === 'star' ? (
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path d="M12 1 C13 9 15 11 23 12 C15 13 13 15 12 23 C11 15 9 13 1 12 C9 11 11 9 12 1 Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" width="100%" height="100%">
              <circle cx="5" cy="5" r="5" fill="currentColor" />
            </svg>
          )}
        </m.span>
      ))}
    </>
  )
}

/** One lime ring that kicks out from its parent as something lands, then fades. */
export function Shockwave({ delayMs = 0, radius = 20 }: { delayMs?: number; radius?: number }) {
  return (
    <m.span
      className="shock"
      aria-hidden="true"
      style={{ borderRadius: radius }}
      initial={{ scale: 1, opacity: 0 }}
      animate={{ scale: 1.55, opacity: [0, 0.9, 0] }}
      transition={{ delay: delayMs / 1000, duration: 0.6, ease: 'easeOut' }}
    />
  )
}
