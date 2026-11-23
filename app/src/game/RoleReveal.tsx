import * as m from 'motion/react-m'
import { useEffect } from 'react'

const LETTERS = ['k', 'e', 'a', 'r'] as const
/** The j's box inside the 900 x 543 logo frame (the same box the home logo uses). */
const J = { left: (190 / 900) * 100, top: (12 / 543) * 100, w: (326 / 900) * 100, h: (519 / 543) * 100 }
const ORDER = ['k', 'e', 'j', 'a', 'r'] as const
const STEP = 0.14
/** How long each reveal stays before the lobby (and its briefing) comes back. */
export const REVEAL_MS = { runner: 3_600, chaser: 3_000 } as const

/**
 * The role reveal (owner, 2026-11-24): the moment a phone gets its side, "you are" then the logo's letters land one
 * by one, the j dropping into its gap. Kejar is white; Dikejar is volt and "di" writes itself in front of the word.
 * Then the lobby and the briefing carry on as before.
 */
export default function RoleReveal({ side, onDone }: { side: 'runner' | 'chaser'; onDone: () => void }) {
  const runner = side === 'runner'
  const colour = runner ? 'var(--volt)' : 'var(--white)'
  useEffect(() => {
    navigator.vibrate?.(60)
    const t = window.setTimeout(onDone, REVEAL_MS[side])
    return () => window.clearTimeout(t)
  }, [side, onDone])
  return (
    <div className="rv" role="status" aria-label={runner ? 'You are Dikejar' : 'You are Kejar'} onClick={onDone}>
      <m.p className="rv-you" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        you are
      </m.p>
      <div className="rv-row" aria-hidden="true">
        {runner && (
          // A CSS animation (not motion): "di" opens a gap, then writes itself in left to right.
          <span className="rv-di" style={{ color: colour }}>
            <span>di</span>
          </span>
        )}
        <div className="rv-logo" style={{ ['--c' as string]: colour }}>
          {LETTERS.map((l) => (
            <m.span
              key={l}
              className="rv-ltr"
              style={{ ['--m' as string]: `url(/home/letter-${l}.png)` }}
              initial={{ opacity: 0, y: 26, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.35 + ORDER.indexOf(l) * STEP, type: 'spring', stiffness: 520, damping: 18 }}
            />
          ))}
          <m.svg
            className="rv-j"
            viewBox="0 0 326 519"
            style={{ left: `${J.left}%`, top: `${J.top}%`, width: `${J.w}%`, height: `${J.h}%` }}
            initial={{ y: -50, opacity: 0, rotate: -12 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.35 + 2 * STEP, type: 'spring', stiffness: 300, damping: 12 }}
          >
            <ellipse className="s" cx="190" cy="61" rx="59" ry="40" />
            <path className="s" d="M157 156 Q169 200 167 260 L168 338" />
            <path className="s" d="M168 338 Q164 400 144 428 Q122 458 88 460 L22 460" />
            <path className="s" d="M168 338 Q236 326 272 380 Q300 424 302 498" />
          </m.svg>
        </div>
      </div>
      <m.p className="rv-line" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: runner ? 2.3 : 1.4 }}>
        {runner ? 'hide. don’t get caught.' : 'catch every dikejar.'}
      </m.p>
    </div>
  )
}
