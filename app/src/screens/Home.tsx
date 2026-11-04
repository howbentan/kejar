import { useState } from 'react'
import { Screen, Wordmark } from '../game/ui'

export default function Home() {
  const [code, setCode] = useState('')
  const valid = /^[A-Za-z0-9]{6}$/.test(code)
  return (
    <Screen>
      <Wordmark />
      <p className="muted">Real-life chase, refereed by your phone.</p>
      {/* A form so Enter (or the phone keyboard's Go) joins too; `display: contents` keeps Screen's layout. */}
      <form
        style={{ display: 'contents' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) window.location.assign(`/join/${code.toUpperCase()}`)
        }}
      >
        <label className="eyebrow" htmlFor="code">
          Game code
        </label>
        <input
          id="code"
          className="input mono"
          style={{ letterSpacing: '0.3em', textTransform: 'uppercase' }}
          maxLength={6}
          placeholder="ABC234"
          enterKeyHint="go"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
        />
        <button type="submit" className="btn" disabled={!valid}>
          Join
        </button>
      </form>
      <a className="muted" href="/host/new" style={{ marginTop: 24 }}>
        Organise a game →
      </a>
    </Screen>
  )
}
