import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { View } from '../../shared/views.js'
import EndgameLogo, { ENDGAME_COPY, endgameText, isWanted, wantedLabel } from './EndgameLogo'
import WantedPoster from './WantedPoster'

/** The chip's second line: what to remember about this endgame. */
function chipText(view: View): string {
  const e = view.endgame!
  if (e.kind === 'bomba') return 'Last call at 1:00'
  if (e.kind === 'pkp') return 'Penjara closed · stations give ×2'
  if (e.kind === 'hebat' && e.wanted) return `Wanted: ${isWanted(view) ? 'You' : wantedLabel(e.wanted)}`
  return ''
}

/**
 * The status-row chip that stays from the reveal to the end (endgame design §6.4): the endgame's logo and name in
 * its colour on black, and one line. Tapping it opens the rule card, or Hang Hebat's wanted poster.
 */
export default function EndgameChip({ view, onOpen }: { view: View; onOpen: () => void }) {
  const e = view.endgame
  if (!e) return null
  const copy = ENDGAME_COPY[e.kind]
  return (
    <button type="button" className="chip endgame-chip" style={{ borderColor: copy.colour }} onClick={onOpen}>
      <EndgameLogo kind={e.kind} size={22} tilt={0} />
      <b style={{ color: copy.colour }}>{copy.name}</b>
      <span>{chipText(view)}</span>
    </button>
  )
}

/** What the chip opens: the rule card again, or for Hang Hebat the wanted poster. Tap anywhere or Close to go back. */
function EndgameCard({ view, onClose }: { view: View; onClose: () => void }) {
  const e = view.endgame!
  const copy = ENDGAME_COPY[e.kind]
  const hebat = e.kind === 'hebat' && !!e.wanted
  const { rule, line } = endgameText(view)
  // On body, so the status row's stacking (it sits over the map, under the dock) can't clip it.
  return createPortal(
    <div className="endgame-sheet" role="dialog" aria-modal="true" aria-label={hebat ? 'Wanted' : copy.title} onClick={onClose}>
      {hebat ? (
        <WantedPoster view={view} />
      ) : (
        <div className="endgame-card" style={{ borderColor: copy.colour }}>
          <EndgameLogo kind={e.kind} size={90} />
          <p className="endgame-card-title" style={{ color: copy.colour }}>
            {copy.title}
          </p>
          <div className="endgame-panel">
            <b>{rule}</b>
            <span>{line}</span>
          </div>
        </div>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Close
      </button>
    </div>,
    document.body,
  )
}

/** The chip on a chase screen's status row, with the card it opens. */
export function EndgameStatus({ view }: { view: View }) {
  const [open, setOpen] = useState(false)
  if (!view.endgame) return null
  return (
    <>
      <EndgameChip view={view} onOpen={() => setOpen(true)} />
      {open && <EndgameCard view={view} onClose={() => setOpen(false)} />}
    </>
  )
}
