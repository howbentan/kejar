import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import EndgameLogo, { ENDGAME_COPY, endgameText } from './EndgameLogo'
import Marker from './Marker'

/** Once Got it is tapped, this phone has seen this game's endgame: the takeover doesn't come back. */
export const seenKey = (code: string) => `kejar:endgame-seen:${code}`

// Storage can throw (private mode, blocked site data): then the takeover simply shows again next time.
function seen(code: string): boolean {
  try {
    return localStorage.getItem(seenKey(code)) !== null
  } catch {
    return false
  }
}
function markSeen(code: string) {
  try {
    localStorage.setItem(seenKey(code), '1')
  } catch {
    // Nothing to keep it in: Got it still closes it for now.
  }
}

/**
 * The endgame's reveal (endgame design §6.4): like the SOS and Mak Kau Hijau takeovers, the whole screen in the
 * endgame's colour, with its logo, the moment (`10 MINUTES LEFT · ENDGAME`), the title with marker doodles, a black
 * card with the rule and one line, and Got it. Shown once per game per phone, also to a phone that opens Kejar after
 * the reveal. Hang Hebat's wanted runner reads "You're wanted." in place of the rule.
 */
export default function EndgameTakeover({ code, view, onDone }: { code: string; view: View; onDone?: () => void }) {
  const [done, setDone] = useState(() => seen(code))
  const button = useRef<HTMLButtonElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const kind = view.endgame?.kind ?? null
  const showing = !!kind && !done
  useEffect(() => {
    if (!showing) return
    navigator.vibrate?.([200, 80, 200])
    button.current?.focus()
  }, [showing])
  if (!showing) return null

  const copy = ENDGAME_COPY[kind]
  const { rule, line } = endgameText(view)
  const close = () => {
    markSeen(code)
    setDone(true)
    onDone?.()
  }
  return (
    <m.div
      className="endgame-takeover"
      role="alertdialog"
      aria-modal="true"
      aria-label={copy.title}
      style={{ background: copy.colour, color: copy.ink }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <p className="eyebrow">{copy.when}</p>
      <EndgameLogo kind={kind} size={150} />
      <h1 ref={title} className="endgame-title">
        {copy.title}
      </h1>
      <div className="endgame-panel">
        <b>{rule}</b>
        <span>{line}</span>
      </div>
      {/* Black pill in the endgame's colour; Hang Hebat's cream reads better as white on black. */}
      <button ref={button} type="button" className="endgame-pill" style={{ color: kind === 'hebat' ? 'var(--white)' : copy.colour }} onClick={close}>
        Got it
      </button>
      <Marker
        marks={[
          { shape: 'underline', target: title },
          { shape: 'stars', target: title },
        ]}
        colour="black"
        delayMs={150}
      />
    </m.div>
  )
}
