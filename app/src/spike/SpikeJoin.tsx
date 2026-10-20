import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { readPosition, submitCheckin, type CheckinDb } from './checkin'
import { getDeviceId, platformOf } from './device'
import { currentPushEnv, pushSupport, subscribe } from './push'

const LABEL_KEY = 'kejar.label'

const LOCATION_ERRORS: Record<string, string> = {
  denied: 'Location is blocked for this site. Allow location in your browser settings.',
  unavailable: 'Your phone could not get a location fix.',
  timeout: 'Getting your location took too long.',
  unsupported: 'This browser cannot share location.',
}

function CheckinStatus({ pingId }: { pingId: string }) {
  const [status, setStatus] = useState('Checking in…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pos = await readPosition(navigator.geolocation)
        const result = await submitCheckin(supabase as unknown as CheckinDb, pingId, getDeviceId(localStorage), pos)
        if (cancelled) return
        if (result === 'duplicate') setStatus('Already checked in for this ping.')
        else if ('error' in pos) setStatus(`Checked in, but without a location. ${LOCATION_ERRORS[pos.error]}`)
        else setStatus(`Checked in ✓ (±${Math.round(pos.accuracy_m)} m)`)
      } catch (e) {
        if (!cancelled) setStatus(`Check-in failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pingId])

  return (
    <div className="card">
      <p className="eyebrow">Check-in</p>
      <p style={{ marginTop: 6, fontSize: 18, fontWeight: 600 }}>{status}</p>
    </div>
  )
}

export default function SpikeJoin() {
  const pingId = new URLSearchParams(window.location.search).get('ping')
  const support = pushSupport(currentPushEnv())
  const [label, setLabel] = useState(() => localStorage.getItem(LABEL_KEY) ?? '')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  async function turnOnAlerts() {
    setWorking(true)
    try {
      const subscription = await subscribe(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      const { error } = await supabase.from('spike_devices').upsert({
        id: getDeviceId(localStorage),
        label: label.trim(),
        platform: platformOf(navigator.userAgent),
        subscription,
        active: true,
      })
      if (error) throw new Error(error.message)
      localStorage.setItem(LABEL_KEY, label.trim())
      setMessage('Alerts are on. Lock your phone and wait for a ping.')
    } catch (e) {
      setMessage(`Couldn't turn on alerts: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="screen">
      <p className="eyebrow">kejar. · ping test</p>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>Ping test</h1>

      {pingId && <CheckinStatus pingId={pingId} />}

      {support === 'needs-install' && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>On iPhone, alerts only work from the home screen.</p>
          <ol className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
            <li>Tap the Share button in Safari.</li>
            <li>
              Choose <b>Add to Home Screen</b>.
            </li>
            <li>Open kejar. from the new icon and come back to this page.</li>
          </ol>
        </div>
      )}

      {support === 'denied' && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>Notifications are blocked for this site.</p>
          <p className="muted" style={{ marginTop: 6 }}>
            Open your browser or phone settings, allow notifications for kejar., then reload this page.
          </p>
        </div>
      )}

      {support === 'unsupported' && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>This browser can&apos;t receive alerts.</p>
          <p className="muted" style={{ marginTop: 6 }}>
            Try Chrome on Android, or Safari on iPhone (iOS 16.4 or later).
          </p>
        </div>
      )}

      {support === 'ok' && (
        <>
          <label className="eyebrow" htmlFor="label">
            Name this phone
          </label>
          <input
            id="label"
            className="input"
            placeholder="e.g. Aina iPhone 13"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="btn" disabled={!label.trim() || working} onClick={turnOnAlerts}>
            {working ? 'Turning on…' : 'Turn on alerts'}
          </button>
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </main>
  )
}
