import { useCallback, useState } from 'react'
import type { ClaimJudgement } from '../../shared/powerups.js'
import type { PowerUp, PowerUpKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import Scanner from './Scanner'
import { loadSession } from './session'
import { clock } from './time'
import { ErrorText } from './ui'

const INFO: Record<PowerUpKind, { name: string; effect: string; used: string }> = {
  decoy: { name: 'Decoy', effect: 'Your next ping shows a fake spot', used: 'Decoy set for the next ping' },
  shield: { name: 'Shield', effect: 'Blocks the next catch (10 min)', used: 'Shield up for 10 min' },
  cloak: { name: 'Cloak', effect: 'You vanish from the next ping', used: 'Cloak on for the next ping' },
  flare: { name: 'Flare', effect: 'Surprise ping in 30 s', used: 'Flare! Dikejar check in now' },
  focus: { name: 'Focus', effect: 'Dikejar near you shown exactly', used: 'Focus on for the next ping' },
}

type ClaimResult = ({ ok: true; kind: PowerUpKind } | Exclude<ClaimJudgement, { ok: true }>)
type UseResult = { ok: true; kind: PowerUpKind } | { ok: false; reason: string }

const CLAIM_REJECTIONS: Record<string, string> = {
  'too-far': 'Get within 30 m of the station',
  'already-claimed': "You've already used this station",
  'hand-full': 'Your hand is full (3)',
  'unknown-station': "That's not a station code",
  'not-chasing': 'Stations open when the chase starts',
  'cannot-claim': "You can't claim power-ups right now",
  paused: 'Game is paused',
}

const USE_REJECTIONS: Record<string, string> = {
  'too-late': 'Too late for a Flare',
  'already-used': 'Already used',
  'not-chasing': 'Power-ups work during the chase',
  'cannot-use': "You can't use power-ups in jail",
  'not-yours': "That isn't yours",
  paused: 'Game is paused',
}

export function claimMessage(r: ClaimResult): string {
  if (r.ok) return `Got ${INFO[r.kind].name.toUpperCase()} ✓`
  if (r.reason === 'locked') return `Station recharging — ${clock(r.lockedForMs ?? 0)}`
  return CLAIM_REJECTIONS[r.reason] ?? 'Nothing claimed'
}

/** The player's power-ups, plus the button for scanning a station. */
export default function PowerUpHand({ code, view }: { code: string; view: View }) {
  const [scanning, setScanning] = useState(false)
  const [confirm, setConfirm] = useState<PowerUp | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const token = () => loadSession(localStorage, code).token

  const onScan = useCallback(
    async (qr: string) => {
      setScanning(false)
      setError('')
      try {
        const here = await currentCoords()
        setMessage(claimMessage(await call<ClaimResult>('claim', { code, token: loadSession(localStorage, code).token, qr, ...here })))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [code],
  )

  async function use(u: PowerUp) {
    setConfirm(null)
    setError('')
    try {
      const r = await call<UseResult>('usePowerup', { code, token: token(), powerupId: u.id })
      setMessage(r.ok ? INFO[r.kind].used : (USE_REJECTIONS[r.reason] ?? 'Not used'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="eyebrow">Power-ups</p>
        {view.shieldActive && <span className="pill pill-on">Shield active</span>}
      </div>
      {view.hand.length > 0 && (
        <div className="hand">
          {view.hand.map((u) => (
            <button key={u.id} type="button" className="hand-card" onClick={() => setConfirm(u)}>
              <b>{INFO[u.kind].name}</b>
              <span>{INFO[u.kind].effect}</span>
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{`Use ${INFO[confirm.kind].name}?`}</span>
          <button type="button" className="btn" style={{ padding: '10px 16px' }} onClick={() => use(confirm)}>
            {`Use ${INFO[confirm.kind].name}`}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: '10px 16px' }} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p role="status" style={{ fontWeight: 600 }}>
          {message}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {scanning ? (
        <Scanner onResult={onScan} onCancel={() => setScanning(false)} />
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setScanning(true)}>
          Scan station
        </button>
      )}
    </div>
  )
}
