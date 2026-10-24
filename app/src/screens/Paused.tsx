import type { View } from '../../shared/views.js'
import { clock } from '../game/time'
import { Screen } from '../game/ui'

/** Shown to players while a marshal has the game paused; the clock stays frozen. */
export default function Paused({ view }: { view: View }) {
  return (
    <Screen eyebrow="Paused">
      <div style={{ textAlign: 'center', marginTop: 48 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Game paused</h1>
        <p className="mono" style={{ fontSize: 56, fontWeight: 500, letterSpacing: '-0.06em', color: 'var(--volt)' }}>
          {clock((view.endsAt ?? view.now) - view.now)}
        </p>
        <p className="muted">Stay where you are. A marshal will restart the game.</p>
      </div>
    </Screen>
  )
}
