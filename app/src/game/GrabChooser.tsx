import * as m from 'motion/react-m'
import { useState } from 'react'
import type { PowerUpKind } from '../../shared/types.js'
import { call } from './api'
import PowerCard from './PowerCard'
import { INFO } from './powerInfo'
import { loadSession } from './session'
import { ErrorText } from './ui'

type PickResult = { ok: true; kind: PowerUpKind; powerupId: string } | { ok: false; reason: string }

const PICK_REJECTIONS: Record<string, string> = {
  taken: 'Your Abang Grab was taken.',
  'bad-choice': 'Pick one of the three cards',
  'already-used': 'Already used',
  'no-offer': 'Open Abang Grab first to see the cards',
  'not-yours': "That isn't yours",
  'not-chasing': 'Power-ups work during the chase',
  'cannot-use': "You can't use power-ups in Penjara",
  paused: 'Game is paused',
}

/**
 * Abang Grab's chooser (power-ups §6.3, motion design §7b): the top 3 cards of my side's deck, face up. Tapping
 * one keeps it (`grabPick` with its index); the other two go to the bottom of the deck. Closing it keeps the
 * Grab and its offer in the slot, so tapping the slot (or reopening the app) brings the same 3 back.
 */
export default function GrabChooser({
  code,
  powerupId,
  offer,
  onClose,
}: {
  code: string
  powerupId: string
  offer: PowerUpKind[]
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [brought, setBrought] = useState<PowerUpKind | null>(null)
  const [refusal, setRefusal] = useState('')
  const [error, setError] = useState('')

  async function pick(choice: number) {
    if (busy || brought) return
    setBusy(true)
    setError('')
    try {
      const r = await call<PickResult>('grabPick', { code, token: loadSession(localStorage, code).token, powerupId, choice })
      if (r.ok) {
        navigator.vibrate?.([60, 40, 160])
        setBrought(r.kind)
      } else setRefusal(PICK_REJECTIONS[r.reason] ?? 'Nothing brought')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const title = 'What should Abang Grab bring?'
  return (
    <div className="moment grab" role="dialog" aria-modal="true" aria-label={title}>
      {brought ? (
        <>
          <m.div
            className="grab-kept"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <PowerCard kind={brought} wiggle />
          </m.div>
          <h2 className="grab-title" role="status">{`Abang Grab brought ${INFO[brought].name}!`}</h2>
          <p className="muted">The other two went to the bottom of the deck.</p>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </>
      ) : refusal ? (
        <>
          <p role="status" className="moment-line">
            {refusal}
          </p>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            OK
          </button>
        </>
      ) : (
        <>
          <h2 className="grab-title">{title}</h2>
          <p className="muted">Keep one. The other two go to the bottom of the deck.</p>
          <div className="grab-cards">
            {offer.map((kind, i) => (
              <m.button
                key={i}
                type="button"
                className="grab-card"
                aria-label={`Keep ${INFO[kind].name}`}
                disabled={busy}
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.06, duration: 0.3 }}
                onClick={() => pick(i)}
              >
                <PowerCard kind={kind} />
              </m.button>
            ))}
          </div>
          <ErrorText>{error}</ErrorText>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
        </>
      )}
    </div>
  )
}
