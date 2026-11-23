import { useEffect, useState } from 'react'
import { call } from '../game/api'
import { currentPushEnv, pushSupport } from '../game/push'
import { forgetName, loadName, saveName } from '../game/nameMemory'
import { loadSession, saveSession } from '../game/session'
import { loadOrganiserSession } from '../game/organiserSession'
import { ErrorText, Screen } from '../game/ui'
import { Busy } from '../game/Runner'

export default function Join({ code }: { code: string }) {
  const [remembered, setRemembered] = useState(() => loadName(localStorage))
  const [name, setName] = useState(remembered)
  const [conduct, setConduct] = useState(false)
  const [waiver, setWaiver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // iPhone alerts only work from the Home Screen app, which has its own storage — join there, not in Safari.
  const iphoneNotInstalled = pushSupport(currentPushEnv()) === 'needs-install'

  // This phone runs this game: joining too would give one phone two roles, and after the start the player would win.
  const [hosting, setHosting] = useState(false)

  // Already joined on this phone? Go straight back into the game.
  useEffect(() => {
    if (loadSession(localStorage, code).token) {
      window.location.assign(`/g/${code}`)
      return
    }
    const organiser = loadOrganiserSession(localStorage)
    if (!organiser) return
    call('state', { code, organiserToken: organiser.organiserToken }).then(
      () => setHosting(true),
      () => undefined,
    )
  }, [code])

  if (hosting) {
    return (
      <Screen eyebrow={`kejar. · join game ${code}`}>
        <p className="muted">{`This phone is running game ${code}, so it can't join as a player too. Join from another phone.`}</p>
        <a className="btn" href={`/host/${code}`}>
          Back to the lobby
        </a>
      </Screen>
    )
  }

  async function join() {
    setBusy(true)
    setError('')
    try {
      const { token } = await call<{ token: string }>('join', { code, name: name.trim(), accepted: true })
      saveSession(localStorage, code, { token })
      saveName(localStorage, name)
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
            <li>{`Join there with code ${code} . That's how you get check-in alerts.`}</li>
          </ol>
          <p className="muted" style={{ marginTop: 8 }}>
            Joining here in Safari works, but you won&apos;t get alerts.
          </p>
        </div>
      )}
      <label className="eyebrow" htmlFor="name">
        Your name
      </label>
      <div style={{ position: 'relative' }}>
        <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} style={remembered && name === remembered ? { paddingRight: 84 } : undefined} />
        {remembered && name === remembered && (
          <button
            type="button"
            className="name-forget"
            onClick={() => {
              forgetName(localStorage)
              setRemembered('')
              setName('')
            }}
          >
            not you?
          </button>
        )}
      </div>
      {remembered && name === remembered && <p className="name-remembered">✓ remembered from your last game</p>}
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={conduct} onChange={(e) => setConduct(e.target.checked)} />
        <span>No grabbing, no tackling. One hand, arm only. “Stop” means stop.</span>
      </label>
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
        <span>I accept the waiver and share my location during this game only.</span>
      </label>
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!name.trim() || !conduct || !waiver || busy} aria-busy={busy || undefined} onClick={join}>
        <Busy busy={busy} label="Joining">Join</Busy>
      </button>
    </Screen>
  )
}
