import { useCallback, useState } from 'react'
import { tagIdFromQr } from '../../shared/ids.js'
import type { View } from '../../shared/views.js'
import { currentPushEnv, NotificationsDeniedError, pushSupport, subscribe } from '../spike/push'
import { call } from '../game/api'
import { loadSession } from '../game/session'
import Scanner from '../game/Scanner'
import { ErrorText, Screen, tagText } from '../game/ui'

const ROLE_COPY = {
  runner: 'You’re a Dikejar. Hide when the game starts.',
  chaser: 'You’re a Kejar. Stay put while dikejar hide.',
  marshal: 'You’re a Marshal. Keep everyone safe.',
}

function AlertsCard({ code, view, onDone }: { code: string; view: View; onDone: () => void }) {
  const support = pushSupport(currentPushEnv())
  const [message, setMessage] = useState('')
  // Runners need alerts for push check-ins; marshals need them for SOS and reports in any mode.
  if ((view.settings.checkinMode !== 'push' && view.me.role !== 'marshal') || view.me.push) return null
  async function turnOn() {
    try {
      const subscription = await subscribe(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      await call('subscribe', { code, token: loadSession(localStorage, code).token, subscription })
      onDone()
    } catch (e) {
      setMessage(
        e instanceof NotificationsDeniedError
          ? 'Notifications are blocked. Allow them in your phone settings, then reload.'
          : `Couldn't turn on alerts: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  return (
    <div className="card">
      <p style={{ fontWeight: 600 }}>Turn on check-in alerts</p>
      {support === 'needs-install' && (
        <p className="muted">
          You joined in Safari, so alerts can&apos;t reach this iPhone. Open this page at each check-in (the countdown shows
          when).
        </p>
      )}
      {support === 'denied' && <p className="muted">Notifications are blocked. Allow them in your phone settings.</p>}
      {support === 'unsupported' && <p className="muted">This browser can’t get alerts — keep the page open at check-ins.</p>}
      {support === 'ok' && (
        <button className="btn" style={{ marginTop: 10 }} onClick={turnOn}>
          Turn on alerts
        </button>
      )}
      <ErrorText>{message}</ErrorText>
    </div>
  )
}

export default function Lobby({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const role = view.me.role

  const link = useCallback(
    async (tagId: number | null) => {
      setScanning(false)
      if (tagId === null) return setError('That’s not a Kejar tag')
      try {
        await call('linkTag', { code, token: loadSession(localStorage, code).token, tagId })
        setError('')
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [code, refresh],
  )
  const onScan = useCallback((text: string) => void link(tagIdFromQr(text)), [link])

  return (
    <Screen eyebrow={`kejar. · game ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Hi {view.me.name}</h1>
      <p className="muted">{role ? ROLE_COPY[role] : 'Waiting for the organiser to give you a role…'}</p>

      {role === 'runner' && (
        <div className="card">
          <p className="eyebrow">Your tag</p>
          <p className="mono" style={{ fontSize: 28, fontWeight: 600 }}>
            {tagText(view.me.tag_id)}
          </p>
          {!scanning && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setScanning(true)}>
              {view.me.tag_id === null ? 'Scan your tag' : 'Scan a different tag'}
            </button>
          )}
        </div>
      )}
      {scanning && (
        <Scanner
          onResult={onScan}
          onCancel={() => setScanning(false)}
          numberFallback={{ label: 'Or type the tag number', onNumber: (n) => void link(n) }}
        />
      )}
      <ErrorText>{error}</ErrorText>
      <AlertsCard code={code} view={view} onDone={refresh} />
      <p className="muted">Waiting for the organiser to start the game…</p>
    </Screen>
  )
}
