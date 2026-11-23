import { useEffect, useRef } from 'react'
import Decrypt from './Decrypt'

/** Android buzzes while the card is up: 300 ms on, 200 ms off, 300 ms on, every 2 s. */
const BUZZ = [300, 200, 300]
const BUZZ_EVERY_MS = 2000

/** The Tupperware, drawn plainly: a frosted tub, a red lid with clip tabs, a slip peeking out. */
function Tupper() {
  return (
    <svg viewBox="-8 -6 116 116" width="150" height="150" className="sq-tub" aria-hidden="true" overflow="visible">
      <g stroke="#141414" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M14 46 L86 46 L80 90 Q79 96 72 96 L28 96 Q21 96 20 90 Z" fill="#EAF6FB" />
        <path d="M18 66 L82 66 L80 90 Q79 96 72 96 L28 96 Q21 96 20 90 Z" fill="#CFE9F5" stroke="none" />
        <path d="M54 50 L70 42 L74 50 Z" fill="#FFFFFF" strokeWidth="2.4" />
        <path d="M10 34 Q10 26 18 26 L82 26 Q90 26 90 34 L90 44 L10 44 Z" fill="#E63946" />
        <path d="M10 39 L90 39 L90 44 L10 44 Z" fill="#A4161A" stroke="none" />
        <path d="M3 37 Q3 33 7 33 L11 33 L11 47 L7 47 Q3 47 3 43 Z" fill="#E63946" strokeWidth="2.6" />
        <path d="M97 37 Q97 33 93 33 L89 33 L89 47 L93 47 Q97 47 97 43 Z" fill="#E63946" strokeWidth="2.6" />
      </g>
    </svg>
  )
}

/**
 * The private side quest card: it shows while this side's Tupperware is still out there and the player is near it.
 * It never says where (the server never tells the phone). On Android it buzzes until the player taps Found.
 */
/** The card fades by itself after this long; the chip stays so it can be reopened. */
export const QUEST_SHOW_MS = 8_000

export default function SideQuest({ onFound, onClose, onTimeout }: { onFound: () => void; onClose: () => void; onTimeout?: () => void }) {
  const timeout = useRef(onTimeout)
  timeout.current = onTimeout
  useEffect(() => {
    const id = window.setTimeout(() => timeout.current?.(), QUEST_SHOW_MS)
    return () => window.clearTimeout(id)
  }, [])
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    navigator.vibrate(BUZZ)
    const id = window.setInterval(() => navigator.vibrate(BUZZ), BUZZ_EVERY_MS)
    return () => {
      window.clearInterval(id)
      navigator.vibrate(0)
    }
  }, [])
  return (
    <div className="sq" role="dialog" aria-label="Tupperware">
      <div className="sq-card">
        <button type="button" className="sq-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <p className="sq-eyebrow">
          <Decrypt text="TUPPERWARE" delay={250} duration={700} />
        </p>
        <h2 className="sq-cipher">
          <Decrypt text="Find the Tupperware" delay={0} duration={900} />
        </h2>
        <div className="sq-art">
          <Tupper />
        </div>
        <p className="sq-buzz" aria-hidden="true">
          <span className="dot" aria-hidden="true" />
        </p>
        <button type="button" className="btn sq-found" onClick={onFound}>
          Found
        </button>
      </div>
    </div>
  )
}
