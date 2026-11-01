import { useState } from 'react'
import type { ClaimJudgement } from '../../shared/powerups.js'
import type { PowerUp, PowerUpKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { loadSession } from './session'
import { clock } from './time'
import { INFO } from './powerInfo'
import { ErrorText } from './ui'

export type ClaimResult = ({ ok: true; kind: PowerUpKind } | Exclude<ClaimJudgement, { ok: true }>)
type UseResult = { ok: true; kind: PowerUpKind } | { ok: false; reason: string; readyInMs?: number }

const CLAIM_REJECTIONS: Record<string, string> = {
  'too-far': 'Get within 30 m of the station.',
  'already-claimed': "You've used this station this game. Try another one.",
  'unknown-station': "That's not a station code",
  'not-chasing': 'Stations open when the chase starts',
  'cannot-claim': "You can't claim power-ups right now",
  paused: 'Game is paused',
}

const USE_REJECTIONS: Record<string, string> = {
  'too-late': 'Too late for Mat Rempit.',
  'already-used': 'Already used',
  'not-chasing': 'Power-ups work during the chase',
  'cannot-use': "You can't use power-ups in Penjara",
  'not-yours': "That isn't yours",
  paused: 'Game is paused',
}

export function claimMessage(r: ClaimResult): string {
  if (r.ok) return `Got ${INFO[r.kind].name} ✓`
  if (r.reason === 'locked') return `This station is cooling down. Ready in ${clock(r.lockedForMs ?? 0)}.`
  if (r.reason === 'hand-full' && r.busyKind) {
    const name = INFO[r.busyKind].name
    return r.busyRunning ? `Your ${name} is still working. Come back when it's done.` : `Your slot is full. Use your ${name} first, then come back.`
  }
  return CLAIM_REJECTIONS[r.reason] ?? 'Nothing claimed'
}

/** The one power-up slot in the dock (Plan B). Stations are scanned with the dock's Scan button. */
export default function PowerUpHand({ code, view }: { code: string; view: View }) {
  const [confirm, setConfirm] = useState<PowerUp | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const token = () => loadSession(localStorage, code).token

  async function use(u: PowerUp) {
    setConfirm(null)
    setError('')
    try {
      const r = await call<UseResult>('usePowerup', { code, token: token(), powerupId: u.id })
      setMessage(
        r.ok
          ? INFO[r.kind].used
          : r.reason === 'flare-cooldown'
            ? `Mat Rempit is ready again in ${clock(r.readyInMs ?? 0)}.`
            : r.reason === 'flare-pending'
              ? `Another Mat Rempit is already on its way. Ready again in ${clock(r.readyInMs ?? 0)}.`
            : (USE_REJECTIONS[r.reason] ?? 'Not used'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deck = view.deckLeft !== null && <small className="slot-deck">{`DECK · ${view.deckLeft} LEFT`}</small>

  return (
    <div className="slot-wrap">
      {(confirm || message || error) && (
        <div className="dock-pop">
          {confirm ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{`Use ${INFO[confirm.kind].name}?`}</span>
              <button type="button" className="btn" style={{ padding: '10px 16px' }} onClick={() => use(confirm)}>
                {`Use ${INFO[confirm.kind].name}`}
              </button>
              <button type="button" className="btn btn-ghost" style={{ padding: '10px 16px' }} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="dock-pop-text" onClick={() => (setMessage(''), setError(''))}>
              {message && <span role="status">{message}</span>}
              <ErrorText>{error}</ErrorText>
            </button>
          )}
        </div>
      )}
      {view.hand.length > 0 ? (
        view.hand.map((u) => (
          <button key={u.id} type="button" className="slot" onClick={() => setConfirm(u)}>
            <span>
              <b>{INFO[u.kind].name}</b>
              <span>{INFO[u.kind].effect}</span>
            </span>
            {deck}
          </button>
        ))
      ) : view.activePowerUp ? (
        <div className="slot live">
          <span>
            <b>{`${INFO[view.activePowerUp].name} is working`}</b>
          </span>
          {deck}
        </div>
      ) : (
        <div className="slot empty">
          <span>Empty slot · scan a station</span>
          {deck}
        </div>
      )}
    </div>
  )
}
