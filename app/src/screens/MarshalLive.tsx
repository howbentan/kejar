import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import PingRipple from '../game/PingRipple'
import { useServerNow } from '../game/time'
import { Screen, tagText } from '../game/ui'
import { Feed, GameClock } from './RunnerChase'

/** Everyone live. SOS, reports, pause and alerts arrive in Plan 3. */
export default function MarshalLive({ view }: { view: View }) {
  const now = useServerNow(view.now)
  return (
    <Screen eyebrow={view.phase === 'hiding' ? 'Marshal · hide phase' : 'Marshal · live'}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <GameClock view={view} />
        <span className="muted">
          {view.counts.runnersFree} free · {view.counts.runnersJailed} in jail · {view.counts.chasers} chasers
        </span>
      </div>
      <PingRipple role="marshal" lastRevealAt={view.lastRevealAt} now={now} />
      <GameMap arena={view.arena} dots={view.dots} height={340} />
      <Feed view={view} />
      {view.roster.length > 0 && (
        <table>
          <tbody>
            {view.roster.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.role}</td>
                <td className="mono">{p.role === 'runner' ? tagText(p.tag_id) : ''}</td>
                <td>{p.jailed ? 'in jail' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Screen>
  )
}
