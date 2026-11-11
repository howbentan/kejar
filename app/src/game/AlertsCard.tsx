import { useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentPushEnv, NotificationsDeniedError, pushSupport, subscribe } from './push'
import { loadSession } from './session'
import { ErrorText } from './ui'

/**
 * The "Turn on check-in alerts" prompt. Shown in the lobby, and in the game for a runner whose subscription is gone
 * (a New phone clears it, so the old phone stops buzzing).
 */
export default function AlertsCard({ code, view, onDone }: { code: string; view: View; onDone?: () => void }) {
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  // Runners need alerts for push check-ins; marshals need them for SOS and reports in any mode.
  if (done || (view.settings.checkinMode !== 'push' && view.me.role !== 'marshal') || view.me.push) return null
  const support = pushSupport(currentPushEnv())
  async function turnOn() {
    try {
      const subscription = await subscribe(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      await call('subscribe', { code, token: loadSession(localStorage, code).token, subscription })
      setDone(true)
      onDone?.()
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
      {support === 'unsupported' && <p className="muted">This browser can’t get alerts. Keep the page open at check-ins.</p>}
      {support === 'ok' && (
        <button className="btn" style={{ marginTop: 10 }} onClick={turnOn}>
          Turn on alerts
        </button>
      )}
      <ErrorText>{message}</ErrorText>
    </div>
  )
}
