import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import { Screen } from '../game/ui'
import { Feed } from './RunnerChase'

// Gentler than the catch lines: an auto-jail may not be the runner's fault (motion design §5a).
const MISSED_LINES = ['Your phone went ponteng, bro.', 'Signal hilang, bossku?', 'Kena check in lah, boss.', 'Phone in your pocket too deep.']
const lineFor = (id: string) => MISSED_LINES[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % MISSED_LINES.length]

/** Sent to Penjara for missing two check-ins in a row: says why, and points to a marshal for a phone fault. */
function AutoJailed({ view }: { view: View }) {
  const outForGood = view.me.freed_once
  return (
    <Screen eyebrow="PENJARA · AUTO">
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
        {outForGood ? "That's the game for you." : 'Missed two check-ins.'}
      </h1>
      <p className="muted">
        {outForGood ? 'You were already freed once, so you stay in Penjara until the end. Watch the chase from here.' : lineFor(view.me.id)}
      </p>
      {!outForGood && <p className="muted">Walk to Penjara. A free runner can still break you out — once.</p>}
      <GameMap arena={view.arena} dots={view.dots} height={240} />
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
      </p>
      <p className="card" style={{ fontWeight: 600 }}>
        Phone died or no buzz? Tell a marshal.
      </p>
      <Feed view={view} />
    </Screen>
  )
}

export default function Jail({ view }: { code: string; view: View }) {
  if (view.jailReason === 'missed-checkins') return <AutoJailed view={view} />
  return (
    <Screen eyebrow="Penjara">
      <p className="eyebrow">{view.caughtBy ? `Caught by ${view.caughtBy}` : 'Caught'}</p>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
        Walk to Penjara.
        <br />
        <span className="muted" style={{ fontSize: 22 }}>
          A marshal will give your tag back.
        </span>
      </h1>
      <p className="muted">
        {view.me.freed_once
          ? 'You’ve already been broken out once, so you stay in Penjara this time.'
          : 'A free runner can still break you out — once.'}
      </p>
      <GameMap arena={view.arena} dots={view.dots} height={240} />
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
      </p>
      <Feed view={view} />
    </Screen>
  )
}
