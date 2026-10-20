import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import { clock, useServerNow } from '../game/time'
import { Screen } from '../game/ui'

export default function Hide({ view }: { view: View }) {
  const now = useServerNow(view.now)
  const left = clock((view.endsAt ?? now) - now)

  if (view.me.role === 'chaser') {
    return (
      <Screen eyebrow="Hide phase · chaser">
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Stay put. Eyes closed.</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Runners are hiding. You&apos;re released in
          </p>
          <p className="mono" style={{ fontSize: 72, fontWeight: 500, letterSpacing: '-0.06em', color: 'var(--volt)' }}>
            {left}
          </p>
        </div>
      </Screen>
    )
  }

  return (
    <Screen eyebrow="Hide phase">
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        Chasers are released in
      </p>
      <p className="mono" style={{ fontSize: 72, fontWeight: 500, letterSpacing: '-0.06em', textAlign: 'center' }}>
        {left}
      </p>
      <GameMap arena={view.arena} dots={view.dots} height={260} />
      <p className="muted">Put your phone on silent — a buzz can give you away. Pocket it once you&apos;re hidden.</p>
    </Screen>
  )
}
