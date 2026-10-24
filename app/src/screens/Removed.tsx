import { Screen } from '../game/ui'

export default function Removed() {
  return (
    <Screen eyebrow="kejar.">
      <div style={{ textAlign: 'center', marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>A marshal removed you from this game</h1>
        <p className="muted">Please leave the play area. Talk to a marshal if you think this is a mistake.</p>
        <a className="btn btn-ghost" href="/">
          Home
        </a>
      </div>
    </Screen>
  )
}
