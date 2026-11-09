import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import { Screen } from '../game/ui'
import { Feed } from './RunnerChase'

/**
 * Disqualified for leaving the play area twice (Luar Garisan). Not Penjara: no ticket, no walk, no Settle and
 * nothing to scan. They just watch the round on the delayed spectator map and read the feed.
 */
export default function LuarGarisan({ view }: { view: View }) {
  return (
    <Screen eyebrow="LUAR GARISAN">
      <h1 className="jail-title">
        Luar Garisan<span style={{ color: 'var(--volt)' }}>.</span>
      </h1>
      <p className="muted">Alamak, you left the play area. No winning this round, but you can still play along.</p>
      <GameMap arena={view.arena} dots={view.dots} height={240} />
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
      </p>
      <Feed view={view} />
    </Screen>
  )
}
