import { Screen } from '../game/ui'

/** The organiser called the game off (cancel design, 2026-11-16): everyone lands here, with no results. */
export default function Cancelled({ code, organiser = false }: { code: string; organiser?: boolean }) {
  return (
    <Screen eyebrow={`kejar. · game ${code.toUpperCase()}`} centred>
      <div style={{ textAlign: 'center', marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>Game cancelled</h1>
        <p className="muted">
          {organiser ? 'You cancelled this game. Nobody gets results this time.' : 'The organiser cancelled this game. Nobody gets results this time.'}
        </p>
        <a className="btn btn-ghost" href="/">
          Home
        </a>
      </div>
    </Screen>
  )
}
