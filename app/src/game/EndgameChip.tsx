import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { View } from '../../shared/views.js'
import EndgameLogo, { ENDGAME_COPY, endgameText, isWanted, wantedLabel } from './EndgameLogo'
import WantedPoster from './WantedPoster'
import ComicPanel from './ComicPanel'
import { clock, useServerNow } from './time'

/** The chip's second line: what to remember about this endgame. */
function chipText(view: View, now: number): string {
  const e = view.endgame!
  if (e.kind === 'banjir') {
    const next = e.flood?.next
    return next ? `Water rises in ${clock(Math.max(0, next.at - now))}` : 'Dry land: last bit'
  }
  if (e.kind === 'bomba') return 'Last call at 1:00'
  if (e.kind === 'pkp') return 'Penjara closed · stations give ×2'
  if (e.kind === 'hebat' && e.wanted) return `Wanted: ${isWanted(view) ? 'You' : wantedLabel(e.wanted)}`
  return ''
}

/**
 * The endgame's comic panel, from the reveal to the end (design 2026-11-24 §3, the sequel to the takeover): its
 * colour, logo and name, the time left and one live line. Tapping it opens the rule card, or Hang Hebat's poster.
 */
export default function EndgameChip({ view, onOpen }: { view: View; onOpen: () => void }) {
  const ticking = useServerNow(view.now)
  const e = view.endgame
  if (!e) return null
  const now = view.paused ? view.now : ticking
  const copy = ENDGAME_COPY[e.kind]
  return (
    <ComicPanel
      big
      colour={copy.colour}
      ink={copy.ink}
      caption={view.endsAt ? `${clock(Math.max(0, view.endsAt - now))} left` : 'endgame'}
      icon={<EndgameLogo kind={e.kind} size={48} tilt={0} />}
      title={copy.name}
      line={chipText(view, now)}
      onClick={onOpen}
    />
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
