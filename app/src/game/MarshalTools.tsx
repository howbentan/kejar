import { useEffect, useRef, useState } from 'react'
import type { Alert } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { credentials } from './auth'
import { ErrorText, tagText } from './ui'

const KIND_LABEL: Record<Alert['kind'], string> = {
  sos: 'SOS',
  report: 'Report',
  outside: 'Boundary',
  missed: 'Check-ins',
  'left-start': 'Start',
  'flagged-catch': 'Catch',
}

const ago = (at: string, now: number) => {
  const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000))
  return min === 0 ? 'now' : `${min} min ago`
}

/** Pause and resume, the alert list, and removing players (spec §5.1). */
export default function MarshalTools({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  // Buzz when a new SOS comes in: marshals may be looking at the park, not the screen.
  const openSos = view.alerts.filter((a) => a.kind === 'sos' && !a.handled).length
  const lastSos = useRef(openSos)
  useEffect(() => {
    if (openSos > lastSos.current) navigator.vibrate?.([200, 100, 200])
    lastSos.current = openSos
  }, [openSos])

  async function act(action: string, extra: object = {}) {
    setBusy(true)
    setError('')
    try {
      await call(action, { code, ...credentials(code), ...extra })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const open = view.alerts.filter((a) => !a.handled)
  const handled = view.alerts.filter((a) => a.handled)
  const players = view.roster.filter((p) => p.role !== 'marshal' || p.id !== view.me.id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        type="button"
        className={view.paused ? 'btn' : 'btn btn-ghost'}
        disabled={busy}
        onClick={() => act(view.paused ? 'resume' : 'pause')}
      >
        {view.paused ? 'Resume game' : 'Pause game'}
      </button>
      <ErrorText>{error}</ErrorText>

      <p className="eyebrow">Alerts</p>
      {view.alerts.length === 0 ? (
        <p className="muted">No alerts.</p>
      ) : (
        <ul className="alert-list">
          {[...open, ...handled].map((a) => (
            <li key={a.id} className={`alert-row${a.handled ? ' alert-handled' : ''}${a.kind === 'sos' && !a.handled ? ' alert-sos' : ''}`}>
              <div style={{ flex: 1 }}>
                <p className="eyebrow">
                  {KIND_LABEL[a.kind]} · {ago(a.at, view.now)}
                </p>
                <p>{a.text}</p>
              </div>
              {!a.handled && (
                <button type="button" className="btn btn-ghost alert-btn" disabled={busy} onClick={() => act('handleAlert', { eventId: a.id })}>
                  Handled
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="eyebrow">Players</p>
      {removing && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontWeight: 700 }}>{`Remove ${removing.name} from the game?`}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                const id = removing.id
                setRemoving(null)
                act('removePlayer', { playerId: id })
              }}
            >
              Yes, remove
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <table>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.role}</td>
              <td className="mono">{p.role === 'runner' ? tagText(p.tag_id) : ''}</td>
              <td>{p.jailed ? 'in jail' : ''}</td>
              <td style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className="pill"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setRemoving({ id: p.id, name: p.name })}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
