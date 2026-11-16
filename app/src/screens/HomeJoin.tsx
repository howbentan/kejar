import { useState } from 'react'

/** A game code from a scanned QR: a join link (`.../join/ABC234`) or a bare 6-character code. */
export function joinCodeFrom(text: string): string | null {
  const t = text.trim()
  if (/^[A-Za-z0-9]{6}$/.test(t)) return t.toUpperCase()
  try {
    const m = /^\/join\/([A-Za-z0-9]{6})\/?$/.exec(new URL(t).pathname)
    return m ? m[1].toUpperCase() : null
  } catch {
    return null
  }
}

/**
 * The home screen's join step: type the code. Same code box and rules as the old home screen. Scanning the QR is home's
 * green camera button, so it isn't offered here too.
 */
export default function HomeJoin({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('')
  const valid = /^[A-Za-z0-9]{6}$/.test(code)
  const go = (c: string) => window.location.assign(`/join/${c.toUpperCase()}`)

  return (
    <div className="home-actions">
      <p className="eyebrow">JOIN GAME</p>
      <h2 className="home-code-q">
        code<span style={{ color: 'var(--volt)' }}>?</span>
      </h2>
      {/* A form so Enter (or the phone keyboard's Go) joins too; `display: contents` keeps the stack's layout. */}
      <form
        style={{ display: 'contents' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) go(code)
        }}
      >
        <label className="sr-only" htmlFor="code">
          Game code
        </label>
        <input
          id="code"
          className="input mono"
          style={{ letterSpacing: '0.3em', textTransform: 'uppercase', textAlign: 'center' }}
          maxLength={6}
          placeholder="ABC234"
          enterKeyHint="go"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
        />
        <button type="submit" className="btn" disabled={!valid}>
          join
        </button>
      </form>
      <button type="button" className="home-link" onClick={onBack}>
        back
      </button>
    </div>
  )
}
