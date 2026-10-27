import type { View } from '../../shared/views.js'
import GameMap from './Map'

/** Before the game: where marshals put each station's QR card, the jail and the start (Plan 4b §5.6). */
export default function SetupMap({ view }: { view: View }) {
  const stations = view.stations ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="eyebrow">Setup: where things go</p>
      <GameMap arena={view.arena} dots={[]} stations={stations} height={260} />
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {stations.map((s) => (
          <li key={s.n}>{`Station ${s.n}`}</li>
        ))}
        <li>Jail</li>
        <li>Start</li>
      </ul>
    </div>
  )
}
