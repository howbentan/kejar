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
        <>
          {/* iPhones only send alerts to a site added to the Home Screen and opened from its icon. */}
          <p className="muted">Alerts only reach an iPhone from the Home Screen:</p>
          <ol className="muted" style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Tap Share</li>
            <li>Add to Home Screen</li>
            <li>Open kejar. from the icon</li>
            <li>Tap Turn on</li>
          </ol>
        </>
      )}
      {support === 'denied' && <p className="muted">Notifications are blocked. Allow them in your phone settings.</p>}
      {support === 'unsupported' && <p className="muted">This browser can’t get alerts. Keep the page open at check-ins.</p>}
      {support === 'ok' && (
        <button className="btn" style={{ marginTop: 10 }} onClick={turnOn}>
          Turn on
        </button>
      )}
      <ErrorText>{message}</ErrorText>
    </div>
  )
}
