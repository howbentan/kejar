import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import MarshalTools from '../game/MarshalTools'
import PingRipple from '../game/PingRipple'
import { useServerNow } from '../game/time'
import { Screen } from '../game/ui'
import { Feed, GameClock } from './RunnerChase'

/** Everyone live, plus the safety tools: alerts, pause and removing players. */
export default function MarshalLive({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const now = useServerNow(view.now)
  const pins = view.alerts.flatMap((a) => (!a.handled && a.where ? [{ id: a.id, ...a.where }] : []))
  return (
    <Screen eyebrow={view.phase === 'hiding' ? 'Marshal · hide phase' : 'Marshal · live'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <GameClock view={view} />
          {view.paused && <span className="pill pill-on">PAUSED</span>}
        </span>
        <span className="muted">
          {view.counts.runnersFree} free · {view.counts.runnersJailed} in jail · {view.counts.chasers} Kejar
        </span>
      </div>
      <PingRipple role="marshal" lastRevealAt={view.lastRevealAt} now={now} />
      <GameMap arena={view.arena} dots={view.dots} stations={view.stations} pins={pins} height={340} />
      <MarshalTools code={code} view={view} refresh={refresh} />
      <Feed view={view} />
    </Screen>
  )
}
