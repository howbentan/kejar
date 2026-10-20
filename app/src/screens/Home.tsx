import { useState } from 'react'
import { Screen, Wordmark } from '../game/ui'

export default function Home() {
  const [code, setCode] = useState('')
  const valid = /^[A-Za-z0-9]{6}$/.test(code)
  return (
    <Screen>
      <Wordmark />
      <p className="muted">Real-life chase, refereed by your phone.</p>
      <label className="eyebrow" htmlFor="code">
        Game code
      </label>
      <input
        id="code"
        className="input mono"
        style={{ letterSpacing: '0.3em', textTransform: 'uppercase' }}
        maxLength={6}
        placeholder="ABC234"
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
      />
      <button className="btn" disabled={!valid} onClick={() => window.location.assign(`/join/${code.toUpperCase()}`)}>
        Join
      </button>
      <a className="muted" href="/host/new" style={{ marginTop: 24 }}>
        Organise a game →
      </a>
    </Screen>
  )
}
