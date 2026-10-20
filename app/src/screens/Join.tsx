import { useEffect, useState } from 'react'
import { call } from '../game/api'
import { currentPushEnv, pushSupport } from '../spike/push'
import { loadSession, saveSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'

export default function Join({ code }: { code: string }) {
  const [name, setName] = useState('')
  const [conduct, setConduct] = useState(false)
  const [waiver, setWaiver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // iPhone alerts only work from the Home Screen app, which has its own storage — join there, not in Safari.
  const iphoneNotInstalled = pushSupport(currentPushEnv()) === 'needs-install'

  // Already joined on this phone? Go straight back into the game.
  useEffect(() => {
    if (loadSession(localStorage, code).token) window.location.assign(`/g/${code}`)
  }, [code])

  async function join() {
    setBusy(true)
    setError('')
    try {
      const { token } = await call<{ token: string }>('join', { code, name: name.trim(), accepted: true })
      saveSession(localStorage, code, { token })
      window.location.assign(`/g/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow={`kejar. · join game ${code}`}>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
        Ready to
        <br />
        run?
      </h1>
      {iphoneNotInstalled && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>On iPhone, add to Home Screen first</p>
          <ol className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
            <li>Tap Share in Safari, then Add to Home Screen.</li>
            <li>Open kejar. from the new icon.</li>
            <li>{`Join there with code ${code} — that's how you get check-in alerts.`}</li>
          </ol>
          <p className="muted" style={{ marginTop: 8 }}>
            Joining here in Safari works, but you won&apos;t get alerts.
          </p>
        </div>
      )}
      <label className="eyebrow" htmlFor="name">
        Your name
      </label>
      <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={conduct} onChange={(e) => setConduct(e.target.checked)} />
        <span>No grabbing, no tackling. One hand, arm only. “Stop” means stop.</span>
      </label>
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
        <span>I accept the waiver and share my location during this game only.</span>
      </label>
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!name.trim() || !conduct || !waiver || busy} onClick={join}>
        {busy ? 'Joining…' : 'Join game'}
      </button>
    </Screen>
  )
}
