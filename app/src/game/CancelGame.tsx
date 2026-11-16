import { useState } from 'react'
import { call } from './api'
import { loadOrganiserSession } from './organiserSession'
import { Busy } from './Runner'
import { ErrorText } from './ui'

/**
 * The organiser's red Cancel game button (cancel design, 2026-11-16). A first tap only asks; Yes, cancel game calls the
 * game off for everyone, with no results. `onCancelled` runs once the server has done it (refresh the view).
 */
export default function CancelGame({ code, onCancelled }: { code: string; onCancelled: () => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function cancel() {
    setBusy(true)
    setError('')
    try {
      await call('cancelGame', { code, organiserToken: loadOrganiserSession(localStorage)?.organiserToken })
      onCancelled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!asking) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>
        Cancel game
      </button>
    )
  }
  return (
    <div className="card" style={{ display: 'grid', gap: 10, borderColor: 'var(--danger)' }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700 }}>{`Cancel game ${code.toUpperCase()} for everyone?`}</p>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Nobody gets results, and it can&apos;t be undone.
        </p>
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn btn-danger" disabled={busy} aria-busy={busy || undefined} onClick={cancel}>
        <Busy busy={busy} label="Cancelling" colour="var(--white)">
          Yes, cancel game
        </Busy>
      </button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAsking(false)}>
        Keep the game
      </button>
    </div>
  )
}
